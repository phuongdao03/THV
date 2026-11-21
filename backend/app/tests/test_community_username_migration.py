from pathlib import Path
from runpy import run_path
from uuid import uuid4

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

from app.modules.community.usernames import public_username


@pytest.mark.parametrize(
    "value",
    [
        "ab",
        "a" * 25,
        "minh anh",
        "minh_\u00e1nh",
        "@minhanh",
        "_minhanh",
        "minhanh_",
        "minh__anh",
        "minh\u200banh",
        "support_123",
        "TINH_HOA_VIET",
    ],
)
def test_public_username_rejects_invalid_and_reserved_names(value: str) -> None:
    assert public_username(value) is None


def test_username_migration_retains_real_names_and_skips_placeholders() -> None:
    migration = run_path(
        str(
            Path(__file__).resolve().parents[2]
            / "alembic/versions/0178_community_usernames.py"
        )
    )
    engine = sa.create_engine("sqlite://")
    owner, legacy = uuid4(), uuid4()
    with engine.begin() as connection:
        connection.exec_driver_sql("CREATE TABLE users (id CHAR(32) PRIMARY KEY)")
        connection.exec_driver_sql(
            "CREATE TABLE community_profiles (user_id CHAR(32), username VARCHAR(64))"
        )
        connection.exec_driver_sql(
            "INSERT INTO users (id) VALUES (?)", [(owner.hex,), (legacy.hex,)]
        )
        connection.exec_driver_sql(
            "INSERT INTO community_profiles (user_id, username) VALUES (?, ?)",
            [(owner.hex, "Lan_Anh"), (legacy.hex, f"member-{legacy.hex}")],
        )
        with Operations.context(MigrationContext.configure(connection)):
            migration["upgrade"]()
            assert connection.exec_driver_sql(
                "SELECT username, user_id FROM community_usernames"
            ).all() == [("lan_anh", owner.hex)]
            migration["downgrade"]()
        assert not sa.inspect(connection).has_table("community_usernames")
    engine.dispose()
