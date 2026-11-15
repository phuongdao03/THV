import asyncio
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

import pytest
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.errors import DomainError
from app.db.base import Base
from app.db.outbox import OutboxEvent
from app.modules.affiliate.models import (
    AffiliateCommission,
    AffiliateCommissionRuleSet,
    AffiliateProfile,
)
from app.modules.affiliate.service import AffiliateService
from app.modules.audit.models import AuditLog
from app.modules.audit.service import AuditService
from app.modules.auth import roles as auth_roles
from app.modules.auth.firebase_provider import FirebaseClaims
from app.modules.auth.models import (
    AuthIdentity,
    AuthProvider,
    AuthSession,
    Permission,
    Role,
    StaffInvitation,
    User,
    UserPermission,
    UserRole,
    UserStatus,
)
from app.modules.auth.repositories import AuthRepository
from app.modules.auth.schemas import (
    INTERNAL_MANAGED_ROLES,
    PrivilegedActionRequest,
    RegisterRequest,
    StaffInvitationRequest,
    StaffPermissionReplaceRequest,
)
from app.modules.auth.security import OutboxPayloadCipher, hash_verification_token
from app.modules.auth.session_service import AuthPrincipal
from app.modules.auth.staff_account_service import StaffAccountService
from app.modules.auth.staff_invitation_service import StaffInvitationService
from app.modules.auth.staff_privileged_action_service import (
    StaffPrivilegedActionService,
)
from app.modules.certificates.content_service import CertificateContentService
from app.modules.historical_nominations.import_service import (
    _require_manager as require_historical_import_manager,
)
from app.modules.historical_nominations.service import (
    _require_manager as require_historical_record_manager,
)
from app.modules.public.editor_service import PublicWorkEditorService
from app.modules.public.publication_service import PublicationService
from app.modules.public.taxonomy_service import TaxonomyService

NOW = datetime(2026, 11, 14, 9, tzinfo=UTC)
DATA_MANAGER_PERMISSIONS = {
    "historical.records.read",
    "historical.records.manage",
    "historical.records.submit",
    "historical.documents.manage",
    "public_content.works.manage",
    "certificate_content.edit",
    "certificate_archives.manage",
}


def _admin(user_id=None, email="admin@example.com") -> AuthPrincipal:
    return AuthPrincipal(
        user_id=user_id or uuid4(),
        session_id=uuid4(),
        email=email,
        roles=("SUPER_ADMIN",),
        permissions=("staff.permissions.assign",),
    )


def _cipher() -> OutboxPayloadCipher:
    return OutboxPayloadCipher.from_base64(
        encoded_key="MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA=",
        key_id="test-key",
    )


async def _database(tmp_path: Path, filename: str):
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{(tmp_path / filename).as_posix()}"
    )
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    return engine, async_sessionmaker(engine, expire_on_commit=False)


def test_data_manager_is_fixed_internal_role_and_not_public_registration_role() -> None:
    assert "DATA_MANAGER" in auth_roles.SYSTEM_ROLE_CODES
    assert "DATA_MANAGER" in INTERNAL_MANAGED_ROLES
    manager_permissions = getattr(
        auth_roles, "DATA_MANAGER_PERMISSION_CODES", frozenset()
    )
    assert manager_permissions == frozenset(DATA_MANAGER_PERMISSIONS)
    assert StaffInvitationRequest(email="staff@example.com", role="DATA_MANAGER")

    with pytest.raises(ValidationError):
        RegisterRequest.model_validate(
            {
                "email": "staff@example.com",
                "password": "long-enough-password",
                "accountType": "INDIVIDUAL_APPLICANT",
                "role": "DATA_MANAGER",
            }
        )


def test_data_manager_can_manage_legacy_source_but_not_review_or_issue() -> None:
    manager = AuthPrincipal(
        user_id=uuid4(),
        session_id=uuid4(),
        email="manager@example.com",
        roles=("DATA_MANAGER",),
        permissions=tuple(DATA_MANAGER_PERMISSIONS),
    )

    CertificateContentService._require_content_editor(manager)
    PublicWorkEditorService._require_editor(manager)
    PublicationService._require_work_editor(manager)
    require_historical_record_manager(manager, "historical.records.read")
    require_historical_record_manager(manager, "historical.records.manage")
    require_historical_record_manager(manager, "historical.records.submit")
    with pytest.raises(DomainError):
        PublicationService._require_admin(manager)
    with pytest.raises(DomainError):
        TaxonomyService._require_admin(manager)
    with pytest.raises(DomainError):
        CertificateContentService._require_issue_admin(manager)
    legacy_manager = AuthPrincipal(
        user_id=uuid4(),
        session_id=uuid4(),
        email="legacy-manager@example.com",
        roles=("DATA_MANAGER",),
        permissions=(
            "historical.records.read",
            "historical.records.manage",
            "historical.records.submit",
            "historical.documents.manage",
        ),
    )
    require_historical_record_manager(legacy_manager, "historical.records.read")
    with pytest.raises(DomainError):
        require_historical_import_manager(legacy_manager)


