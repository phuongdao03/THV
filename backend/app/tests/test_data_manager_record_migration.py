import sqlite3
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

import pytest
from alembic.config import Config
from sqlalchemy import MetaData, Table, create_engine

from alembic import command
from app.core.config import get_settings

BACKEND_ROOT = Path(__file__).resolve().parents[2]
BASE_REVISION = "0175_data_manager_no_record_review"
REVISION = "0176_data_manager_record_codes_and_draft_delete"


def test_record_code_migration_preserves_hist_alias_and_rolls_back(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_path = tmp_path / "data-manager-record-codes.sqlite3"
    monkeypatch.setenv(
        "DATABASE_DIRECT_URL",
        f"sqlite+aiosqlite:///{database_path.as_posix()}",
    )
    monkeypatch.setenv("BLOCKCHAIN_NETWORK", "local")
    monkeypatch.setenv("BLOCKCHAIN_CHAIN_ID", "31337")
    get_settings.cache_clear()
    config = Config(BACKEND_ROOT / "alembic.ini")
    user_id = uuid4()
    record_id = uuid4()
    historic_code = "HIST-EBB88F72B3094BE9"
    created_at = datetime(2020, 8, 10, 0, 0, tzinfo=UTC)

    try:
        command.upgrade(config, BASE_REVISION)
        engine = create_engine(f"sqlite:///{database_path.as_posix()}")
        metadata = MetaData()
        with engine.begin() as connection:
            users = Table("users", metadata, autoload_with=connection)
            records = Table(
                "historical_nominations", metadata, autoload_with=connection
            )
            connection.execute(
                users.insert().values(
                    id=user_id.hex,
                    email="migration@example.test",
                    password_hash="unused",
                    status="ACTIVE",
                )
            )
            values: dict[str, object] = {
                "id": record_id.hex,
                "code": historic_code,
                "subject_type": "PERSON",
                "title": "Historical nomination",
                "source_kind": "OTHER",
                "created_by_user_id": user_id.hex,
                "created_at": created_at,
                "updated_at": created_at,
            }
            connection.execute(records.insert().values(**values))
        engine.dispose()

        command.upgrade(config, REVISION)
        with sqlite3.connect(database_path) as connection:
            migrated_code, alias = connection.execute(
                "SELECT code, legacy_code FROM historical_nominations WHERE id = ?",
                (record_id.hex,),
            ).fetchone()
            columns = {
                row[1]
                for row in connection.execute(
                    "PRAGMA table_info(historical_nominations)"
                )
            }
        assert migrated_code == f"THV-LS-2020-{record_id.hex.upper()}"
        assert alias == historic_code
        assert {"creation_request_id", "deleted_at", "legacy_code"}.issubset(columns)

        command.downgrade(config, BASE_REVISION)
        with sqlite3.connect(database_path) as connection:
            rolled_back_code = connection.execute(
                "SELECT code FROM historical_nominations WHERE id = ?",
                (record_id.hex,),
            ).fetchone()[0]
            columns = {
                row[1]
                for row in connection.execute(
                    "PRAGMA table_info(historical_nominations)"
                )
            }
        assert rolled_back_code == historic_code
        assert {"creation_request_id", "deleted_at", "legacy_code"}.isdisjoint(columns)
    finally:
        get_settings.cache_clear()
