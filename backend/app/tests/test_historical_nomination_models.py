import asyncio
from datetime import datetime
from sqlite3 import Connection
from uuid import UUID, uuid4

import pytest
from sqlalchemy import UniqueConstraint, event, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.db.base import Base
from app.modules.auth.models import User, UserStatus
from app.modules.historical_nominations.models import (
    HistoricalArchiveStatus,
    HistoricalAward,
    HistoricalImportBatch,
    HistoricalImportRow,
    HistoricalMediaAccessScope,
    HistoricalMediaKind,
    HistoricalMediaLink,
    HistoricalNomination,
    HistoricalNominationPartyRole,
    HistoricalNominationPublicationStatus,
    HistoricalNominationStatus,
    HistoricalNominationVersion,
    HistoricalRelatedPerson,
    HistoricalRelatedPersonRole,
    HistoricalSourceKind,
    HistoricalSubjectType,
)
from app.modules.media.models import MediaAsset


async def _database() -> tuple[
    async_sessionmaker[AsyncSession],
    AsyncEngine,
]:
    engine = create_async_engine("sqlite+aiosqlite://")

    @event.listens_for(engine.sync_engine, "connect")
    def _enable_foreign_keys(connection: Connection, _record: object) -> None:
        cursor = connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    return session_factory, engine


def _user() -> User:
    return User(
        id=uuid4(),
        email=f"{uuid4()}@example.test",
        password_hash="not-used",
        status=UserStatus.ACTIVE,
    )


def _nomination(user_id: UUID, *, code: str = "HN-001") -> HistoricalNomination:
    return HistoricalNomination(
        id=uuid4(),
        code=code,
        subject_type=HistoricalSubjectType.PERSON,
        subject_name="Nguyễn Văn An",
        title="Hồ sơ đề cử lịch sử",
        source_kind=HistoricalSourceKind.ARCHIVE,
        created_by_user_id=user_id,
    )


def test_nomination_is_private_draft_with_schema_versioned_extensions() -> None:
    async def exercise() -> None:
        session_factory, engine = await _database()
        actor = _user()
        nomination = _nomination(actor.id)
        nomination.extension_schema_version = 2
        nomination.extension_data_json = {"archiveBox": "A-17"}

        async with session_factory() as session:
            session.add_all([actor, nomination])
            await session.commit()
            stored = await session.scalar(
                select(HistoricalNomination).where(
                    HistoricalNomination.id == nomination.id
                )
            )

        assert stored is not None
        assert stored.verification_status is HistoricalNominationStatus.DRAFT
        assert (
            stored.publication_status is HistoricalNominationPublicationStatus.PRIVATE
        )
        assert stored.extension_schema_version == 2
        assert stored.extension_data_json == {"archiveBox": "A-17"}
        await engine.dispose()

    asyncio.run(exercise())


def test_published_record_requires_actor_and_time_not_admin_approval_state() -> None:
    async def exercise() -> None:
        session_factory, engine = await _database()
        actor = _user()
        invalid = _nomination(actor.id)
        invalid.publication_status = HistoricalNominationPublicationStatus.PUBLISHED

        async with session_factory() as session:
            session.add_all([actor, invalid])
            with pytest.raises(IntegrityError):
                await session.commit()
            await session.rollback()

            unverified = _nomination(actor.id, code="HN-002")
            unverified.publication_status = (
                HistoricalNominationPublicationStatus.PUBLISHED
            )
            unverified.published_by_user_id = actor.id
            unverified.published_at = datetime.now().astimezone()
            session.add_all([actor, unverified])
            await session.commit()

        await engine.dispose()

    asyncio.run(exercise())


def test_archiving_is_auditable_state_and_does_not_delete_the_record() -> None:
    async def exercise() -> None:
        session_factory, engine = await _database()
        actor = _user()
        nomination = _nomination(actor.id)
        nomination.archive_status = HistoricalArchiveStatus.ARCHIVED
        nomination.archived_by_user_id = actor.id
        nomination.archived_at = datetime.now().astimezone()
        nomination.archive_reason = "Duplicate archive record."

        async with session_factory() as session:
            session.add_all([actor, nomination])
            await session.commit()
            stored = await session.scalar(
                select(HistoricalNomination).where(
                    HistoricalNomination.id == nomination.id
                )
            )

        assert stored is not None
        assert stored.archive_status is HistoricalArchiveStatus.ARCHIVED
        assert stored.archived_by_user_id == actor.id
        assert stored.archive_reason == "Duplicate archive record."
        await engine.dispose()

    asyncio.run(exercise())


def test_related_person_is_shared_across_nominations_and_role_is_unique() -> None:
    async def exercise() -> None:
        session_factory, engine = await _database()
        actor = _user()
        person = HistoricalRelatedPerson(
            display_name="Trần Thị Bình",
            created_by_user_id=actor.id,
        )
        first = _nomination(actor.id, code="HN-010")
        second = _nomination(actor.id, code="HN-011")

        async with session_factory() as session:
            session.add_all([actor, person, first, second])
            await session.flush()
            session.add_all(
                [
                    HistoricalNominationPartyRole(
                        nomination_id=first.id,
                        person_id=person.id,
                        role=HistoricalRelatedPersonRole.NOMINATOR,
                        assigned_by_user_id=actor.id,
                    ),
                    HistoricalNominationPartyRole(
                        nomination_id=second.id,
                        person_id=person.id,
                        role=HistoricalRelatedPersonRole.REPRESENTATIVE,
                        assigned_by_user_id=actor.id,
                    ),
                ]
            )
            await session.commit()

            session.add(
                HistoricalNominationPartyRole(
                    nomination_id=first.id,
                    person_id=person.id,
                    role=HistoricalRelatedPersonRole.NOMINATOR,
                    assigned_by_user_id=actor.id,
                )
            )
            with pytest.raises(IntegrityError):
                await session.commit()

        await engine.dispose()

    asyncio.run(exercise())