def test_data_manager_invitation_creates_only_the_invited_role_and_revokes_sessions(
    tmp_path: Path,
) -> None:
    async def scenario() -> None:
        engine, factory = await _database(tmp_path, "data-manager-invite.sqlite3")
        admin = _admin()
        async with factory() as session:
            async with session.begin():
                session.add_all(
                    [
                        User(id=admin.user_id, email=admin.email, status="ACTIVE"),
                        Role(code="SUPER_ADMIN"),
                        Role(code="DATA_MANAGER"),
                    ]
                )
            service = StaffInvitationService(
                session=session,
                payload_cipher=_cipher(),
                invitation_ttl=timedelta(hours=24),
                clock=lambda: NOW,
            )
            invitation = await service.create(
                payload=StaffInvitationRequest(
                    email="data.manager@example.com", role="DATA_MANAGER"
                ),
                principal=admin,
                audit=AuditService(session),
                request_id="data-manager-invite",
                user_agent="test",
            )
            event = await session.scalar(
                select(OutboxEvent).where(OutboxEvent.aggregate_id == invitation.id)
            )
            assert event is not None
            token = json.loads(
                _cipher().decrypt(
                    nonce=event.payload_nonce,
                    ciphertext=event.payload_ciphertext,
                    event_type=event.event_type,
                    aggregate_id=event.aggregate_id,
                )
            )["invitation_token"]
            await session.rollback()
            accepted = await service.accept(
                raw_token=token,
                claims=FirebaseClaims(
                    subject="firebase-data-manager",
                    email="data.manager@example.com",
                    email_verified=True,
                    name=None,
                    picture=None,
                ),
                audit=AuditService(session),
                request_id="data-manager-accept",
                user_agent="test",
            )
            assert accepted.role == "DATA_MANAGER"
            assert accepted.status == "ACTIVE"
            role_codes = set(await AuthRepository(session).get_role_codes(accepted.id))
            assert role_codes == {"DATA_MANAGER"}
            assert await session.scalar(select(AuditLog.id)) is not None
        await engine.dispose()

    asyncio.run(scenario())


