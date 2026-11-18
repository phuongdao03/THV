import asyncio
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.db.base import Base
from app.modules.audit.models import AuditLog
from app.modules.auth.models import AccountType, User, UserStatus
from app.modules.auth.session_service import AuthPrincipal
from app.modules.dossiers.errors import (
    ApplicantProfileIncompleteError,
    DossierForbiddenError,
    DossierInvalidStateError,
    DossierNotFoundError,
    DossierValidationError,
)
from app.modules.dossiers.models import (
    Category,
    Dossier,
    DossierEvidence,
    DossierStatus,
    DossierVisibility,
)
from app.modules.dossiers.service import DossierService
from app.modules.dossiers.types import CreateDossier, DossierChanges
from app.modules.media.cleanup import MediaCleanupService
from app.modules.media.gateway import CloudinaryMediaGateway
from app.modules.media.models import MediaAsset, MediaCleanupJob, MediaStatus
from app.modules.media.service import MediaService
from app.modules.media.types import MediaPurpose, UploadIntent
from app.modules.organizations.models import (
    MembershipRole,
    MembershipStatus,
    Organization,
    OrganizationMember,
)
from app.modules.users.models import UserProfile

CATEGORY_ID = UUID("4d28db19-1507-5a45-a50d-cd0aa83029ec")
NOW = datetime(2026, 7, 31, 8, 0, tzinfo=UTC)


async def _build_service() -> tuple[
    DossierService,
    async_sessionmaker[AsyncSession],
    AsyncEngine,
    dict[str, User],
    Organization,
]:
    engine = create_async_engine("sqlite+aiosqlite://")
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    users = {
        name: User(
            id=uuid4(),
            email=f"{name}@cnsgroup.vn",
            password_hash="not-used",
            status=UserStatus.ACTIVE,
        )
        for name in ("owner", "manager", "member", "stranger")
    }
    organization = Organization(
        id=uuid4(),
        code="CNS-LAB",
        legal_name="CNS Lab",
        display_name="CNS Lab",
        owner_user_id=users["manager"].id,
    )
    async with session_factory() as session:
        session.add_all(
            [
                *users.values(),
                Category(
                    id=CATEGORY_ID,
                    code="DIGITAL_INTELLECTUAL_ASSET",
                    name="Tài sản trí tuệ số",
                ),
                organization,
                OrganizationMember(
                    organization_id=organization.id,
                    user_id=users["manager"].id,
                    role_code=MembershipRole.OWNER,
                    status=MembershipStatus.ACTIVE,
                    joined_at=NOW,
                ),
                OrganizationMember(
                    organization_id=organization.id,
                    user_id=users["member"].id,
                    role_code=MembershipRole.MEMBER,
                    status=MembershipStatus.ACTIVE,
                    joined_at=NOW,
                ),
            ]
        )
        await session.commit()

    service = DossierService(
        session=session_factory(),
        clock=lambda: NOW,
        uuid_factory=lambda: UUID("17c53b29-35ea-4fb8-8b64-9c9cd8313c4a"),
    )
    return service, session_factory, engine, users, organization


def _principal(user: User, *roles: str) -> AuthPrincipal:
    return AuthPrincipal(
        user_id=user.id,
        session_id=uuid4(),
        email=user.email,
        roles=roles or ("USER",),
    )


def test_owner_can_create_list_update_and_soft_delete_draft() -> None:
    async def exercise() -> None:
        service, session_factory, engine, users, _ = await _build_service()
        principal = _principal(users["owner"])

        created = await service.create_dossier(
            principal,
            CreateDossier(
                category_id=CATEGORY_ID,
                title="  Bộ nhận diện CNS  ",
                summary="Bản mô tả quyền sở hữu.",
                visibility=DossierVisibility.PRIVATE,
            ),
        )
        assert created.code == "CNS-2026-17C53B2935EA"
        assert created.title == "Bộ nhận diện CNS"
        assert created.status is DossierStatus.DRAFT

        listed = await service.list_dossiers(
            principal,
            status=DossierStatus.DRAFT,
            category_id=CATEGORY_ID,
        )
        assert listed.total == 1
        assert listed.items[0].id == created.id

        updated = await service.update_dossier(
            principal,
            created.id,
            DossierChanges(
                title="Bộ nhận diện CNS Group",
                summary=None,
                provided_fields=frozenset({"title", "summary"}),
            ),
        )
        assert updated.title == "Bộ nhận diện CNS Group"
        assert updated.summary is None

        await service.delete_dossier(principal, created.id)
        with pytest.raises(DossierNotFoundError):
            await service.get_dossier(principal, created.id)
        async with session_factory() as session:
            dossier = await session.get(Dossier, created.id)
            assert dossier is not None
            assert dossier.deleted_at is not None
            assert dossier.deleted_at.replace(tzinfo=UTC) == NOW
            audit_rows = tuple(
                (
                    await session.scalars(
                        select(AuditLog)
                        .where(AuditLog.resource_id == str(created.id))
                        .order_by(AuditLog.created_at, AuditLog.action)
                    )
                ).all()
            )
            assert {row.action for row in audit_rows} == {
                "dossier.created",
                "dossier.deleted",
                "dossier.updated",
            }
            assert all(row.actor_user_id == principal.user_id for row in audit_rows)
            assert all(row.resource_type == "dossier" for row in audit_rows)

        await service.close()
        await engine.dispose()

    asyncio.run(exercise())


