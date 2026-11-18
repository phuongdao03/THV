from pathlib import Path

from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, text

BACKEND_ROOT = Path(__file__).resolve().parents[2]


def test_cleanup_migration_preserves_legacy_media_on_upgrade_and_downgrade() -> None:
    script = ScriptDirectory.from_config(Config(BACKEND_ROOT / "alembic.ini"))
    revision = script.get_revision("0177_media_cleanup_jobs")
    assert revision is not None
    legacy_id = "00000000000000000000000000000001"
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.exec_driver_sql("CREATE TABLE dossiers (id CHAR(32) PRIMARY KEY)")
        connection.exec_driver_sql(
            "CREATE TABLE media_assets (id CHAR(32) PRIMARY KEY, "
            "cloudinary_public_id TEXT NOT NULL)"
        )
        connection.execute(
            text("INSERT INTO media_assets VALUES (:id, 'legacy/evidence')"),
            {"id": legacy_id},
        )
        with Operations.context(MigrationContext.configure(connection)):
            revision.module.upgrade()
            assert inspect(connection).has_table("media_cleanup_jobs")
            assert connection.execute(
                text(
                    "SELECT cloudinary_public_id, upload_dossier_id, "
                    "upload_expires_at FROM media_assets WHERE id = :id"
                ),
                {"id": legacy_id},
            ).one() == ("legacy/evidence", None, None)
            revision.module.downgrade()
        assert not inspect(connection).has_table("media_cleanup_jobs")
        assert (
            connection.execute(
                text("SELECT cloudinary_public_id FROM media_assets WHERE id = :id"),
                {"id": legacy_id},
            ).scalar_one()
            == "legacy/evidence"
        )
    engine.dispose()