def test_data_manager_invites_reject_preexisting_roles_in_both_directions(
    tmp_path: Path,
) -> None:
    async def scenario() -> None:
        engine, factory = await _database(tmp_path, "data-manager-mixed-invite.sqlite3")
        admin = _admin()
        async with factory() as session:
            async with session.begin():
                manager = User(
                    email="manager@example.com",
                    status=UserStatus.ACTIVE,
                    email_verified_at=NOW,
                )
                ordinary = User(
                    email="ordinary@example.com",
                    status=UserStatus.ACTIVE,
                    email_verified_at=NOW,
                )
                roles = [
                    Role(code="SUPER_ADMIN"),
                    Role(code="USER"),
                    Role(code="DATA_MANAGER"),
                    Role(code="MODERATOR"),
                ]
                session.add_all(
                    [
                        User(id=admin.user_id, email=admin.email, status="ACTIVE"),
                        manager,
                        ordinary,
                        *roles,
                    ]
                )
                await session.flush()
                by_code = {role.code: role for role in roles}
                session.add_all(
                    [
                        UserRole(
                            user_id=manager.id,
                            role_id=by_code["DATA_MANAGER"].id,
                        ),
                        UserRole(user_id=ordinary.id, role_id=by_code["USER"].id),
                    ]
                )
                manager_id = manager.id
            ordinary_id = ordinary.id
            service = StaffInvitationService(
                session=session,
                payload_cipher=_cipher(),
                invitation_ttl=timedelta(hours=24),
                clock=lambda: NOW,
            )
            for email, role in (
                ("ordinary@example.com", "DATA_MANAGER"),
                ("manager@example.com", "MODERATOR"),
            ):
                with pytest.raises(DomainError) as denied:
                    await service.create(
                        payload=StaffInvitationRequest(email=email, role=role),
                        principal=admin,
                        audit=AuditService(session),
                        request_id="mixed-role-invite",
                        user_agent="test",
                    )
                assert denied.value.code == "STAFF_INVITATION_MIXED_ROLE"

            # Recheck role exclusivity if an assignment races the invitation.
            pending = StaffInvitation(
                email="ordinary@example.com",
                role_code="DATA_MANAGER",
                token_hash=hash_verification_token("data-manager-race-token"),
                expires_at=NOW + timedelta(hours=1),
                created_by_user_id=admin.user_id,
            )
            async with session.begin():
                session.add(pending)
                session.add(
                    AuthIdentity(
                        user_id=ordinary_id,
                        provider=AuthProvider.FIREBASE,
                        provider_subject="firebase-ordinary",
                    )
                )
                session.add(
                    AuthSession(
                        user_id=ordinary_id,
                        refresh_token_hash="b" * 64,
                        expires_at=NOW + timedelta(days=1),
                    )
                )
            claims = FirebaseClaims(
                subject="firebase-ordinary",
                email="ordinary@example.com",
                email_verified=True,
                name=None,
                picture=None,
            )
            with pytest.raises(DomainError) as denied_accept:
                await service.accept(
                    raw_token="data-manager-race-token",
                    claims=claims,
                    audit=AuditService(session),
                    request_id="mixed-role-accept",
                    user_agent="test",
                )
            assert denied_accept.value.code == "STAFF_INVITATION_MIXED_ROLE"

            # Existing DATA_MANAGER accounts cannot accept another staff role either.
            other_invitation = StaffInvitation(
                email="manager@example.com",
                role_code="MODERATOR",
                token_hash=hash_verification_token("moderator-race-token"),
                expires_at=NOW + timedelta(hours=1),
                created_by_user_id=admin.user_id,
            )
            async with session.begin():
                session.add(other_invitation)
            with pytest.raises(DomainError) as denied_existing:
                await service.accept_existing(
                    invitation_id=other_invitation.id,
                    principal=AuthPrincipal(
                        user_id=manager_id,
                        session_id=uuid4(),
                        email="manager@example.com",
                        roles=("DATA_MANAGER",),
                    ),
                    audit=AuditService(session),
                    request_id="manager-accept-other-role",
                    user_agent="test",
                )
            assert denied_existing.value.code == "STAFF_INVITATION_MIXED_ROLE"
        await engine.dispose()

    asyncio.run(scenario())


def test_data_manager_permissions_cannot_be_expanded_by_direct_user_grants(
    tmp_path: Path,
) -> None:
    async def scenario() -> None:
        engine, factory = await _database(tmp_path, "data-manager-permissions.sqlite3")
        admin = _admin()
        target = User(email="manager@example.com", status=UserStatus.ACTIVE)
        async with factory.begin() as session:
            manager_role = Role(code="DATA_MANAGER")
            allowed = Permission(code="certificate_content.edit")
            forbidden = Permission(code="finance.read")
            session.add_all(
                [
                    User(id=admin.user_id, email=admin.email, status=UserStatus.ACTIVE),
                    target,
                    manager_role,
                    allowed,
                    forbidden,
                ]
            )
            await session.flush()
            session.add(UserRole(user_id=target.id, role_id=manager_role.id))
            session.add(
                UserPermission(
                    user_id=target.id,
                    permission_id=forbidden.id,
                    granted_by_user_id=admin.user_id,
                    reason="Legacy direct grant before role restriction",
                    version=1,
                )
            )
        async with factory() as session:
            effective = await AuthRepository(session).get_permission_codes(target.id)
            assert effective == ()
            await session.rollback()
            with pytest.raises(DomainError) as denied:
                await StaffAccountService(session).replace_permissions(
                    user_id=target.id,
                    payload=StaffPermissionReplaceRequest(
                        permissions=["finance.read"],
                        expectedVersion=0,
                        reason="Attempt to grant finance permissions",
                    ),
                    principal=admin,
                    audit=AuditService(session),
                    request_id="manager-permission-denied",
                    user_agent="test",
                )
            assert denied.value.code == "STAFF_DATA_MANAGER_PERMISSION_FORBIDDEN"

            allowed_change = await StaffAccountService(session).replace_permissions(
                user_id=target.id,
                payload=StaffPermissionReplaceRequest(
                    permissions=["certificate_content.edit"],
                    expectedVersion=0,
                    reason="Grant historical record read capability",
                ),
                principal=admin,
                audit=AuditService(session),
                request_id="manager-permission-allowed",
                user_agent="test",
            )
            assert allowed_change.permissions == ("certificate_content.edit",)
        await engine.dispose()

    asyncio.run(scenario())


