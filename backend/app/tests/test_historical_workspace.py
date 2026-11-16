import asyncio
from datetime import UTC, datetime
from sqlite3 import Connection
from uuid import uuid4

import pytest
from sqlalchemy import event, func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.db.base import Base
from app.main import app
from app.modules.audit.models import AuditLog
from app.modules.auth.models import User, UserStatus
from app.modules.auth.session_service import AuthPrincipal
from app.modules.historical_nominations.errors import (
    HistoricalNominationForbiddenError,
    HistoricalNominationNotFoundError,
    HistoricalNominationStateError,
    HistoricalNominationValidationError,
)
from app.modules.historical_nominations.models import (
    HistoricalArchiveStatus,
    HistoricalAward,
    HistoricalAwardVerificationStatus,
    HistoricalMediaKind,
    HistoricalMediaLink,
    HistoricalNomination,
    HistoricalNominationPublicationStatus,
    HistoricalNominationStatus,
    HistoricalRelatedPersonRole,
    HistoricalSourceKind,
    HistoricalSubjectType,
)
from app.modules.historical_nominations.schemas import (
    HistoricalAccountLinkWrite,
    HistoricalAwardPatch,
    HistoricalAwardWrite,
    HistoricalNominationPatch,
    HistoricalNominationWrite,
    HistoricalPersonWrite,
    HistoricalPublicContentDraftWrite,
)
from app.modules.historical_nominations.service import HistoricalNominationService
from app.modules.media.models import MediaAsset
from app.modules.public.models import PublicWork


def test_staff_explicitly_links_registered_recipient_without_granting_management() -> (
    None
):
    async def scenario() -> None:
        engine = create_async_engine("sqlite+aiosqlite://")
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        staff_id, recipient_id, stranger_id = uuid4(), uuid4(), uuid4()
        manager = AuthPrincipal(
            user_id=staff_id,
            session_id=uuid4(),
            email="staff@test.example",
            roles=("DATA_MANAGER",),
            permissions=("historical.records.manage", "historical.records.read"),
        )
        recipient = AuthPrincipal(
            user_id=recipient_id,
            session_id=uuid4(),
            email="recipient@test.example",
            roles=("PUBLIC_USER",),
            permissions=(),
        )
        stranger = AuthPrincipal(
            user_id=stranger_id,
            session_id=uuid4(),
            email="stranger@test.example",
            roles=("PUBLIC_USER",),
            permissions=(),
        )
        async with factory() as session:
            session.add_all(
                [
                    User(
                        id=p.user_id,
                        email=p.email,
                        password_hash="unused",
                        status=UserStatus.ACTIVE,
                    )
                    for p in (manager, recipient, stranger)
                ]
            )
            await session.commit()
            service = HistoricalNominationService(session)
            record = await service.create_record(
                manager,
                HistoricalNominationWrite(
                    title="Đề cử cũ", provenance_notes="PRIVATE NOTES"
                ),
                creation_request_id=uuid4(),
            )
            person, _ = await service.add_person(
                manager,
                record.id,
                HistoricalPersonWrite(
                    display_name="Người nhận",
                    email=recipient.email,
                    role=HistoricalRelatedPersonRole.NOMINEE,
                ),
            )
            record_id, person_id = record.id, person.id
            assert person.linked_user_id is None  # Matching email does not link.
            assert (await service.list_linked_records(recipient, page=1, page_size=10))[
                1
            ] == 0
            account = await service.find_linkable_account(
                manager, recipient.email.upper()
            )
            assert account.id == recipient_id
            payload = HistoricalAccountLinkWrite(
                user_id=recipient_id, reason="Đã đối chiếu thông tin người nhận"
            )
            with pytest.raises(HistoricalNominationForbiddenError):
                await service.link_account(recipient, record_id, person_id, payload)
            with pytest.raises(HistoricalNominationForbiddenError):
                await service.find_linkable_account(recipient, recipient.email)
            with pytest.raises(HistoricalNominationNotFoundError):
                await service.link_account(manager, record_id, uuid4(), payload)
            await service.link_account(manager, record_id, person_id, payload)
            await service.link_account(
                manager, record_id, person_id, payload
            )  # Idempotent.
            other_person, _ = await service.add_person(
                manager,
                record_id,
                HistoricalPersonWrite(
                    display_name="Người nhận khác",
                    role=HistoricalRelatedPersonRole.NOMINEE,
                ),
            )
            other_person_id = other_person.id
            for name, award_recipient in (
                ("Bằng của tôi", person_id),
                ("Bằng chung", None),
                ("Bằng người khác", other_person_id),
            ):
                await service.add_award(
                    manager,
                    record_id,
                    HistoricalAwardWrite(
                        award_name=name,
                        recipient_person_id=award_recipient,
                        provenance_notes="PRIVATE AWARD NOTES",
                    ),
                )
            rows, total = await service.list_linked_records(
                recipient, page=1, page_size=10
            )
            assert total == 1 and rows[0].id == record_id
            assert "provenanceNotes" not in rows[0].model_dump(by_alias=True)
            assert {award.award_name for award in rows[0].awards} == {
                "Bằng của tôi",
                "Bằng chung",
            }
            assert "PRIVATE AWARD NOTES" not in rows[0].model_dump_json()
            assert (await service.list_linked_records(stranger, page=1, page_size=10))[
                1
            ] == 0
            with pytest.raises(HistoricalNominationForbiddenError):
                await service.list_people(recipient, record_id)
            with pytest.raises(HistoricalNominationStateError):
                await service.link_account(
                    manager,
                    record_id,
                    person_id,
                    HistoricalAccountLinkWrite(
                        user_id=stranger_id,
                        reason="Không được ghi đè tài khoản đã liên kết",
                    ),
                )
            contact, _ = await service.add_person(
                manager,
                record_id,
                HistoricalPersonWrite(
                    display_name="Liên hệ", role=HistoricalRelatedPersonRole.CONTACT
                ),
            )
            with pytest.raises(HistoricalNominationValidationError):
                await service.link_account(manager, record_id, contact.id, payload)
            user = await session.get(User, stranger_id)
            assert user is not None
            user.status = UserStatus.SUSPENDED
            await session.commit()
            nominee, _ = await service.add_person(
                manager,
                record_id,
                HistoricalPersonWrite(
                    display_name="Người khác", role=HistoricalRelatedPersonRole.NOMINEE
                ),
            )
            with pytest.raises(HistoricalNominationValidationError):
                await service.link_account(
                    manager,
                    record_id,
                    nominee.id,
                    HistoricalAccountLinkWrite(
                        user_id=stranger_id, reason="Tài khoản đã bị đình chỉ hoạt động"
                    ),
                )
            async with session.begin():
                assert (
                    await session.scalar(
                        select(func.count(AuditLog.id)).where(
                            AuditLog.action == "historical_nomination.account_linked"
                        )
                    )
                    == 1
                )
        await engine.dispose()

    asyncio.run(scenario())


