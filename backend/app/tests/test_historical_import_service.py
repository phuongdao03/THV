import asyncio
from sqlite3 import Connection
from uuid import uuid4

from sqlalchemy import event, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.db.base import Base
from app.main import app
from app.modules.auth.models import User, UserStatus
from app.modules.auth.session_service import AuthPrincipal
from app.modules.historical_nominations.import_service import HistoricalImportService
from app.modules.historical_nominations.models import (
    HistoricalImportRowStatus,
    HistoricalNomination,
    HistoricalNominationStatus,
)


def test_import_preview_does_not_deduplicate_after_invalid_row() -> None:
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
            email="admin@example.test",
            roles=("SUPER_ADMIN",),
            permissions=("historical.import.manage",),
        )
        content = (
            b"name,title,year,source_kind\n"
            b"An,Title,2020,UNKNOWN\n"
            b"An,Title,2020,ARCHIVE\n"
            b"Binh,Another title,2021,ARCHIVE\n"
        )

        async with factory() as session:
            session.add(
                User(
                    id=user_id,
                    email=principal.email,
                    password_hash="unused",
                    status=UserStatus.ACTIVE,
                )
            )
            await session.commit()

            service = HistoricalImportService(session)
            batch, _, _ = await service.upload(
                principal,
                filename="archive.csv",
                content=content,
                idempotency_key="import-batch-test-001",
            )
            _, rows, _ = await service.preview(
                principal,
                batch.id,
                {
                    "subject_name": "name",
                    "title": "title",
                    "nomination_year": "year",
                    "source_kind": "source_kind",
                },
            )

            assert [row.status for row in rows] == [
                HistoricalImportRowStatus.REJECTED,
                HistoricalImportRowStatus.VALID,
                HistoricalImportRowStatus.VALID,
            ]
            assert await service.confirm(principal, batch.id) == (2, 1, 0)
            assert await service.confirm(principal, batch.id) == (2, 1, 0)
            imported = list(
                await session.scalars(
                    select(HistoricalNomination).order_by(
                        HistoricalNomination.subject_name
                    )
                )
            )
            assert len(imported) == 2
            assert all(
                record.verification_status is HistoricalNominationStatus.DRAFT
                for record in imported
            )

        await engine.dispose()

    asyncio.run(scenario())