def test_draft_cleanup_waits_for_upload_expiry_and_retries_provider() -> None:
    async def exercise() -> None:
        service, sessions, engine, users, _ = await _build_service()
        principal = _principal(users["owner"])
        draft = await service.create_dossier(
            principal,
            CreateDossier(category_id=CATEGORY_ID, title="Storage lifecycle"),
        )
        calls = 0

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal calls
            assert request.method == "POST"
            assert request.url.path.endswith("/raw/destroy")
            calls += 1
            if calls == 1:
                return httpx.Response(503)
            return httpx.Response(200, json={"result": "not found"})

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            gateway = CloudinaryMediaGateway(
                cloud_name="demo", api_key="key", api_secret="secret", client=client
            )
            now = datetime.now(UTC)
            async with sessions() as session:
                media_service = MediaService(
                    session=session,
                    gateway=gateway,
                    environment="local",
                    signature_ttl_seconds=3600,
                    delivery_ttl_seconds=300,
                    avatar_max_bytes=1024,
                    evidence_max_bytes=1024,
                    clock=lambda: now,
                )
                intent = UploadIntent(
                    purpose=MediaPurpose.DOSSIER_EVIDENCE,
                    filename="evidence.docx",
                    mime_type=(
                        "application/vnd.openxmlformats-officedocument"
                        ".wordprocessingml.document"
                    ),
                    size=256,
                    session_id=uuid4(),
                    dossier_id=draft.id,
                )
                with pytest.raises(DossierForbiddenError):
                    await media_service.create_upload_signature(
                        _principal(users["stranger"]), intent
                    )
                issued = await media_service.create_upload_signature(principal, intent)
                await service.delete_dossier(principal, draft.id)
                with pytest.raises(DossierNotFoundError):
                    await media_service.create_upload_signature(principal, intent)

            async with sessions() as session:
                cleanup = MediaCleanupService(session, gateway, environment="local")
                assert await cleanup.process_one()
                assert not await cleanup.process_one()
                assert calls == 0

                async with session.begin():
                    job = await session.scalar(select(MediaCleanupJob))
                    asset = await session.get(MediaAsset, issued.media_id)
                    assert job is not None and asset is not None
                    assert job.media_id == asset.id
                    assert job.next_attempt_at == asset.upload_expires_at
                    assert asset.status is MediaStatus.PENDING
                    expired = now - timedelta(seconds=1)
                    asset.upload_expires_at = expired
                    job.next_attempt_at = expired

                assert await cleanup.process_one()
                async with session.begin():
                    assert job.attempts == 1
                    assert job.finished_at is None
                    assert job.outcome == "PROVIDER_UNAVAILABLE"
                    assert asset.status is MediaStatus.DELETED
                    job.next_attempt_at = expired

                assert await cleanup.process_one()
                assert not await cleanup.process_one()
                assert calls == 2
                assert job.outcome == "DELETED"
                assert job.finished_at is not None
        await service.close()
        await engine.dispose()

    asyncio.run(exercise())


