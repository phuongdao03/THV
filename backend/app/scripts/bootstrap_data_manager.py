"""Create the single fixed-username DATA_MANAGER account."""

import argparse
import asyncio
from collections.abc import Sequence
from datetime import UTC, datetime
from getpass import getpass
from uuid import UUID

from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.db.session import create_runtime_engine, create_session_factory
from app.modules.auth.models import Role, User, UserRole, UserStatus
from app.modules.auth.roles import DATA_MANAGER_ROLE_CODE
from app.modules.auth.security import Argon2PasswordHasher
from app.modules.community.models import CommunityProfile

EMAIL_ADAPTER = TypeAdapter(EmailStr)
DATA_MANAGER_USERNAME = "data_manager"
MIN_PASSWORD_LENGTH = 12
MAX_PASSWORD_LENGTH = 128
REMOTE_CONFIRMATION = "CREATE_DATA_MANAGER_ACCOUNT"


def validate_credentials(*, email: str, password: str) -> tuple[str, str]:
    try:
        normalized_email = str(EMAIL_ADAPTER.validate_python(email)).lower()
    except ValidationError as exc:
        raise ValueError("A valid account email is required.") from exc
    if not MIN_PASSWORD_LENGTH <= len(password) <= MAX_PASSWORD_LENGTH:
        raise ValueError("Password must contain 12 to 128 characters.")
    return normalized_email, password


def require_confirmation(settings: Settings, confirmation: str | None) -> None:
    if settings.app_env in {"staging", "production"} and (
        confirmation != REMOTE_CONFIRMATION
    ):
        raise RuntimeError(
            f"Staging and production require --confirm {REMOTE_CONFIRMATION}."
        )


async def provision_data_manager(
    session: AsyncSession,
    *,
    email: str,
    password_hash: str,
) -> UUID:
    now = datetime.now(UTC)
    async with session.begin():
        role = await session.scalar(
            select(Role).where(Role.code == DATA_MANAGER_ROLE_CODE)
        )
        if role is None:
            raise RuntimeError(
                "DATA_MANAGER role is unavailable; run database migrations first."
            )

        existing_email = await session.scalar(
            select(User.id).where(User.email == email)
        )
        existing_username = await session.scalar(
            select(CommunityProfile.user_id).where(
                func.lower(CommunityProfile.username) == DATA_MANAGER_USERNAME
            )
        )
        if existing_email is not None:
            raise RuntimeError("The supplied email already belongs to an account.")
        if existing_username is not None:
            raise RuntimeError(
                "The fixed DATA_MANAGER username already exists; refusing to "
                "replace or modify that account."
            )

        user = User(
            email=email,
            password_hash=password_hash,
            status=UserStatus.ACTIVE,
            # This staff account is provisioned by an authorized operator. No
            # verification message is created or sent.
            email_verified_at=now,
        )
        session.add(user)
        await session.flush()
        session.add(
            CommunityProfile(
                user_id=user.id,
                username=DATA_MANAGER_USERNAME,
                display_name="Data Manager",
                professional_links=[],
            )
        )
        session.add(UserRole(user_id=user.id, role_id=role.id))
        await session.flush()
        return user.id


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create the fixed-username DATA_MANAGER account."
    )
    parser.add_argument("--email", required=True)
    parser.add_argument(
        "--confirm",
        help=f"Required for staging and production: {REMOTE_CONFIRMATION}.",
    )
    return parser.parse_args(argv)


async def main(argv: Sequence[str] | None = None) -> None:
    args = parse_args(argv)
    password = getpass("DATA_MANAGER password (12-128 characters): ")
    if password != getpass("Confirm password: "):
        raise ValueError("Password confirmation does not match.")
    email, password = validate_credentials(email=args.email, password=password)
    settings = get_settings()
    require_confirmation(settings, args.confirm)
    password_hash = await Argon2PasswordHasher().hash(password)

    engine = create_runtime_engine(settings)
    try:
        async with create_session_factory(engine)() as session:
            user_id = await provision_data_manager(
                session,
                email=email,
                password_hash=password_hash,
            )
    finally:
        await engine.dispose()
    print(f"DATA_MANAGER account is ready: {DATA_MANAGER_USERNAME} ({user_id}).")


if __name__ == "__main__":
    asyncio.run(main())
