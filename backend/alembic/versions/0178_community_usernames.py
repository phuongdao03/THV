"""Reserve canonical and historical community usernames."""

import re

import sqlalchemy as sa

from alembic import op

revision = "0178_community_usernames"
down_revision = "0177_media_cleanup_jobs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    connection = op.get_bind()
    profiles = sa.table(
        "community_profiles",
        sa.column("username", sa.String()),
        sa.column("user_id", sa.Uuid()),
    )
    placeholder = re.compile(r"member-[0-9a-f]{32}", re.IGNORECASE)
    names = [
        {"username": row.username.lower(), "user_id": row.user_id}
        for row in connection.execute(
            sa.select(profiles.c.username, profiles.c.user_id)
        )
        if not placeholder.fullmatch(row.username)
    ]
    if len({row["username"] for row in names}) != len(names):
        raise RuntimeError("Community usernames collide after normalization.")

    handles = op.create_table(
        "community_usernames",
        sa.Column("username", sa.String(length=64), primary_key=True),
        sa.Column(
            "user_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("claimed_at", sa.DateTime(timezone=True)),
        sa.Column("retired_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint(
            "username = lower(username)", name="community_username_lowercase"
        ),
    )
    predicate = sa.text("retired_at IS NULL")
    op.create_index(
        "uq_community_usernames_current_user",
        "community_usernames",
        ["user_id"],
        unique=True,
        postgresql_where=predicate,
        sqlite_where=predicate,
    )
    if names:
        connection.execute(handles.insert(), names)


def downgrade() -> None:
    connection = op.get_bind()
    if (
        connection.execute(
            sa.text(
                "SELECT 1 FROM community_usernames WHERE retired_at IS NOT NULL LIMIT 1"
            )
        ).scalar()
        is not None
    ):
        raise RuntimeError("Retain the username registry to preserve public aliases.")
    op.drop_table("community_usernames")
