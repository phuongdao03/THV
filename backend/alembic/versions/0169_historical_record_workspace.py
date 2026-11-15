"""Allow sparse LEGACY drafts and retain public content snapshots."""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0169_historical_record_workspace"
down_revision: str | None = "0168_historical_public_content_drafts"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    json_type = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")

    op.execute(
        sa.text(
            "UPDATE historical_nominations SET "
            "published_by_user_id = COALESCE("
            "published_by_user_id, public_content_approved_by_user_id), "
            "published_at = COALESCE(published_at, "
            "public_content_approved_at, updated_at) "
            "WHERE publication_status = 'PUBLISHED'"
        )
    )

    with op.batch_alter_table("historical_nominations") as batch:
        batch.drop_constraint("subject_required", type_="check")
        batch.drop_constraint("published_requires_verification", type_="check")
        batch.alter_column("subject_name", existing_type=sa.String(255), nullable=True)
        batch.add_column(sa.Column("legacy_category_label", sa.String(255)))
        batch.create_check_constraint(
            "published_requires_audit",
            "publication_status != 'PUBLISHED' OR ("
            "archive_status = 'ACTIVE' AND published_by_user_id IS NOT NULL AND "
            "published_at IS NOT NULL)",
        )

    op.create_table(
        "historical_nomination_content_versions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("nomination_id", sa.Uuid(), nullable=False),
        sa.Column("version_no", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(length=32), nullable=False),
        sa.Column("snapshot_json", json_type, nullable=False),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint("version_no > 0", name="version_no_positive"),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"], ["users.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["nomination_id"], ["historical_nominations.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "nomination_id", "version_no", name="uq_historical_content_version_no"
        ),
    )
    op.create_index(
        "ix_historical_content_versions_created",
        "historical_nomination_content_versions",
        ["nomination_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_historical_content_versions_created",
        table_name="historical_nomination_content_versions",
    )
    op.drop_table("historical_nomination_content_versions")
    with op.batch_alter_table("historical_nominations") as batch:
        batch.drop_constraint("published_requires_audit", type_="check")
        batch.drop_column("legacy_category_label")
        batch.alter_column("subject_name", existing_type=sa.String(255), nullable=False)
        batch.create_check_constraint(
            "subject_required", "length(trim(subject_name)) > 0"
        )
        batch.create_check_constraint(
            "published_requires_verification",
            "publication_status != 'PUBLISHED' OR ("
            "verification_status = 'VERIFIED' AND "
            "public_content_approved_at IS NOT NULL AND "
            "public_content_approved_by_user_id IS NOT NULL)",
        )
