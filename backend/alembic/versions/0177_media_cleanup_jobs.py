"""Persist storage cleanup work for removed draft evidence."""

import sqlalchemy as sa

from alembic import op

revision = "0177_media_cleanup_jobs"
down_revision = "0176_data_manager_record_codes_and_draft_delete"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("media_assets") as batch:
        batch.add_column(sa.Column("upload_dossier_id", sa.Uuid()))
        batch.add_column(sa.Column("upload_expires_at", sa.DateTime(timezone=True)))
        batch.create_foreign_key(
            "fk_media_assets_upload_dossier_id_dossiers",
            "dossiers",
            ["upload_dossier_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch.create_index("ix_media_assets_upload_dossier_id", ["upload_dossier_id"])
    op.create_table(
        "media_cleanup_jobs",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "media_id",
            sa.Uuid(),
            sa.ForeignKey("media_assets.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("dossier_id", sa.Uuid(), nullable=False),
        sa.Column("enqueued_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("claimed_at", sa.DateTime(timezone=True)),
        sa.Column("finished_at", sa.DateTime(timezone=True)),
        sa.Column("attempts", sa.Integer(), server_default="0", nullable=False),
        sa.Column("outcome", sa.String(32)),
    )
    op.create_index(
        "ix_media_cleanup_jobs_due",
        "media_cleanup_jobs",
        ["finished_at", "next_attempt_at"],
    )


def downgrade() -> None:
    op.drop_table("media_cleanup_jobs")
    with op.batch_alter_table("media_assets") as batch:
        batch.drop_index("ix_media_assets_upload_dossier_id")
        batch.drop_constraint(
            "fk_media_assets_upload_dossier_id_dossiers", type_="foreignkey"
        )
        batch.drop_column("upload_expires_at")
        batch.drop_column("upload_dossier_id")
