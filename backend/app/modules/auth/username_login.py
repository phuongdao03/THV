"""Password authentication by an existing public handle without email disclosure."""

from typing import Protocol
from uuid import UUID

import httpx
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.errors import (
    InvalidCredentialsError,
    OAuthProviderUnavailableError,
    RateLimitExceededError,
)
from app.modules.auth.firebase_provider import FirebaseClaims
from app.modules.auth.models import AuthIdentity, AuthProvider, User, UserStatus
from app.modules.auth.rate_limit import RegistrationRateLimiter
from app.modules.auth.security import Argon2PasswordHasher
from app.modules.auth.session_service import (
    DUMMY_PASSWORD_HASH,
    ClientMetadata,
    IssuedSession,
)
from app.modules.community.models import CommunityProfile, CommunityUsername
from app.modules.community.usernames import GENERATED_USERNAME


class PasswordGateway(Protocol):
    async def id_token(self, email: str, password: str) -> str: ...


class IdentityVerifier(Protocol):
    async def validate_id_token(self, id_token: str) -> FirebaseClaims: ...


class UsernameSessions(Protocol):
    async def login(
        self, *, email: str, password: str, metadata: ClientMetadata
    ) -> IssuedSession: ...

    async def issue_for_user(
        self, *, user_id: UUID, metadata: ClientMetadata
    ) -> IssuedSession: ...


class FirebasePasswordGateway:
    def __init__(
        self, *, client: httpx.AsyncClient, api_key: str, timeout_seconds: float
    ):
        self._client = client
        self._api_key = api_key
        self._timeout = timeout_seconds

    async def id_token(self, email: str, password: str) -> str:
        if not self._api_key:
            raise OAuthProviderUnavailableError()
        try:
            response = await self._client.post(
                "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword",
                params={"key": self._api_key},
                json={"email": email, "password": password, "returnSecureToken": True},
                timeout=self._timeout,
            )
            if response.status_code == 429:
                raise RateLimitExceededError(retry_after_seconds=60)
            if response.status_code in {400, 401}:
                raise InvalidCredentialsError()
            response.raise_for_status()
            payload = response.json()
            if payload.get("mfaPendingCredential"):
                raise InvalidCredentialsError()
            token = payload.get("idToken")
            if not isinstance(token, str) or not token:
                raise OAuthProviderUnavailableError()
            return token
        except (httpx.HTTPError, ValueError, TypeError, AttributeError) as error:
            raise OAuthProviderUnavailableError() from error


class UsernameLoginService:
    def __init__(
        self,
        *,
        session: AsyncSession,
        sessions: UsernameSessions,
        passwords: PasswordGateway,
        verifier: IdentityVerifier,
        rate_limiter: RegistrationRateLimiter,
    ):
        self._session = session
        self._sessions = sessions
        self._passwords = passwords
        self._verifier = verifier
        self._limiter = rate_limiter
        self._dummy_hasher = Argon2PasswordHasher()

    async def login(
        self, *, username: str, password: str, metadata: ClientMetadata
    ) -> IssuedSession:
        normalized = username.strip().lower()
        await self._limiter.check(email=normalized, client_ip=metadata.client_ip)
        if GENERATED_USERNAME.fullmatch(normalized):
            await self._dummy_hasher.verify(DUMMY_PASSWORD_HASH, password)
            raise InvalidCredentialsError()
        # Release lookup locks before authentication and session issuance.
        async with self._session.begin():
            record = (
                await self._session.execute(
                    select(
                        User.id,
                        User.email,
                        User.password_hash,
                        AuthIdentity.provider_subject,
                    )
                    .join(CommunityProfile, CommunityProfile.user_id == User.id)
                    .outerjoin(
                        CommunityUsername, CommunityUsername.username == normalized
                    )
                    .outerjoin(
                        AuthIdentity,
                        (AuthIdentity.user_id == User.id)
                        & (AuthIdentity.provider == AuthProvider.FIREBASE),
                    )
                    .where(
                        func.lower(CommunityProfile.username) == normalized,
                        or_(
                            CommunityUsername.username.is_(None),
                            and_(
                                CommunityUsername.user_id == User.id,
                                CommunityUsername.retired_at.is_(None),
                            ),
                        ),
                        User.status == UserStatus.ACTIVE,
                        User.email_verified_at.is_not(None),
                        User.disabled_at.is_(None),
                        User.deleted_at.is_(None),
                    )
                )
            ).one_or_none()
        if record is None:
            await self._dummy_hasher.verify(DUMMY_PASSWORD_HASH, password)
            raise InvalidCredentialsError()
        user_id, email, local_hash, subject = record
        if local_hash:
            return await self._sessions.login(
                email=email, password=password, metadata=metadata
            )
        if not subject:
            await self._dummy_hasher.verify(DUMMY_PASSWORD_HASH, password)
            raise InvalidCredentialsError()
        token = await self._passwords.id_token(email, password)
        claims = await self._verifier.validate_id_token(token)
        if (
            not claims.email_verified
            or claims.email.casefold() != email.casefold()
            or claims.subject != subject
        ):
            raise InvalidCredentialsError()
        return await self._sessions.issue_for_user(user_id=user_id, metadata=metadata)
