import asyncio
from datetime import UTC, datetime
from sqlite3 import Connection
from uuid import uuid4

import pytest
from sqlalchemy import event, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.db.base import Base
from app.main import app
from app.modules.audit.models import AuditLog
from app.modules.auth.models import User, UserStatus
from app.modules.auth.session_service import AuthPrincipal
from app.modules.historical_nominations.errors import (
    HistoricalNominationForbiddenError,
)
from app.modules.historical_nominations.models import (
    HistoricalArchiveStatus,
    HistoricalAward,
    HistoricalAwardVerificationStatus,
    HistoricalNomination,
    HistoricalNominationPublicationStatus,
    HistoricalNominationStatus,
    HistoricalSourceKind,
    HistoricalSubjectType,
)
from app.modules.historical_nominations.schemas import HistoricalPublicContentDraftWrite
from app.modules.historical_nominations.service import HistoricalNominationService
from app.modules.public.models import PublicWork


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