def test_draft_cleanup_preserves_shared_evidence() -> None:
    async def exercise() -> None:
        service, sessions, engine, users, _ = await _build_service()
        principal = _principal(users["owner"])
        draft = await service.create_dossier(
            principal,
            CreateDossier(category_id=CATEGORY_ID, title="Storage lifecycle"),
        )
        media_id = uuid4()
        public_id = (
            f"cns/local/owners/{principal.user_id}/uploads/dossier-evidence/{media_id}"
        )
        async with sessions.begin() as session:
            retained = Dossier(
                id=uuid4(),
                owner_user_id=principal.user_id,
                category_id=CATEGORY_ID,
                code="CNS-TEST-SHARED",
                title="Shared evidence",
                visibility=DossierVisibility.PRIVATE,
            )
            session.add(retained)
            session.add(
                MediaAsset(
                    id=media_id,
                    owner_user_id=principal.user_id,
                    purpose=MediaPurpose.DOSSIER_EVIDENCE,
                    original_filename="photo.jpg",
                    mime_type="image/jpeg",
                    bytes=100,
                    status=MediaStatus.ACTIVE,
                    cloudinary_public_id=public_id,
                    resource_type="image",
                    access_mode="authenticated",
                )
            )
            await session.flush()
            for dossier_id in (draft.id, retained.id):
                session.add(
                    DossierEvidence(
                        dossier_id=dossier_id,
                        media_asset_id=media_id,
                        evidence_type="DOCUMENT",
                        title="Evidence",
                    )
                )
        await service.delete_dossier(principal, draft.id)

        calls = 0

        def destroy(request: httpx.Request) -> httpx.Response:
            nonlocal calls
            calls += 1
            assert request.url.path.endswith("/image/destroy")
            return httpx.Response(200, json={"result": "ok"})

        async with httpx.AsyncClient(transport=httpx.MockTransport(destroy)) as client:
            gateway = CloudinaryMediaGateway(
                cloud_name="demo", api_key="key", api_secret="secret", client=client
            )
            async with sessions() as session:
                cleanup = MediaCleanupService(session, gateway, environment="local")
                assert await cleanup.process_one()
                job = await session.scalar(select(MediaCleanupJob))
                asset = await session.get(MediaAsset, media_id)
                references = (await session.scalars(select(DossierEvidence))).all()
                assert job is not None and job.outcome == "RETAINED"
                assert asset is not None and asset.status is MediaStatus.ACTIVE
                assert [item.dossier_id for item in references] == [retained.id]
                remaining_evidence_id = references[0].id
                assert calls == 0
            await service.remove_evidence(principal, retained.id, remaining_evidence_id)
            async with sessions() as session:
                cleanup = MediaCleanupService(session, gateway, environment="local")
                assert await cleanup.process_one()
                assert calls == 1
                assert await session.scalar(select(DossierEvidence.id)) is None
                asset = await session.get(MediaAsset, media_id)
                assert asset is not None and asset.status is MediaStatus.DELETED
        await service.close()
        await engine.dispose()

    asyncio.run(exercise())


def test_content_admin_can_publish_type_and_applicant_data_is_validated() -> None:
    async def exercise() -> None:
        service, _, engine, users, _ = await _build_service()
        administrator = _principal(users["manager"], "SUPER_ADMIN")
        applicant = _principal(users["owner"], "USER")
        definition = {
            "fields": [
                {
                    "key": "work_name",
                    "type": "text",
                    "label": "Tên tác phẩm",
                    "required": True,
                    "minLength": 3,
                },
                {
                    "key": "format",
                    "type": "select",
                    "label": "Định dạng",
                    "required": True,
                    "options": ["BOOK", "FILM"],
                },
            ],
            "requirements": [{"key": "ownership", "fileRoles": ["OWNERSHIP_PROOF"]}],
            "reviewChecklist": [{"key": "identity", "required": True}],
        }

        dossier_type = await service.create_dossier_type(
            administrator,
            category_id=CATEGORY_ID,
            code="CULTURAL_WORK",
            name="Tác phẩm văn hóa",
            schema=definition,
        )
        assert dossier_type.current_version.version_no == 1
        active_types = await service.list_active_dossier_types(applicant)
        assert active_types[0].id == dossier_type.id

        created = await service.create_dossier(
            applicant,
            CreateDossier(
                category_id=CATEGORY_ID,
                title="Hồ sơ tác phẩm",
                dossier_type_version_id=dossier_type.current_version.id,
                form_data={"work_name": "  Trống đồng  ", "format": "BOOK"},
            ),
        )
        assert created.dossier_type_id == dossier_type.id
        assert created.form_data == {"work_name": "Trống đồng", "format": "BOOK"}

        with pytest.raises(DossierValidationError, match="work_name"):
            await service.create_dossier(
                applicant,
                CreateDossier(
                    category_id=CATEGORY_ID,
                    title="Hồ sơ thiếu dữ liệu",
                    dossier_type_version_id=dossier_type.current_version.id,
                    form_data={"format": "BOOK"},
                ),
            )

        with pytest.raises(DossierForbiddenError):
            await service.create_dossier_type_version(
                applicant,
                dossier_type.id,
                schema=definition,
            )

        await service.close()
        await engine.dispose()

    asyncio.run(exercise())


