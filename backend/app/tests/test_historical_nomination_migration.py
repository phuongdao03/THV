import sqlite3
from pathlib import Path

import pytest
from alembic.config import Config

from alembic import command
from app.core.config import get_settings

BACKEND_ROOT = Path(__file__).resolve().parents[2]
MIGRATION = "0167_historical_nominations"
TABLES = {
    "historical_nominations",
    "historical_related_people",
    "historical_nomination_party_roles",
    "historical_awards",
    "historical_nomination_media",
    "historical_nomination_versions",
    "historical_import_batches",
    "historical_import_rows",
}


def test_historical_nomination_migration_is_reversible_and_adds_private_schema(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_path = tmp_path / "historical-nominations.sqlite3"
    monkeypatch.setenv(
        "DATABASE_DIRECT_URL",
        f"sqlite+aiosqlite:///{database_path.as_posix()}",
    )
    monkeypatch.setenv("BLOCKCHAIN_NETWORK", "local")
    monkeypatch.setenv("BLOCKCHAIN_CHAIN_ID", "31337")
    get_settings.cache_clear()
    config = Config(BACKEND_ROOT / "alembic.ini")
    try:
        command.upgrade(config, "0166_data_manager_role")
        command.upgrade(config, MIGRATION)
        with sqlite3.connect(database_path) as connection:
            tables = {
                row[0]
                for row in connection.execute(
                    "SELECT name FROM sqlite_master WHERE type='table'"
                )
            }
            columns = {
                row[1]
                for row in connection.execute(
                    "PRAGMA table_info(historical_nominations)"
                )
            }
            nomination_sql = connection.execute(
                "SELECT sql FROM sqlite_master "
                "WHERE type='table' AND name='historical_nominations'"
            ).fetchone()
            media_sql = connection.execute(
                "SELECT sql FROM sqlite_master "
                "WHERE type='table' AND name='media_assets'"
            ).fetchone()
            public_work_columns = {
                row[1]: row[3]
                for row in connection.execute("PRAGMA table_info(public_works)")
            }
            public_work_sql = connection.execute(
                "SELECT sql FROM sqlite_master "
                "WHERE type='table' AND name='public_works'"
            ).fetchone()
            media_foreign_keys = {
                (row[2], row[3], row[6])
                for row in connection.execute(
                    "PRAGMA foreign_key_list(historical_nomination_media)"
                )
            }

        assert TABLES.issubset(tables)
        assert {
            "category_id",
            "nomination_year",
            "historical_result",
            "missing_fields_json",
            "public_content_approved_at",
            "archive_status",
            "archived_at",
            "archive_reason",
        }.issubset(columns)
        assert nomination_sql is not None
        assert "published_requires_verification" in nomination_sql[0]
        assert media_sql is not None
        assert "HISTORICAL_NOMINATION" in media_sql[0]
        assert ("media_assets", "media_asset_id", "RESTRICT") in media_foreign_keys
        assert public_work_columns["dossier_id"] == 0
        assert "historical_nomination_id" in public_work_columns
        assert "historical_year" in public_work_columns
        assert public_work_sql is not None
        assert "public_work_source_exactly_one" in public_work_sql[0]

        command.downgrade(config, "0166_data_manager_role")
        with sqlite3.connect(database_path) as connection:
            remaining_tables = {
                row[0]
                for row in connection.execute(
                    "SELECT name FROM sqlite_master WHERE type='table'"
                )
            }
            restored_media_sql = connection.execute(
                "SELECT sql FROM sqlite_master "
                "WHERE type='table' AND name='media_assets'"
            ).fetchone()
            restored_work_columns = {
                row[1]: row[3]
                for row in connection.execute("PRAGMA table_info(public_works)")
            }
        assert TABLES.isdisjoint(remaining_tables)
        assert restored_media_sql is not None
        assert "HISTORICAL_NOMINATION" not in restored_media_sql[0]
        assert restored_work_columns["dossier_id"] == 1
        assert "historical_nomination_id" not in restored_work_columns
        assert "roles" in remaining_tables
    finally:
        get_settings.cache_clear()