def test_historical_award_and_media_link_do_not_create_live_certificate() -> None:
    async def exercise() -> None:
        session_factory, engine = await _database()
        actor = _user()
        nomination = _nomination(actor.id)
        person = HistoricalRelatedPerson(
            display_name="Nguyễn Văn An",
            created_by_user_id=actor.id,
        )
        media = MediaAsset(
            id=uuid4(),
            owner_user_id=actor.id,
            cloudinary_public_id=f"test/{uuid4()}",
            resource_type="image",
            access_mode="authenticated",
            original_filename="award-scan.jpg",
            mime_type="image/jpeg",
            bytes=120,
        )

        async with session_factory() as session:
            session.add_all([actor, nomination, person, media])
            await session.flush()
            session.add_all(
                [
                    HistoricalAward(
                        nomination_id=nomination.id,
                        award_name="Bằng xác lập cũ",
                        certificate_number="OLD-1982-17",
                        recipient_person_id=person.id,
                        issued_by="Đơn vị lưu trữ",
                        created_by_user_id=actor.id,
                    ),
                    HistoricalMediaLink(
                        nomination_id=nomination.id,
                        media_asset_id=media.id,
                        media_kind=HistoricalMediaKind.SUPPORTING_DOCUMENT,
                        attached_by_user_id=actor.id,
                    ),
                ]
            )
            await session.commit()
            award = await session.scalar(
                select(HistoricalAward).where(
                    HistoricalAward.nomination_id == nomination.id
                )
            )
            media_link = await session.scalar(
                select(HistoricalMediaLink).where(
                    HistoricalMediaLink.nomination_id == nomination.id
                )
            )
            assert award is not None
            assert award.certificate_number == "OLD-1982-17"
            assert media_link is not None
            assert media_link.access_scope is HistoricalMediaAccessScope.PRIVATE

        forbidden_targets = {"certificates", "payments", "blockchain_transactions"}
        for model in (HistoricalNomination, HistoricalAward, HistoricalMediaLink):
            assert not any(
                foreign_key.column.table.name in forbidden_targets
                for foreign_key in model.__table__.foreign_keys
            )
        assert "certificate_id" not in HistoricalAward.__table__.c
        assert "blockchain_transaction_id" not in HistoricalAward.__table__.c
        await engine.dispose()

    asyncio.run(exercise())


def test_submitted_versions_and_import_rows_have_idempotent_keys() -> None:
    async def exercise() -> None:
        session_factory, engine = await _database()
        actor = _user()
        nomination = _nomination(actor.id)
        batch = HistoricalImportBatch(
            id=uuid4(),
            idempotency_key="file:sha256:batch-001",
            source_file_sha256="a" * 64,
            created_by_user_id=actor.id,
        )
        batch_id = batch.id
        nomination_id = nomination.id

        async with session_factory() as session:
            session.add_all([actor, nomination, batch])
            await session.flush()
            session.add_all(
                [
                    HistoricalNominationVersion(
                        nomination_id=nomination_id,
                        version_no=1,
                        snapshot_json={"title": nomination.title},
                        canonical_hash="b" * 64,
                        submitted_by_user_id=actor.id,
                    ),
                    HistoricalImportRow(
                        batch_id=batch_id,
                        source_row_number=1,
                        idempotency_key="row:1",
                        payload_sha256="c" * 64,
                    ),
                ]
            )
            await session.commit()

            session.add(
                HistoricalNominationVersion(
                    nomination_id=nomination_id,
                    version_no=1,
                    snapshot_json={"title": "Hồ sơ đề cử lịch sử"},
                    canonical_hash="d" * 64,
                    submitted_by_user_id=actor.id,
                )
            )
            with pytest.raises(IntegrityError):
                await session.commit()
            await session.rollback()

            session.add(
                HistoricalImportRow(
                    batch_id=batch_id,
                    source_row_number=1,
                    idempotency_key="row:1",
                    payload_sha256="c" * 64,
                )
            )
            with pytest.raises(IntegrityError):
                await session.commit()

        await engine.dispose()

    asyncio.run(exercise())


def test_actor_columns_reference_users_and_versions_are_unique_per_record() -> None:
    actor_models = (
        HistoricalNomination,
        HistoricalRelatedPerson,
        HistoricalNominationPartyRole,
        HistoricalAward,
        HistoricalMediaLink,
        HistoricalNominationVersion,
        HistoricalImportBatch,
        HistoricalImportRow,
    )
    for model in actor_models:
        for column in model.__table__.columns:
            if column.name.endswith("user_id"):
                assert any(
                    foreign_key.column.table.name == "users"
                    for foreign_key in column.foreign_keys
                )

    constraints = HistoricalNominationVersion.__table__.constraints
    assert any(
        isinstance(constraint, UniqueConstraint)
        and {column.name for column in constraint.columns}
        == {"nomination_id", "version_no"}
        for constraint in constraints
    )

    forbidden_targets = {"certificates", "payments", "blockchain_transactions"}
    assert not any(
        foreign_key.column.table.name in forbidden_targets
        for model in actor_models
        for foreign_key in model.__table__.foreign_keys
    )