def test_data_manager_role_change_revokes_sessions_and_preserves_affiliate_history(
    tmp_path: Path,
) -> None:
    async def scenario() -> None:
        engine, factory = await _database(tmp_path, "data-manager-role-change.sqlite3")
        first_admin = _admin(email="first-admin@example.com")
        second_admin = _admin(email="second-admin@example.com")
        target = User(email="reviewer@example.com", status=UserStatus.ACTIVE)
        referred = User(email="referred@example.com", status=UserStatus.ACTIVE)
        now = NOW
        async with factory.begin() as session:
            admin_role = Role(code="SUPER_ADMIN")
            moderator_role = Role(code="MODERATOR")
            manager_role = Role(code="DATA_MANAGER")
            session.add_all(
                [
                    User(
                        id=first_admin.user_id,
                        email=first_admin.email,
                        status="ACTIVE",
                    ),
                    User(
                        id=second_admin.user_id,
                        email=second_admin.email,
                        status="ACTIVE",
                    ),
                    target,
                    referred,
                    admin_role,
                    moderator_role,
                    manager_role,
                ]
            )
            await session.flush()
            session.add_all(
                [
                    UserRole(user_id=first_admin.user_id, role_id=admin_role.id),
                    UserRole(user_id=second_admin.user_id, role_id=admin_role.id),
                    UserRole(user_id=target.id, role_id=moderator_role.id),
                    AuthSession(
                        user_id=target.id,
                        refresh_token_hash="c" * 64,
                        expires_at=now + timedelta(days=1),
                    ),
                ]
            )
            profile = AffiliateProfile(
                user_id=target.id,
                referral_code="THVABC123",
                short_referral_code="THVABC123",
                status="ACTIVE",
            )
            rule_set = AffiliateCommissionRuleSet(
                version_no=1,
                status="PUBLISHED",
                enabled=True,
                attribution_window_days=30,
                hold_days=30,
                level2_enabled=False,
                level2_rate_basis_points=0,
                effective_from=now - timedelta(days=1),
                published_at=now - timedelta(days=1),
            )
            session.add_all([profile, rule_set])
            await session.flush()
            session.add(
                AffiliateCommission(
                    affiliate_user_id=target.id,
                    referred_user_id=referred.id,
                    rule_set_id=rule_set.id,
                    rule_set_version=1,
                    service_code="MEMBERSHIP",
                    source_reference="legacy-affiliate-history-1",
                    amount_minor=100_000,
                    commission_amount_minor=5_000,
                    rate_basis_points=500,
                    commission_level=1,
                    status="ON_HOLD",
                    earned_at=now - timedelta(days=1),
                    hold_until=now + timedelta(days=1),
                )
            )
            target_id = target.id
        async with factory() as session:
            service = StaffPrivilegedActionService(session=session, clock=lambda: now)
            request = await service.request(
                target_user_id=target_id,
                payload=PrivilegedActionRequest(
                    action="ROLE_CHANGE",
                    requestedRole="DATA_MANAGER",
                    reason="Move account into historical data management",
                ),
                principal=first_admin,
                audit=AuditService(session),
                request_id="manager-role-request",
                user_agent="test",
            )
            await service.approve(
                action_id=request.id,
                principal=second_admin,
                audit=AuditService(session),
                request_id="manager-role-approve",
                user_agent="test",
            )
        async with factory() as session:
            role_codes = set(await AuthRepository(session).get_role_codes(target_id))
            assert role_codes == {"DATA_MANAGER"}
            auth_session = await session.scalar(
                select(AuthSession).where(AuthSession.user_id == target_id)
            )
            assert auth_session is not None and auth_session.revoked_at is not None
            assert await session.get(AffiliateProfile, target_id) is not None
            commission = await session.scalar(
                select(AffiliateCommission).where(
                    AffiliateCommission.source_reference == "legacy-affiliate-history-1"
                )
            )
            assert commission is not None
            assert commission.commission_amount_minor == 5_000
            await session.rollback()
            with pytest.raises(DomainError) as denied:
                await AffiliateService(session).ensure_profile(target_id)
            assert denied.value.status_code == 403
        await engine.dispose()

    asyncio.run(scenario())
