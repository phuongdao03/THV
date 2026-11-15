"""Add scan-based certificate archives for public works."""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0172_certificate_archives"
down_revision: str | None = "0171_data_manager_content_capabilities"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    json_type = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")

    with op.batch_alter_table("media_assets") as batch:
        batch.drop_constraint("purpose_valid", type_="check")
        batch.create_check_constraint(
            "purpose_valid",
            "purpose IS NULL OR purpose IN "
            "('AVATAR', 'DOSSIER_EVIDENCE', 'PUBLIC_WORK', 'PUBLIC_COVER', "
            "'COMMUNITY_POST', 'HISTORICAL_NOMINATION', 'CERTIFICATE_ARCHIVE_SCAN')",
        )

    op.add_column(
        "public_work_media",
        sa.Column(
            "is_certificate_archive_page",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
    )
    op.create_table(
        "certificate_archives",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("public_work_id", sa.Uuid(), nullable=False),
        sa.Column(
            "status",
            sa.String(length=16),
            server_default="DRAFT",
            nullable=False,
        ),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("draft_version_no", sa.Integer(), nullable=False),
        sa.Column("published_version_no", sa.Integer(), nullable=True),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("updated_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("published_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("archived_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("archive_reason", sa.Text(), nullable=True),
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
        sa.CheckConstraint("version > 0", name="version_positive"),
        sa.CheckConstraint("draft_version_no > 0", name="draft_version_positive"),
        sa.CheckConstraint(
            "published_version_no IS NULL OR published_version_no > 0",
            name="published_version_positive",
        ),
        sa.CheckConstraint(
            "status IN ('DRAFT', 'PUBLISHED', 'HIDDEN', 'ARCHIVED')",
            name="certificate_archive_status",
        ),
        sa.CheckConstraint(
            "status != 'PUBLISHED' OR published_version_no IS NOT NULL",
            name="published_requires_version",
        ),
        sa.ForeignKeyConstraint(
            ["public_work_id"], ["public_works.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"], ["users.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_user_id"], ["users.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["published_by_user_id"], ["users.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["archived_by_user_id"], ["users.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_certificate_archives_work_status",
        "certificate_archives",
        ["public_work_id", "status"],
    )
    op.create_table(
        "certificate_archive_revisions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("archive_id", sa.Uuid(), nullable=False),
        sa.Column("version_no", sa.Integer(), nullable=False),
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
            ["archive_id"], ["certificate_archives.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"], ["users.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "archive_id", "version_no", name="uq_certificate_archive_revision"
        ),
    )
    op.create_index(
        "ix_certificate_archive_revisions_created",
        "certificate_archive_revisions",
        ["archive_id", "created_at"],
    )
    op.create_table(
        "certificate_archive_pages",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("revision_id", sa.Uuid(), nullable=False),
        sa.Column("media_asset_id", sa.Uuid(), nullable=False),
        sa.Column("public_media_relation_id", sa.Uuid(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("caption", sa.String(length=500), nullable=True),
        sa.Column("alt_text", sa.String(length=500), nullable=False),
        sa.CheckConstraint("sort_order >= 0", name="sort_order_non_negative"),
        sa.ForeignKeyConstraint(
            ["revision_id"],
            ["certificate_archive_revisions.id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["media_asset_id"], ["media_assets.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["public_media_relation_id"],
            ["public_work_media.id"],
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "revision_id", "media_asset_id", name="uq_certificate_archive_page_asset"
        ),
        sa.UniqueConstraint(
            "revision_id", "sort_order", name="uq_certificate_archive_page_order"
        ),
    )
    op.create_index(
        "ix_certificate_archive_pages_revision_order",
        "certificate_archive_pages",
        ["revision_id", "sort_order"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_certificate_archive_pages_revision_order",
        table_name="certificate_archive_pages",
    )
    op.drop_table("certificate_archive_pages")
    op.drop_index(
        "ix_certificate_archive_revisions_created",
        table_name="certificate_archive_revisions",
    )
    op.drop_table("certificate_archive_revisions")
    op.drop_index(
        "ix_certificate_archives_work_status", table_name="certificate_archives"
    )
    op.drop_table("certificate_archives")
    op.drop_column("public_work_media", "is_certificate_archive_page")
    with op.batch_alter_table("media_assets") as batch:
        batch.drop_constraint("purpose_valid", type_="check")
        batch.create_check_constraint(
            "purpose_valid",
            "purpose IS NULL OR purpose IN "
            "('AVATAR', 'DOSSIER_EVIDENCE', 'PUBLIC_WORK', 'PUBLIC_COVER', "
            "'COMMUNITY_POST', 'HISTORICAL_NOMINATION')",
        )