def test_historical_record_code_is_thv_and_creation_is_idempotent() -> None:
    async def scenario() -> None:
        engine = create_async_engine("sqlite+aiosqlite://")
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)

        user_id = uuid4()
        manager = AuthPrincipal(
            user_id=user_id,
            session_id=uuid4(),
            email="manager@example.test",
            roles=("DATA_MANAGER",),
            permissions=("historical.records.manage", "historical.records.read"),
        )
        first_key = uuid4()
        async with factory() as session:
            session.add(
                User(
                    id=user_id,
                    email=manager.email,
                    password_hash="unused",
                    status=UserStatus.ACTIVE,
                )
            )
            await session.commit()

            service = HistoricalNominationService(session)
            first = await service.create_record(
                manager,
                HistoricalNominationWrite(),
                creation_request_id=first_key,
            )
            retry = await service.create_record(
                manager,
                HistoricalNominationWrite(),
                creation_request_id=first_key,
            )
            second = await service.create_record(
                manager,
                HistoricalNominationWrite(),
                creation_request_id=uuid4(),
            )

            assert first.code.startswith(f"THV-LS-{first.created_at.year}-")
            assert first.legacy_code is None
            assert retry.id == first.id
            assert retry.code == first.code
            assert second.id != first.id
            assert second.code != first.code
            count = await session.scalar(select(func.count(HistoricalNomination.id)))
            assert count == 2

        await engine.dispose()

    asyncio.run(scenario())


