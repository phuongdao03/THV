"""Create the private historical nomination archive and import ledger."""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0167_historical_nominations"
down_revision: str | None = "0166_data_manager_role"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _enum(name: str, *values: str) -> sa.Enum:
    return sa.Enum(
        *values,
        name=name,
        native_enum=False,
        create_constraint=True,
        validate_strings=True,
    )


def upgrade() -> None:
    json_type = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")

    with op.batch_alter_table("media_assets") as batch:
        batch.drop_constraint("purpose_valid", type_="check")
        batch.create_check_constraint(
            "purpose_valid",
            "purpose IS NULL OR purpose IN "
            "('AVATAR', 'DOSSIER_EVIDENCE', 'PUBLIC_WORK', 'PUBLIC_COVER', "
            "'COMMUNITY_POST', 'HISTORICAL_NOMINATION')",
        )

    op.create_table(
        "historical_nominations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("code", sa.String(length=40), nullable=False),
        sa.Column(
            "subject_type",
            _enum("historical_subject_type", "PERSON", "ORGANIZATION"),
            nullable=False,
        ),
        sa.Column("subject_name", sa.String(length=255), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("category_id", sa.Uuid(), nullable=True),
        sa.Column("nomination_year", sa.Integer(), nullable=True),
        sa.Column("nominated_at", sa.Date(), nullable=True),
        sa.Column("historical_result", sa.Text(), nullable=True),
        sa.Column(
            "source_kind",
            _enum(
                "historical_source_kind",
                "ARCHIVE",
                "OFFICIAL_RECORD",
                "ORGANIZATION_RECORD",
                "PERSONAL_RECORD",
                "OTHER",
            ),
            nullable=False,
        ),
        sa.Column("source_label", sa.String(length=255), nullable=True),
        sa.Column("source_reference", sa.String(length=500), nullable=True),
        sa.Column("source_recorded_at", sa.Date(), nullable=True),
        sa.Column("provenance_notes", sa.Text(), nullable=True),
        sa.Column(
            "verification_status",
            _enum(
                "historical_nomination_status",
                "DRAFT",
                "SUBMITTED",
                "UNDER_REVIEW",
                "NEEDS_CORRECTION",
                "VERIFIED",
                "HELD",
                "REJECTED",
            ),
            server_default="DRAFT",
            nullable=False,
        ),
        sa.Column(
            "publication_status",
            _enum(
                "historical_nomination_publication_status",
                "PRIVATE",
                "PENDING_PUBLICATION",
                "PUBLISHED",
                "HIDDEN",
                "ARCHIVED",
            ),
            server_default="PRIVATE",
            nullable=False,
        ),
        sa.Column(
            "extension_schema_version",
            sa.Integer(),
            server_default="1",
            nullable=False,
        ),
        sa.Column(
            "extension_data_json",
            json_type,
            server_default=sa.text("'{}'"),
            nullable=False,
        ),
        sa.Column(
            "missing_fields_json",
            json_type,
            server_default=sa.text("'[]'"),
            nullable=False,
        ),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("updated_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("submitted_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("verified_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("verification_reason", sa.Text(), nullable=True),
        sa.Column("public_content_approved_by_user_id", sa.Uuid(), nullable=True),
        sa.Column(
            "public_content_approved_at", sa.DateTime(timezone=True), nullable=True
        ),
        sa.Column("published_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "archive_status",
            _enum("historical_archive_status", "ACTIVE", "ARCHIVED"),
            server_default="ACTIVE",
            nullable=False,
        ),
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
        sa.CheckConstraint("length(trim(code)) > 0", name="code_required"),
        sa.CheckConstraint("length(trim(subject_name)) > 0", name="subject_required"),
        sa.CheckConstraint("length(trim(title)) > 0", name="title_required"),
        sa.CheckConstraint(
            "nomination_year IS NULL OR nomination_year > 0",
            name="nomination_year_positive",
        ),
        sa.CheckConstraint(
            "extension_schema_version > 0",
            name="extension_schema_version_positive",
        ),
        sa.CheckConstraint(
            "publication_status != 'PUBLISHED' OR ("
            "verification_status = 'VERIFIED' AND "
            "public_content_approved_at IS NOT NULL AND "
            "public_content_approved_by_user_id IS NOT NULL)",
            name="published_requires_verification",
        ),
        sa.CheckConstraint(
            "archive_status != 'ARCHIVED' OR ("
            "archived_at IS NOT NULL AND archived_by_user_id IS NOT NULL AND "
            "length(trim(archive_reason)) > 0)",
            name="archived_requires_timestamp",
        ),
        sa.ForeignKeyConstraint(
            ["category_id"], ["categories.id"], ondelete="RESTRICT"
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
        sa.ForeignKeyConstraint(
            ["verified_by_user_id"], ["users.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["public_content_approved_by_user_id"],
            ["users.id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["published_by_user_id"], ["users.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["archived_by_user_id"], ["users.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code"),
    )
    op.create_index(
        "ix_historical_nominations_verification_created",
        "historical_nominations",
        ["verification_status", "created_at"],
    )
    op.create_index(
        "ix_historical_nominations_nomination_year",
        "historical_nominations",
        ["nomination_year", "created_at"],
    )

    op.create_table(
        "historical_related_people",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("display_name", sa.String(length=255), nullable=False),
        sa.Column("organization_name", sa.String(length=255), nullable=True),
        sa.Column("email", sa.String(length=320), nullable=True),
        sa.Column("phone", sa.String(length=64), nullable=True),
        sa.Column("linked_user_id", sa.Uuid(), nullable=True),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("updated_by_user_id", sa.Uuid(), nullable=True),
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
        sa.CheckConstraint(
            "length(trim(display_name)) > 0", name="display_name_required"
        ),
        sa.ForeignKeyConstraint(["linked_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"], ["users.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_user_id"], ["users.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_historical_related_people_display_name",
        "historical_related_people",
        ["display_name"],
    )

    op.create_table(
        "historical_nomination_party_roles",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("nomination_id", sa.Uuid(), nullable=False),
        sa.Column("person_id", sa.Uuid(), nullable=False),
        sa.Column(
            "role",
            _enum(
                "historical_related_person_role",
                "NOMINEE",
                "NOMINATOR",
                "REPRESENTATIVE",
                "CONTACT",
                "WITNESS",
                "OTHER",
            ),
            nullable=False,
        ),
        sa.Column("assigned_by_user_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["nomination_id"], ["historical_nominations.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["person_id"], ["historical_related_people.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["assigned_by_user_id"], ["users.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "nomination_id",
            "person_id",
            "role",
            name="uq_historical_nomination_party_role",
        ),
    )
    op.create_index(
        "ix_historical_nomination_party_roles_person",
        "historical_nomination_party_roles",
        ["person_id", "nomination_id"],
    )

    op.create_table(
        "historical_awards",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("nomination_id", sa.Uuid(), nullable=False),
        sa.Column("award_name", sa.String(length=255), nullable=False),
        sa.Column("certificate_number", sa.String(length=128), nullable=True),
        sa.Column("issued_at", sa.Date(), nullable=True),
        sa.Column("issued_by", sa.String(length=255), nullable=True),
        sa.Column("recipient_person_id", sa.Uuid(), nullable=True),
        sa.Column("provenance_notes", sa.Text(), nullable=True),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("updated_by_user_id", sa.Uuid(), nullable=True),
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
        sa.CheckConstraint("length(trim(award_name)) > 0", name="award_name_required"),
        sa.ForeignKeyConstraint(
            ["nomination_id"], ["historical_nominations.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["recipient_person_id"],
            ["historical_related_people.id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"], ["users.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_user_id"], ["users.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "nomination_id",
            "certificate_number",
            name="uq_historical_award_certificate_number",
        ),
    )
    op.create_index(
        "ix_historical_awards_nomination",
        "historical_awards",
        ["nomination_id"],
    )

    op.create_table(
        "historical_nomination_media",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("nomination_id", sa.Uuid(), nullable=False),
        sa.Column("media_asset_id", sa.Uuid(), nullable=False),
        sa.Column("award_id", sa.Uuid(), nullable=True),
        sa.Column(
            "media_kind",
            _enum(
                "historical_media_kind",
                "PHOTO",
                "VIDEO",
                "SCANNED_DOCUMENT",
                "AWARD_SCAN",
                "SUPPORTING_DOCUMENT",
                "OTHER",
            ),
            nullable=False,
        ),
        sa.Column(
            "access_scope",
            _enum("historical_media_access_scope", "PRIVATE", "INTERNAL"),
            server_default="PRIVATE",
            nullable=False,
        ),
        sa.Column("display_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("attached_by_user_id", sa.Uuid(), nullable=False),
        sa.Column(
            "attached_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint("display_order >= 0", name="display_order_non_negative"),
        sa.ForeignKeyConstraint(
            ["nomination_id"], ["historical_nominations.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["media_asset_id"], ["media_assets.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["award_id"], ["historical_awards.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["attached_by_user_id"], ["users.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "nomination_id",
            "media_asset_id",
            name="uq_historical_nomination_media_asset",
        ),
    )
    op.create_index(
        "ix_historical_nomination_media_nomination_order",
        "historical_nomination_media",
        ["nomination_id", "display_order"],
    )

    op.create_table(
        "historical_nomination_versions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("nomination_id", sa.Uuid(), nullable=False),
        sa.Column("version_no", sa.Integer(), nullable=False),
        sa.Column("snapshot_json", json_type, nullable=False),
        sa.Column("canonical_hash", sa.CHAR(length=64), nullable=False),
        sa.Column("submitted_by_user_id", sa.Uuid(), nullable=False),
        sa.Column(
            "submitted_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint("version_no > 0", name="version_no_positive"),
        sa.CheckConstraint("length(canonical_hash) = 64", name="canonical_hash_sha256"),
        sa.ForeignKeyConstraint(
            ["nomination_id"], ["historical_nominations.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["submitted_by_user_id"], ["users.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "nomination_id", "version_no", name="uq_historical_nomination_version_no"
        ),
    )
    op.create_index(
        "ix_historical_nomination_versions_submitted_at",
        "historical_nomination_versions",
        ["nomination_id", "submitted_at"],
    )

    op.create_table(
        "historical_import_batches",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("idempotency_key", sa.String(length=160), nullable=False),
        sa.Column("source_filename", sa.String(length=255), nullable=True),
        sa.Column("source_file_sha256", sa.CHAR(length=64), nullable=False),
        sa.Column(
            "column_mapping_json",
            json_type,
            server_default=sa.text("'{}'"),
            nullable=False,
        ),
        sa.Column(
            "status",
            _enum(
                "historical_import_batch_status",
                "RECEIVED",
                "VALIDATED",
                "IMPORTING",
                "COMPLETED",
                "COMPLETED_WITH_ERRORS",
                "FAILED",
                "CANCELLED",
            ),
            server_default="RECEIVED",
            nullable=False,
        ),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.CheckConstraint(
            "length(trim(idempotency_key)) > 0", name="idempotency_required"
        ),
        sa.CheckConstraint(
            "length(source_file_sha256) = 64", name="source_sha256_length"
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"], ["users.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("idempotency_key"),
    )
    op.create_index(
        "ix_historical_import_batches_status_created",
        "historical_import_batches",
        ["status", "created_at"],
    )

    op.create_table(
        "historical_import_rows",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("batch_id", sa.Uuid(), nullable=False),
        sa.Column("source_row_number", sa.Integer(), nullable=False),
        sa.Column("idempotency_key", sa.String(length=160), nullable=False),
        sa.Column("payload_sha256", sa.CHAR(length=64), nullable=False),
        sa.Column(
            "payload_json", json_type, server_default=sa.text("'{}'"), nullable=False
        ),
        sa.Column(
            "status",
            _enum(
                "historical_import_row_status",
                "PENDING",
                "VALID",
                "IMPORTED",
                "REJECTED",
                "DUPLICATE",
            ),
            server_default="PENDING",
            nullable=False,
        ),
        sa.Column("nomination_id", sa.Uuid(), nullable=True),
        sa.Column("error_code", sa.String(length=64), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint("source_row_number > 0", name="source_row_positive"),
        sa.CheckConstraint(
            "length(trim(idempotency_key)) > 0", name="idempotency_required"
        ),
        sa.CheckConstraint("length(payload_sha256) = 64", name="payload_sha256_length"),
        sa.ForeignKeyConstraint(
            ["batch_id"], ["historical_import_batches.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["nomination_id"], ["historical_nominations.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "batch_id", "source_row_number", name="uq_historical_import_row_number"
        ),
        sa.UniqueConstraint(
            "batch_id", "idempotency_key", name="uq_historical_import_row_idempotency"
        ),
    )
    op.create_index(
        "ix_historical_import_rows_status",
        "historical_import_rows",
        ["batch_id", "status"],
    )

    with op.batch_alter_table("public_works") as batch:
        batch.alter_column(
            "dossier_id",
            existing_type=sa.Uuid(),
            nullable=True,
        )
        batch.add_column(
            sa.Column("historical_nomination_id", sa.Uuid(), nullable=True)
        )
        batch.add_column(sa.Column("historical_year", sa.Integer(), nullable=True))
        batch.create_foreign_key(
            "fk_public_works_historical_nomination_id",
            "historical_nominations",
            ["historical_nomination_id"],
            ["id"],
            ondelete="RESTRICT",
        )
        batch.create_unique_constraint(
            "uq_public_works_historical_nomination_id",
            ["historical_nomination_id"],
        )
        batch.create_check_constraint(
            "public_work_source_exactly_one",
            "(dossier_id IS NULL AND historical_nomination_id IS NOT NULL) OR "
            "(dossier_id IS NOT NULL AND historical_nomination_id IS NULL)",
        )
        batch.create_check_constraint(
            "historical_year_positive",
            "historical_year IS NULL OR historical_year > 0",
        )


def downgrade() -> None:
    with op.batch_alter_table("public_works") as batch:
        batch.drop_constraint("historical_year_positive", type_="check")
        batch.drop_constraint("public_work_source_exactly_one", type_="check")
        batch.drop_constraint(
            "uq_public_works_historical_nomination_id",
            type_="unique",
        )
        batch.drop_constraint(
            "fk_public_works_historical_nomination_id",
            type_="foreignkey",
        )
        batch.drop_column("historical_year")
        batch.drop_column("historical_nomination_id")
        batch.alter_column(
            "dossier_id",
            existing_type=sa.Uuid(),
            nullable=False,
        )

    for table, index in (
        ("historical_import_rows", "ix_historical_import_rows_status"),
        ("historical_import_batches", "ix_historical_import_batches_status_created"),
        (
            "historical_nomination_versions",
            "ix_historical_nomination_versions_submitted_at",
        ),
        (
            "historical_nomination_media",
            "ix_historical_nomination_media_nomination_order",
        ),
        ("historical_awards", "ix_historical_awards_nomination"),
        (
            "historical_nomination_party_roles",
            "ix_historical_nomination_party_roles_person",
        ),
        ("historical_related_people", "ix_historical_related_people_display_name"),
        ("historical_nominations", "ix_historical_nominations_nomination_year"),
        ("historical_nominations", "ix_historical_nominations_verification_created"),
    ):
        op.drop_index(index, table_name=table)
    for table in (
        "historical_import_rows",
        "historical_import_batches",
        "historical_nomination_versions",
        "historical_nomination_media",
        "historical_awards",
        "historical_nomination_party_roles",
        "historical_related_people",
        "historical_nominations",
    ):
        op.drop_table(table)

    with op.batch_alter_table("media_assets") as batch:
        batch.drop_constraint("purpose_valid", type_="check")
        batch.create_check_constraint(
            "purpose_valid",
            "purpose IS NULL OR purpose IN "
            "('AVATAR', 'DOSSIER_EVIDENCE', 'PUBLIC_WORK', 'PUBLIC_COVER', "
            "'COMMUNITY_POST')",
        )
