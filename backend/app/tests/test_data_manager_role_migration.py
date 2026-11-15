import sqlite3
from pathlib import Path

import pytest
from alembic.config import Config

from alembic import command
from app.core.config import get_settings

BACKEND_ROOT = Path(__file__).resolve().parents[2]
ROLE_REVISION = "0166_data_manager_role"
DATA_MANAGER_PERMISSIONS = {
    "historical.records.read",
    "historical.records.manage",
    "historical.records.submit",
    "historical.documents.manage",
    "historical.import.manage",
}
NARROW_DATA_MANAGER_PERMISSIONS = {
    "historical.records.read",
    "historical.records.manage",
    "historical.records.submit",
    "historical.documents.manage",
    "public_content.works.manage",
    "certificate_content.edit",
    "certificate_archives.manage",
}


def test_migration_seeds_only_the_data_manager_allowlist(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_path = tmp_path / "data-manager-role.sqlite3"
    monkeypatch.setenv(
        "DATABASE_DIRECT_URL",
        f"sqlite+aiosqlite:///{database_path.as_posix()}",
    )
    monkeypatch.setenv("BLOCKCHAIN_NETWORK", "local")
    monkeypatch.setenv("BLOCKCHAIN_CHAIN_ID", "31337")
    get_settings.cache_clear()
    config = Config(BACKEND_ROOT / "alembic.ini")
    try:
        command.upgrade(config, "0165_submission_fee_test_exemption")
        command.upgrade(config, ROLE_REVISION)
        with sqlite3.connect(database_path) as connection:
            role = connection.execute(
                "SELECT id FROM roles WHERE code = 'DATA_MANAGER'"
            ).fetchone()
            assert role is not None
            permissions = {
                row[0]
                for row in connection.execute(
                    "SELECT p.code FROM role_permissions rp "
                    "JOIN permissions p ON p.id = rp.permission_id "
                    "WHERE rp.role_id = ?",
                    role,
                )
            }
        assert permissions == DATA_MANAGER_PERMISSIONS
    finally:
        get_settings.cache_clear()


def test_latest_migration_restores_legacy_record_access_without_admin_capabilities(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_path = tmp_path / "data-manager-content-capabilities.sqlite3"
    monkeypatch.setenv(
        "DATABASE_DIRECT_URL",
        f"sqlite+aiosqlite:///{database_path.as_posix()}",
    )
    monkeypatch.setenv("BLOCKCHAIN_NETWORK", "local")
    monkeypatch.setenv("BLOCKCHAIN_CHAIN_ID", "31337")
    get_settings.cache_clear()
    config = Config(BACKEND_ROOT / "alembic.ini")
    try:
        command.upgrade(config, "head")
        with sqlite3.connect(database_path) as connection:
            role = connection.execute(
                "SELECT id FROM roles WHERE code = 'DATA_MANAGER'"
            ).fetchone()
            assert role is not None
            permissions = {
                row[0]
                for row in connection.execute(
                    "SELECT p.code FROM role_permissions rp "
                    "JOIN permissions p ON p.id = rp.permission_id "
                    "WHERE rp.role_id = ?",
                    role,
                )
            }
        assert permissions == NARROW_DATA_MANAGER_PERMISSIONS
    finally:
        get_settings.cache_clear()