def test_deleting_historical_draft_hides_only_the_source_record() -> None:
    async def scenario() -> None:
        engine = create_async_engine("sqlite+aiosqlite://")
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)

        user_id = uuid4()
        manager = AuthPrincipal(
            user_id=user_id,
            session_id=uuid4(),
            email="manager@example.test",
            roles=("DATA_MANAGER",),
            permissions=("historical.records.manage", "historical.records.read"),
        )
        record = HistoricalNomination(
            id=uuid4(),
            code="THV-LS-2026-0123456789ABCDEF",
            subject_type=HistoricalSubjectType.PERSON,
            subject_name=None,
            title="Hồ sơ chưa đặt tên",
            source_kind=HistoricalSourceKind.OTHER,
            created_by_user_id=user_id,
        )
        award = HistoricalAward(
            id=uuid4(),
            nomination_id=record.id,
            award_name="Bằng xác lập cũ",
            created_by_user_id=user_id,
        )
        published = HistoricalNomination(
            id=uuid4(),
            code="THV-LS-2026-0123456789ABCDE0",
            subject_type=HistoricalSubjectType.PERSON,
            title="Đã công bố",
            source_kind=HistoricalSourceKind.OTHER,
            verification_status=HistoricalNominationStatus.VERIFIED,
            publication_status=HistoricalNominationPublicationStatus.PUBLISHED,
            published_by_user_id=user_id,
            published_at=datetime.now(UTC),
            created_by_user_id=user_id,
        )
        published_id = published.id
        async with factory() as session:
            session.add_all(
                [
                    User(
                        id=user_id,
                        email=manager.email,
                        password_hash="unused",
                        status=UserStatus.ACTIVE,
                    ),
                    record,
                    award,
                    published,
                ]
            )
            await session.commit()
            saved_at = record.updated_at
            published_updated_at = published.updated_at

            deleted = await HistoricalNominationService(session).delete_draft(
                manager,
                record.id,
                expected_updated_at=saved_at,
            )
            assert deleted.deleted_at is not None
            assert await session.get(HistoricalAward, award.id) is not None
            deleted_audit = await session.scalar(
                select(AuditLog).where(
                    AuditLog.resource_id == str(record.id),
                    AuditLog.action == "historical_nomination.draft_deleted",
                )
            )
            assert deleted_audit is not None
            await session.commit()
            visible, total = await HistoricalNominationService(session).list_records(
                manager
            )
            assert [item.id for item in visible] == [published.id]
            assert total == 1
            with pytest.raises(HistoricalNominationNotFoundError):
                await HistoricalNominationService(session).get_record(
                    manager, record.id
                )
            with pytest.raises(HistoricalNominationStateError):
                await HistoricalNominationService(session).delete_draft(
                    manager,
                    published_id,
                    expected_updated_at=published_updated_at,
                )

        await engine.dispose()

    asyncio.run(scenario())


def test_historical_workspace_counts_media_and_awards_by_record() -> None:
    async def scenario() -> None:
        engine = create_async_engine("sqlite+aiosqlite://")
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)

        user_id = uuid4()
        manager = AuthPrincipal(
            user_id=user_id,
            session_id=uuid4(),
            email="manager@example.test",
            roles=("DATA_MANAGER",),
            permissions=("historical.records.read",),
        )
        record = HistoricalNomination(
            id=uuid4(),
            code="THV-LS-2026-0000000000000001",
            subject_type=HistoricalSubjectType.PERSON,
            title="Hồ sơ lưu trữ",
            source_kind=HistoricalSourceKind.ARCHIVE,
            created_by_user_id=user_id,
        )
        award = HistoricalAward(
            id=uuid4(),
            nomination_id=record.id,
            award_name="Bằng lịch sử",
            created_by_user_id=user_id,
        )
        media_kinds = [
            HistoricalMediaKind.PHOTO,
            HistoricalMediaKind.SUPPORTING_DOCUMENT,
            HistoricalMediaKind.AWARD_SCAN,
        ]
        assets = [
            MediaAsset(
                id=uuid4(),
                owner_user_id=user_id,
                cloudinary_public_id=f"historical-{uuid4().hex}",
                resource_type="image",
                access_mode="authenticated",
                original_filename=f"scan-{index}.png",
                mime_type="image/png",
                bytes=10,
            )
            for index in range(len(media_kinds))
        ]
        links = [
            HistoricalMediaLink(
                id=uuid4(),
                nomination_id=record.id,
                media_asset_id=asset.id,
                award_id=award.id if kind is HistoricalMediaKind.AWARD_SCAN else None,
                media_kind=kind,
                attached_by_user_id=user_id,
            )
            for asset, kind in zip(assets, media_kinds, strict=True)
        ]
        async with factory() as session:
            session.add_all(
                [
                    User(
                        id=user_id,
                        email=manager.email,
                        password_hash="unused",
                        status=UserStatus.ACTIVE,
                    ),
                    record,
                    award,
                    *assets,
                    *links,
                ]
            )
            await session.commit()
            counts = await HistoricalNominationService(session).workspace_counts(
                manager,
                [record.id],
            )

            assert counts[record.id] == {
                "media_count": 3,
                "photo_video_count": 1,
                "document_count": 1,
                "award_count": 1,
            }

        await engine.dispose()

    asyncio.run(scenario())


