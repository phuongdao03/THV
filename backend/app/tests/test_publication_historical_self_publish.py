import asyncio
import base64
from sqlite3 import Connection
from uuid import uuid4

from sqlalchemy import event, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.db.base import Base
from app.main import app
from app.modules.audit.service import AuditService
from app.modules.auth.models import User, UserStatus
from app.modules.auth.security import OutboxPayloadCipher
from app.modules.auth.session_service import AuthPrincipal
from app.modules.dossiers.models import Category
from app.modules.historical_nominations.models import (
    HistoricalNomination,
    HistoricalNominationContentVersion,
    HistoricalPublicContentDraft,
    HistoricalSourceKind,
    HistoricalSubjectType,
)
from app.modules.public.models import (
    PublicationStatus,
    PublicWorkVisibility,
)
from app.modules.public.publication_service import PublicationService


def test_admin_and_data_manager_can_publish_legacy_work() -> None:
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
        user = User(
            id=user_id,
            email="manager@example.test",
            password_hash="unused",
            status=UserStatus.ACTIVE,
        )
        record = HistoricalNomination(
            id=uuid4(),
            code="HIST-P0-001",
            subject_type=HistoricalSubjectType.PERSON,
            subject_name=None,
            title="Hồ sơ chưa đặt tên",
            source_kind=HistoricalSourceKind.OTHER,
            created_by_user_id=user_id,
        )
        category = Category(id=uuid4(), code="legacy", slug="legacy", name="Legacy")
        draft = HistoricalPublicContentDraft(
            id=uuid4(),
            nomination_id=record.id,
            slug="historical-record-p0",
            title="Historical record P0",
            short_description="A public-safe historical summary.",
            category_id=category.id,
            created_by_user_id=user_id,
        )
        principal = AuthPrincipal(
            user_id=user_id,
            session_id=uuid4(),
            email="admin@example.test",
            roles=("SUPER_ADMIN",),
        )
        cipher = OutboxPayloadCipher.from_base64(
            encoded_key=base64.b64encode(b"0" * 32).decode(),
            key_id="test-key",
        )

        async with factory() as session:
            session.add_all([user, record, category, draft])
            await session.commit()
            await session.refresh(draft)
            await session.commit()

            service = PublicationService(
                session=session,
                audit=AuditService(session),
                payload_cipher=cipher,
            )
            work = await service.publish_historical_record(
                principal,
                record.id,
                expected_draft_updated_at=draft.updated_at,
                expected_work_version=None,
                request_id="request-p0-publish",
            )
            assert work.historical_nomination_id == record.id
            assert work.dossier_id is None
            assert work.certificate_id is None
            assert work.show_certificate is False
            assert work.publication_status is PublicationStatus.PUBLISHED
            assert work.visibility is PublicWorkVisibility.PUBLIC

            history = await session.scalars(
                select(HistoricalNominationContentVersion).where(
                    HistoricalNominationContentVersion.nomination_id == record.id
                )
            )
            published_version = history.one()
            assert published_version.event_type == "PUBLISHED"
            assert published_version.snapshot_json["title"] == work.title

            draft.title = "Updated historical record"
            await session.commit()
            await session.refresh(draft)
            await session.commit()
            updated = await service.publish_historical_record(
                principal,
                record.id,
                expected_draft_updated_at=draft.updated_at,
                expected_work_version=work.version,
                request_id="request-p0-publish-update",
            )
            assert updated.title == "Updated historical record"
            assert updated.publication_status is PublicationStatus.PUBLISHED

            manager = AuthPrincipal(
                user_id=user_id,
                session_id=uuid4(),
                email="manager@example.test",
                roles=("DATA_MANAGER",),
                permissions=(
                    "historical.records.read",
                    "historical.records.manage",
                    "public_content.works.manage",
                ),
            )
            manager_published = await service.publish_historical_record(
                manager,
                record.id,
                expected_draft_updated_at=draft.updated_at,
                expected_work_version=updated.version,
                request_id="request-p0-manager-publish",
            )
            assert manager_published.title == updated.title
            assert manager_published.publication_status is PublicationStatus.PUBLISHED

        await engine.dispose()

    asyncio.run(scenario())
