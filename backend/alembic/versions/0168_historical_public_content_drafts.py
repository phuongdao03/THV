"""Add private contact fields and independent public content drafts."""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0168_historical_public_content_drafts"
down_revision: str | None = "0167_historical_nominations"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _draft_status() -> sa.Enum:
    return sa.Enum(
        "DRAFT",
        "SUBMITTED",
        "NEEDS_CORRECTION",
        "APPROVED",
        name="historical_public_content_draft_status",
        native_enum=False,
        create_constraint=True,
        validate_strings=True,
    )


def _award_status() -> sa.Enum:
    return sa.Enum(
        "UNVERIFIED",
        "NEEDS_EVIDENCE",
        "VERIFIED",
        "UNVERIFIABLE",
        name="historical_award_verification_status",
        native_enum=False,
        create_constraint=True,
        validate_strings=True,
    )


def upgrade() -> None:
    json_type = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")

    with op.batch_alter_table("historical_related_people") as batch:
        batch.add_column(sa.Column("address", sa.String(length=1000), nullable=True))
        batch.add_column(sa.Column("internal_notes", sa.Text(), nullable=True))

    with op.batch_alter_table("historical_nomination_media") as batch:
        batch.add_column(
            sa.Column(
                "public_candidate",
                sa.Boolean(),
                server_default=sa.text("false"),
                nullable=False,
            )
        )

    with op.batch_alter_table("historical_awards") as batch:
        batch.add_column(
            sa.Column(
                "verification_status",
                _award_status(),
                server_default="UNVERIFIED",
                nullable=False,
            )
        )

    op.create_table(
        "historical_public_content_drafts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("nomination_id", sa.Uuid(), nullable=False),
        sa.Column("slug", sa.String(length=180), nullable=True),
        sa.Column("title", sa.String(length=255), nullable=True),
        sa.Column("short_description", sa.String(length=500), nullable=True),
        sa.Column("full_description", sa.Text(), nullable=True),
        sa.Column("author_display_name", sa.String(length=255), nullable=True),
        sa.Column("category_id", sa.Uuid(), nullable=True),
        sa.Column("cover_media_id", sa.Uuid(), nullable=True),
        sa.Column("featured_video_media_id", sa.Uuid(), nullable=True),
        sa.Column(
            "public_media_ids",
            json_type,
            server_default=sa.text("'[]'"),
            nullable=False,
        ),
        sa.Column(
            "status",
            _draft_status(),
            server_default="DRAFT",
            nullable=False,
        ),
        sa.Column("revision", sa.Integer(), server_default="1", nullable=False),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("updated_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("submitted_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint("revision > 0", name="revision_positive"),
        sa.ForeignKeyConstraint(
            ["nomination_id"], ["historical_nominations.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["category_id"], ["categories.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["cover_media_id"], ["media_assets.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["featured_video_media_id"], ["media_assets.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"], ["users.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_user_id"], ["users.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["submitted_by_user_id"], ["users.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "nomination_id", name="uq_historical_public_draft_nomination"
        ),
    )


def downgrade() -> None:
    op.drop_table("historical_public_content_drafts")
    with op.batch_alter_table("historical_awards") as batch:
        batch.drop_column("verification_status")
    with op.batch_alter_table("historical_nomination_media") as batch:
        batch.drop_column("public_candidate")
    with op.batch_alter_table("historical_related_people") as batch:
        batch.drop_column("internal_notes")
        batch.drop_column("address")