def test_data_manager_save_persists_canonical_fields_and_updates_old_award() -> None:
    async def scenario() -> None:
        engine = create_async_engine("sqlite+aiosqlite://")
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)

        user_id = uuid4()
        manager = AuthPrincipal(
            user_id=user_id,
            session_id=uuid4(),
            email="manager@example.test",
            roles=("DATA_MANAGER",),
            permissions=("historical.records.manage",),
        )
        record = HistoricalNomination(
            id=uuid4(),
            code="HIST-SAVE-001",
            subject_type=HistoricalSubjectType.PERSON,
            subject_name="Nguyễn Văn An",
            title="Hồ sơ đề cử",
            source_kind=HistoricalSourceKind.ARCHIVE,
            created_by_user_id=user_id,
        )
        async with factory() as session:
            session.add_all(
                [
                    User(
                        id=user_id,
                        email=manager.email,
                        password_hash="unused",
                        status=UserStatus.ACTIVE,
                    ),
                    record,
                ]
            )
            await session.commit()

            patch = HistoricalNominationPatch(
                nominationYear=2020,
                title=" ",
                expectedUpdatedAt=record.updated_at,
            )
            changes = patch.model_dump(exclude_unset=True, by_alias=False)
            expected_updated_at = changes.pop("expected_updated_at")
            saved = await HistoricalNominationService(session).patch_record(
                manager,
                record.id,
                changes,
                expected_updated_at=expected_updated_at,
            )
            assert saved.nomination_year == 2020
            assert saved.nominated_at is None
            assert saved.title == "Hồ sơ chưa đặt tên"
            stored_record = await session.get(HistoricalNomination, record.id)
            assert stored_record is not None
            assert stored_record.nomination_year == 2020
            assert stored_record.nominated_at is None

            award = HistoricalAward(
                id=uuid4(),
                nomination_id=record.id,
                award_name="Bằng xác lập",
                created_by_user_id=user_id,
            )
            session.add(award)
            await session.commit()
            stale_timestamp = award.updated_at
            updated_award = await HistoricalNominationService(session).update_award(
                manager,
                record.id,
                award.id,
                HistoricalAwardPatch(
                    expected_updated_at=stale_timestamp,
                    award_name="",
                ),
            )
            assert updated_award.award_name == "Bằng xác lập chưa đặt tên"
            persisted_award = await session.get(HistoricalAward, award.id)
            assert persisted_award is not None
            assert persisted_award.award_name == "Bằng xác lập chưa đặt tên"

            with pytest.raises(HistoricalNominationStateError):
                await HistoricalNominationService(session).update_award(
                    manager,
                    record.id,
                    award.id,
                    HistoricalAwardPatch(
                        expected_updated_at=datetime(2000, 1, 1, tzinfo=UTC),
                        award_name="Bằng cũ",
                    ),
                )

        await engine.dispose()

    asyncio.run(scenario())