def test_dossier_and_audit_record_roll_back_together(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def exercise() -> None:
        service, session_factory, engine, users, _ = await _build_service()
        principal = _principal(users["owner"])

        def fail_audit(**_: object) -> None:
            raise RuntimeError("audit storage unavailable")

        monkeypatch.setattr(service._audit_service, "record", fail_audit)
        with pytest.raises(RuntimeError, match="audit storage unavailable"):
            await service.create_dossier(
                principal,
                CreateDossier(
                    category_id=CATEGORY_ID,
                    title="Hồ sơ phải rollback",
                    visibility=DossierVisibility.PRIVATE,
                ),
            )

        async with session_factory() as session:
            assert (await session.scalar(select(Dossier))) is None
            assert (await session.scalar(select(AuditLog))) is None

        await service.close()
        await engine.dispose()

    asyncio.run(exercise())


def test_applicant_must_complete_profile_before_creating_dossier() -> None:
    async def exercise() -> None:
        service, session_factory, engine, users, _ = await _build_service()
        principal = AuthPrincipal(
            user_id=users["owner"].id,
            session_id=uuid4(),
            email=users["owner"].email,
            roles=("USER",),
            account_type=AccountType.INDIVIDUAL_APPLICANT,
        )

        with pytest.raises(ApplicantProfileIncompleteError):
            await service.create_dossier(
                principal,
                CreateDossier(
                    category_id=CATEGORY_ID,
                    title="Profile incomplete",
                ),
            )

        async with session_factory() as session:
            session.add(
                UserProfile(
                    user_id=users["owner"].id,
                    full_name="Applicant owner",
                )
            )
            await session.commit()

        created = await service.create_dossier(
            principal,
            CreateDossier(category_id=CATEGORY_ID, title="Profile complete"),
        )
        assert created.title == "Profile complete"

        await service.close()
        await engine.dispose()

    asyncio.run(exercise())


def test_organization_scope_allows_read_but_only_manager_mutation() -> None:
    async def exercise() -> None:
        service, _, engine, users, organization = await _build_service()
        manager = _principal(users["manager"], "USER")
        created = await service.create_dossier(
            manager,
            CreateDossier(
                category_id=CATEGORY_ID,
                organization_id=organization.id,
                title="Hồ sơ tổ chức",
            ),
        )

        member_view = await service.get_dossier(
            _principal(users["member"]),
            created.id,
        )
        assert member_view.id == created.id
        with pytest.raises(DossierForbiddenError):
            await service.update_dossier(
                _principal(users["member"]),
                created.id,
                DossierChanges(
                    title="Không được phép",
                    provided_fields=frozenset({"title"}),
                ),
            )
        with pytest.raises(DossierForbiddenError):
            await service.get_dossier(
                _principal(users["stranger"]),
                created.id,
            )

        await service.close()
        await engine.dispose()

    asyncio.run(exercise())


def test_invalid_category_role_and_non_editable_state_are_rejected() -> None:
    async def exercise() -> None:
        service, session_factory, engine, users, _ = await _build_service()
        owner = _principal(users["owner"])

        with pytest.raises(DossierNotFoundError):
            await service.create_dossier(
                owner,
                CreateDossier(category_id=uuid4(), title="Sai danh mục"),
            )
        with pytest.raises(DossierForbiddenError):
            await service.create_dossier(
                _principal(users["owner"], "MODERATOR"),
                CreateDossier(category_id=CATEGORY_ID, title="Sai vai trò"),
            )

        created = await service.create_dossier(
            owner,
            CreateDossier(category_id=CATEGORY_ID, title="Đã nộp"),
        )
        async with session_factory() as session:
            async with session.begin():
                dossier = await session.get(Dossier, created.id)
                assert dossier is not None
                dossier._set_status_from_workflow(DossierStatus.SUBMITTED)

        with pytest.raises(DossierInvalidStateError):
            await service.update_dossier(
                owner,
                created.id,
                DossierChanges(
                    title="Không thể sửa",
                    provided_fields=frozenset({"title"}),
                ),
            )
        with pytest.raises(DossierInvalidStateError):
            await service.delete_dossier(owner, created.id)

        await service.close()
        await engine.dispose()

    asyncio.run(exercise())