def test_dashboard_summary_counts_workflow_states_and_recent_activity() -> None:
    async def scenario() -> None:
        assert app.title
        engine = create_async_engine("sqlite+aiosqlite://")

        @event.listens_for(engine.sync_engine, "connect")
        def _enable_foreign_keys(connection: Connection, _record: object) -> None:
            cursor = connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)

        user_id = uuid4()
        principal = AuthPrincipal(
            user_id=user_id,
            session_id=uuid4(),
            email="manager@example.test",
            roles=("DATA_MANAGER",),
            permissions=("historical.records.read",),
        )
        records = [
            HistoricalNomination(
                id=uuid4(),
                code=f"HIST-{index}",
                subject_type=HistoricalSubjectType.PERSON,
                subject_name=f"Subject {index}",
                title=f"Historical nomination {index}",
                source_kind=HistoricalSourceKind.ARCHIVE,
                created_by_user_id=user_id,
                verification_status=status,
                publication_status=publication_status,
                public_content_approved_by_user_id=(
                    user_id
                    if publication_status
                    is HistoricalNominationPublicationStatus.PUBLISHED
                    else None
                ),
                public_content_approved_at=(
                    datetime.now(UTC)
                    if publication_status
                    is HistoricalNominationPublicationStatus.PUBLISHED
                    else None
                ),
                published_by_user_id=(
                    user_id
                    if publication_status
                    is HistoricalNominationPublicationStatus.PUBLISHED
                    else None
                ),
                published_at=(
                    datetime.now(UTC)
                    if publication_status
                    is HistoricalNominationPublicationStatus.PUBLISHED
                    else None
                ),
                archive_status=HistoricalArchiveStatus.ACTIVE,
            )
            for index, status, publication_status in (
                (
                    1,
                    HistoricalNominationStatus.DRAFT,
                    HistoricalNominationPublicationStatus.PRIVATE,
                ),
                (
                    2,
                    HistoricalNominationStatus.SUBMITTED,
                    HistoricalNominationPublicationStatus.PRIVATE,
                ),
                (
                    3,
                    HistoricalNominationStatus.NEEDS_CORRECTION,
                    HistoricalNominationPublicationStatus.PRIVATE,
                ),
                (
                    4,
                    HistoricalNominationStatus.VERIFIED,
                    HistoricalNominationPublicationStatus.PUBLISHED,
                ),
            )
        ]

        async with factory() as session:
            session.add(
                User(
                    id=user_id,
                    email=principal.email,
                    password_hash="unused",
                    status=UserStatus.ACTIVE,
                )
            )
            session.add_all(records)
            session.add(
                AuditLog(
                    actor_user_id=user_id,
                    action="historical_nomination.submitted",
                    resource_type="historical_nomination",
                    resource_id=str(records[1].id),
                )
            )
            await session.commit()

            summary = await HistoricalNominationService(session).dashboard_summary(
                principal
            )

        assert summary.total_records == 4
        assert summary.draft_count == 1
        assert summary.waiting_review_count == 1
        assert summary.needs_correction_count == 1
        assert summary.verified_count == 1
        assert summary.published_count == 1
        assert summary.recent_activity[0].record_code == records[1].code
        assert summary.recent_activity[0].action == "historical_nomination.submitted"

        unauthorized = AuthPrincipal(
            user_id=user_id,
            session_id=uuid4(),
            email=principal.email,
            roles=("DATA_MANAGER",),
        )
        async with factory() as session:
            with pytest.raises(HistoricalNominationForbiddenError):
                await HistoricalNominationService(session).dashboard_summary(
                    unauthorized
                )

        await engine.dispose()

    asyncio.run(scenario())


def test_public_content_draft_stays_private_and_admin_verifies_legacy_awards() -> None:
    async def scenario() -> None:
        engine = create_async_engine("sqlite+aiosqlite://")
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)

        user_id = uuid4()
        record = HistoricalNomination(
            id=uuid4(),
            code="HIST-DRAFT-001",
            subject_type=HistoricalSubjectType.PERSON,
            subject_name="Historical subject",
            title="Source record",
            source_kind=HistoricalSourceKind.ARCHIVE,
            created_by_user_id=user_id,
        )
        manager = AuthPrincipal(
            user_id=user_id,
            session_id=uuid4(),
            email="manager@example.test",
            roles=("DATA_MANAGER",),
            permissions=(
                "historical.records.read",
                "historical.records.manage",
                "historical.records.submit",
                "historical.documents.manage",
            ),
        )
        async with factory() as session:
            session.add_all(
                [
                    User(
                        id=user_id,
                        email=manager.email,
                        password_hash="unused",
                        status=UserStatus.ACTIVE,
                    ),
                    record,
                ]
            )
            await session.commit()

            draft = await HistoricalNominationService(
                session
            ).save_public_content_draft(
                manager,
                record.id,
                HistoricalPublicContentDraftWrite(
                    title="Proposed public title",
                    short_description="A private proposal for Admin review.",
                ),
            )
            assert draft.status.value == "DRAFT"
            assert draft.revision == 1
            assert await session.scalar(select(PublicWork.id)) is None

            award = HistoricalAward(
                id=uuid4(),
                nomination_id=record.id,
                award_name="Historical award",
                created_by_user_id=user_id,
            )
            session.add(award)
            await session.commit()
            assert (
                award.verification_status
                is HistoricalAwardVerificationStatus.UNVERIFIED
            )

            with pytest.raises(HistoricalNominationForbiddenError):
                await HistoricalNominationService(session).review_award(
                    manager,
                    record.id,
                    award.id,
                    action="VERIFY",
                    reason=None,
                )

            admin = AuthPrincipal(
                user_id=user_id,
                session_id=uuid4(),
                email=manager.email,
                roles=("SUPER_ADMIN",),
            )
            verified_award = await HistoricalNominationService(session).review_award(
                admin,
                record.id,
                award.id,
                action="VERIFY",
                reason=None,
            )
            assert (
                verified_award.verification_status
                is HistoricalAwardVerificationStatus.VERIFIED
            )

        await engine.dispose()

    asyncio.run(scenario())
