from datetime import date, datetime
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import (
    CHAR,
    JSON,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, UtcTimestampMixin
from app.modules.auth.models import User
from app.modules.dossiers.models import Category, DossierType
from app.modules.media.models import MediaAsset


class HistoricalSubjectType(StrEnum):
    PERSON = "PERSON"
    ORGANIZATION = "ORGANIZATION"


class HistoricalSourceKind(StrEnum):
    ARCHIVE = "ARCHIVE"
    OFFICIAL_RECORD = "OFFICIAL_RECORD"
    ORGANIZATION_RECORD = "ORGANIZATION_RECORD"
    PERSONAL_RECORD = "PERSONAL_RECORD"
    OTHER = "OTHER"


class HistoricalNominationStatus(StrEnum):
    DRAFT = "DRAFT"
    SUBMITTED = "SUBMITTED"
    UNDER_REVIEW = "UNDER_REVIEW"
    NEEDS_CORRECTION = "NEEDS_CORRECTION"
    VERIFIED = "VERIFIED"
    HELD = "HELD"
    REJECTED = "REJECTED"


class HistoricalNominationPublicationStatus(StrEnum):
    PRIVATE = "PRIVATE"
    PENDING_PUBLICATION = "PENDING_PUBLICATION"
    PUBLISHED = "PUBLISHED"
    HIDDEN = "HIDDEN"
    ARCHIVED = "ARCHIVED"


class HistoricalArchiveStatus(StrEnum):
    ACTIVE = "ACTIVE"
    ARCHIVED = "ARCHIVED"


class HistoricalRelatedPersonRole(StrEnum):
    NOMINEE = "NOMINEE"
    NOMINATOR = "NOMINATOR"
    REPRESENTATIVE = "REPRESENTATIVE"
    CONTACT = "CONTACT"
    WITNESS = "WITNESS"
    OTHER = "OTHER"


class HistoricalMediaKind(StrEnum):
    PHOTO = "PHOTO"
    VIDEO = "VIDEO"
    SCANNED_DOCUMENT = "SCANNED_DOCUMENT"
    AWARD_SCAN = "AWARD_SCAN"
    SUPPORTING_DOCUMENT = "SUPPORTING_DOCUMENT"
    OTHER = "OTHER"


class HistoricalAwardVerificationStatus(StrEnum):
    UNVERIFIED = "UNVERIFIED"
    NEEDS_EVIDENCE = "NEEDS_EVIDENCE"
    VERIFIED = "VERIFIED"
    UNVERIFIABLE = "UNVERIFIABLE"


class HistoricalMediaAccessScope(StrEnum):
    PRIVATE = "PRIVATE"
    INTERNAL = "INTERNAL"


class HistoricalPublicContentDraftStatus(StrEnum):
    DRAFT = "DRAFT"
    SUBMITTED = "SUBMITTED"
    NEEDS_CORRECTION = "NEEDS_CORRECTION"
    APPROVED = "APPROVED"


class HistoricalImportBatchStatus(StrEnum):
    RECEIVED = "RECEIVED"
    VALIDATED = "VALIDATED"
    IMPORTING = "IMPORTING"
    COMPLETED = "COMPLETED"
    COMPLETED_WITH_ERRORS = "COMPLETED_WITH_ERRORS"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class HistoricalImportRowStatus(StrEnum):
    PENDING = "PENDING"
    VALID = "VALID"
    IMPORTED = "IMPORTED"
    REJECTED = "REJECTED"
    DUPLICATE = "DUPLICATE"


def _enum(enum_type: type[StrEnum], name: str) -> Enum:
    return Enum(
        enum_type,
        name=name,
        values_callable=lambda values: [value.value for value in values],
        validate_strings=True,
        native_enum=False,
        create_constraint=True,
    )


JSON_OBJECT_TYPE = JSONB().with_variant(JSON(), "sqlite")


class HistoricalNomination(UtcTimestampMixin, Base):
    __tablename__ = "historical_nominations"
    __table_args__ = (
        CheckConstraint("length(trim(code)) > 0", name="code_required"),
        CheckConstraint("length(trim(title)) > 0", name="title_required"),
        CheckConstraint(
            "nomination_year IS NULL OR nomination_year > 0",
            name="nomination_year_positive",
        ),
        CheckConstraint(
            "extension_schema_version > 0",
            name="extension_schema_version_positive",
        ),
        CheckConstraint(
            "publication_status != 'PUBLISHED' OR ("
            "archive_status = 'ACTIVE' AND published_by_user_id IS NOT NULL AND "
            "published_at IS NOT NULL)",
            name="published_requires_audit",
        ),
        CheckConstraint(
            "archive_status != 'ARCHIVED' OR ("
            "archived_at IS NOT NULL AND archived_by_user_id IS NOT NULL AND "
            "length(trim(archive_reason)) > 0)",
            name="archived_requires_timestamp",
        ),
        Index(
            "ix_historical_nominations_verification_created",
            "verification_status",
            "created_at",
        ),
        Index(
            "ix_historical_nominations_nomination_year",
            "nomination_year",
            "created_at",
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    code: Mapped[str] = mapped_column(String(40), nullable=False, unique=True)
    subject_type: Mapped[HistoricalSubjectType] = mapped_column(
        _enum(HistoricalSubjectType, "historical_subject_type"),
        nullable=False,
    )
    subject_name: Mapped[str | None] = mapped_column(String(255))
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    summary: Mapped[str | None] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    dossier_type_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey(DossierType.id, ondelete="RESTRICT"),
    )
    category_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey(Category.id, ondelete="RESTRICT"),
    )
    legacy_category_label: Mapped[str | None] = mapped_column(String(255))
    nomination_year: Mapped[int | None] = mapped_column(Integer)
    nominated_at: Mapped[date | None] = mapped_column(Date)
    historical_result: Mapped[str | None] = mapped_column(Text)
    source_kind: Mapped[HistoricalSourceKind] = mapped_column(
        _enum(HistoricalSourceKind, "historical_source_kind"),
        nullable=False,
    )
    source_label: Mapped[str | None] = mapped_column(String(255))
    source_reference: Mapped[str | None] = mapped_column(String(500))
    source_recorded_at: Mapped[date | None] = mapped_column(Date)
    provenance_notes: Mapped[str | None] = mapped_column(Text)
    verification_status: Mapped[HistoricalNominationStatus] = mapped_column(
        _enum(HistoricalNominationStatus, "historical_nomination_status"),
        nullable=False,
        default=HistoricalNominationStatus.DRAFT,
        server_default=HistoricalNominationStatus.DRAFT.value,
    )
    publication_status: Mapped[HistoricalNominationPublicationStatus] = mapped_column(
        _enum(
            HistoricalNominationPublicationStatus,
            "historical_nomination_publication_status",
        ),
        nullable=False,
        default=HistoricalNominationPublicationStatus.PRIVATE,
        server_default=HistoricalNominationPublicationStatus.PRIVATE.value,
    )
    extension_schema_version: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
        server_default="1",
    )
    extension_data_json: Mapped[dict[str, object]] = mapped_column(
        JSON_OBJECT_TYPE,
        nullable=False,
        default=dict,
        server_default=text("'{}'"),
    )
    missing_fields_json: Mapped[list[str]] = mapped_column(
        JSONB().with_variant(JSON(), "sqlite"),
        nullable=False,
        default=list,
        server_default=text("'[]'"),
    )
    created_by_user_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey(User.id, ondelete="RESTRICT"),
        nullable=False,
    )
    updated_by_user_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey(User.id, ondelete="RESTRICT"),
    )
    submitted_by_user_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey(User.id, ondelete="RESTRICT"),
    )
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    verified_by_user_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey(User.id, ondelete="RESTRICT"),
    )
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    verification_reason: Mapped[str | None] = mapped_column(Text)
    public_content_approved_by_user_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey(User.id, ondelete="RESTRICT"),
    )
    public_content_approved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    published_by_user_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey(User.id, ondelete="RESTRICT"),
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    archive_status: Mapped[HistoricalArchiveStatus] = mapped_column(
        _enum(HistoricalArchiveStatus, "historical_archive_status"),
        nullable=False,
        default=HistoricalArchiveStatus.ACTIVE,
        server_default=HistoricalArchiveStatus.ACTIVE.value,
    )
    archived_by_user_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey(User.id, ondelete="RESTRICT"),
    )
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    archive_reason: Mapped[str | None] = mapped_column(Text)


class HistoricalRelatedPerson(UtcTimestampMixin, Base):
    """Private identity/contact details that can be shared across nominations."""

    __tablename__ = "historical_related_people"
    __table_args__ = (
        CheckConstraint("length(trim(display_name)) > 0", name="display_name_required"),
        Index("ix_historical_related_people_display_name", "display_name"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    organization_name: Mapped[str | None] = mapped_column(String(255))
    email: Mapped[str | None] = mapped_column(String(320))
    phone: Mapped[str | None] = mapped_column(String(64))
    address: Mapped[str | None] = mapped_column(String(1000))
    internal_notes: Mapped[str | None] = mapped_column(Text)
    linked_user_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey(User.id, ondelete="RESTRICT"),
    )
    created_by_user_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey(User.id, ondelete="RESTRICT"),
        nullable=False,
    )
    updated_by_user_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey(User.id, ondelete="RESTRICT"),
    )


class HistoricalNominationPartyRole(Base):
    __tablename__ = "historical_nomination_party_roles"
    __table_args__ = (
        UniqueConstraint(
            "nomination_id",
            "person_id",
            "role",
            name="uq_historical_nomination_party_role",
        ),
        Index(
            "ix_historical_nomination_party_roles_person",
            "person_id",
            "nomination_id",
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    nomination_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey(HistoricalNomination.id, ondelete="RESTRICT"),
        nullable=False,
    )
    person_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey(HistoricalRelatedPerson.id, ondelete="RESTRICT"),
        nullable=False,
    )
    role: Mapped[HistoricalRelatedPersonRole] = mapped_column(
        _enum(HistoricalRelatedPersonRole, "historical_related_person_role"),
        nullable=False,
    )
    assigned_by_user_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey(User.id, ondelete="RESTRICT"),
        nullable=False,
    )


class HistoricalAward(UtcTimestampMixin, Base):
    """Metadata for an already-issued historical award; never a live certificate."""

    __tablename__ = "historical_awards"
    __table_args__ = (
        UniqueConstraint(
            "nomination_id",
            "certificate_number",
            name="uq_historical_award_certificate_number",
        ),
        CheckConstraint("length(trim(award_name)) > 0", name="award_name_required"),
        Index("ix_historical_awards_nomination", "nomination_id"),
    )
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    nomination_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey(HistoricalNomination.id, ondelete="RESTRICT"),
        nullable=False,
    )
    award_name: Mapped[str] = mapped_column(String(255), nullable=False)
    certificate_number: Mapped[str | None] = mapped_column(String(128))
    issued_at: Mapped[date | None] = mapped_column(Date)
    issued_by: Mapped[str | None] = mapped_column(String(255))
    verification_status: Mapped[HistoricalAwardVerificationStatus] = mapped_column(
        _enum(
            HistoricalAwardVerificationStatus,
            "historical_award_verification_status",
        ),
        nullable=False,
        default=HistoricalAwardVerificationStatus.UNVERIFIED,
        server_default=HistoricalAwardVerificationStatus.UNVERIFIED.value,
    )
    recipient_person_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey(HistoricalRelatedPerson.id, ondelete="RESTRICT"),
    )
    provenance_notes: Mapped[str | None] = mapped_column(Text)
    created_by_user_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey(User.id, ondelete="RESTRICT"),
        nullable=False,
    )
    updated_by_user_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey(User.id, ondelete="RESTRICT"),
    )


class HistoricalPublicContentDraft(UtcTimestampMixin, Base):
    """Private, editable proposal kept separate from the published PublicWork."""

    __tablename__ = "historical_public_content_drafts"
    __table_args__ = (
        CheckConstraint("revision > 0", name="revision_positive"),
        UniqueConstraint("nomination_id", name="uq_historical_public_draft_nomination"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    nomination_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey(HistoricalNomination.id, ondelete="RESTRICT"),
        nullable=False,
    )
    slug: Mapped[str | None] = mapped_column(String(180))
    title: Mapped[str | None] = mapped_column(String(255))
    short_description: Mapped[str | None] = mapped_column(String(500))
    full_description: Mapped[str | None] = mapped_column(Text)
    author_display_name: Mapped[str | None] = mapped_column(String(255))
    category_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey(Category.id, ondelete="RESTRICT"),
    )
    cover_media_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey(MediaAsset.id, ondelete="RESTRICT"),
    )
    featured_video_media_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey(MediaAsset.id, ondelete="RESTRICT"),
    )
    public_media_ids: Mapped[list[str]] = mapped_column(
        JSON_OBJECT_TYPE,
        nullable=False,
        default=list,
        server_default=text("'[]'"),
    )
    status: Mapped[HistoricalPublicContentDraftStatus] = mapped_column(
        _enum(
            HistoricalPublicContentDraftStatus,
            "historical_public_content_draft_status",
        ),
        nullable=False,
        default=HistoricalPublicContentDraftStatus.DRAFT,
        server_default=HistoricalPublicContentDraftStatus.DRAFT.value,
    )
    revision: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
        server_default="1",
    )
    created_by_user_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey(User.id, ondelete="RESTRICT"),
        nullable=False,
    )
    updated_by_user_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey(User.id, ondelete="RESTRICT"),
    )
    submitted_by_user_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey(User.id, ondelete="RESTRICT"),
    )
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class HistoricalMediaLink(Base):
    __tablename__ = "historical_nomination_media"
    __table_args__ = (
        UniqueConstraint(
            "nomination_id",
            "media_asset_id",
            name="uq_historical_nomination_media_asset",
        ),
        CheckConstraint("display_order >= 0", name="display_order_non_negative"),
        Index(
            "ix_historical_nomination_media_nomination_order",
            "nomination_id",
            "display_order",
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    nomination_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey(HistoricalNomination.id, ondelete="RESTRICT"),
        nullable=False,
    )
    media_asset_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey(MediaAsset.id, ondelete="RESTRICT"),
        nullable=False,
    )
    award_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey(HistoricalAward.id, ondelete="RESTRICT"),
    )
    media_kind: Mapped[HistoricalMediaKind] = mapped_column(
        _enum(HistoricalMediaKind, "historical_media_kind"),
        nullable=False,
    )
    access_scope: Mapped[HistoricalMediaAccessScope] = mapped_column(
        _enum(HistoricalMediaAccessScope, "historical_media_access_scope"),
        nullable=False,
        default=HistoricalMediaAccessScope.PRIVATE,
        server_default=HistoricalMediaAccessScope.PRIVATE.value,
    )
    display_order: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default="0",
    )
    public_candidate: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("false"),
    )
    attached_by_user_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey(User.id, ondelete="RESTRICT"),
        nullable=False,
    )
    attached_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )


class HistoricalNominationVersion(Base):
    __tablename__ = "historical_nomination_versions"
    __table_args__ = (
        CheckConstraint("version_no > 0", name="version_no_positive"),
        CheckConstraint("length(canonical_hash) = 64", name="canonical_hash_sha256"),
        UniqueConstraint(
            "nomination_id",
            "version_no",
            name="uq_historical_nomination_version_no",
        ),
        Index(
            "ix_historical_nomination_versions_submitted_at",
            "nomination_id",
            "submitted_at",
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    nomination_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey(HistoricalNomination.id, ondelete="RESTRICT"),
        nullable=False,
    )
    version_no: Mapped[int] = mapped_column(Integer, nullable=False)
    snapshot_json: Mapped[dict[str, object]] = mapped_column(
        JSON_OBJECT_TYPE,
        nullable=False,
    )
    canonical_hash: Mapped[str] = mapped_column(CHAR(64), nullable=False)
    submitted_by_user_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey(User.id, ondelete="RESTRICT"),
        nullable=False,
    )
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )


class HistoricalNominationContentVersion(Base):
    """Immutable snapshots of saved and published public content."""

    __tablename__ = "historical_nomination_content_versions"
    __table_args__ = (
        CheckConstraint("version_no > 0", name="version_no_positive"),
        UniqueConstraint(
            "nomination_id",
            "version_no",
            name="uq_historical_content_version_no",
        ),
        Index(
            "ix_historical_content_versions_created",
            "nomination_id",
            "created_at",
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    nomination_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey(HistoricalNomination.id, ondelete="RESTRICT"),
        nullable=False,
    )
    version_no: Mapped[int] = mapped_column(Integer, nullable=False)
    event_type: Mapped[str] = mapped_column(String(32), nullable=False)
    snapshot_json: Mapped[dict[str, object]] = mapped_column(
        JSON_OBJECT_TYPE,
        nullable=False,
    )
    created_by_user_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey(User.id, ondelete="RESTRICT"),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )


class HistoricalImportBatch(UtcTimestampMixin, Base):
    __tablename__ = "historical_import_batches"
    __table_args__ = (
        CheckConstraint(
            "length(trim(idempotency_key)) > 0", name="idempotency_required"
        ),
        CheckConstraint("length(source_file_sha256) = 64", name="source_sha256_length"),
        Index("ix_historical_import_batches_status_created", "status", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    idempotency_key: Mapped[str] = mapped_column(
        String(160),
        nullable=False,
        unique=True,
    )
    source_filename: Mapped[str | None] = mapped_column(String(255))
    source_file_sha256: Mapped[str] = mapped_column(CHAR(64), nullable=False)
    column_mapping_json: Mapped[dict[str, str]] = mapped_column(
        JSONB().with_variant(JSON(), "sqlite"),
        nullable=False,
        default=dict,
        server_default=text("'{}'"),
    )
    status: Mapped[HistoricalImportBatchStatus] = mapped_column(
        _enum(HistoricalImportBatchStatus, "historical_import_batch_status"),
        nullable=False,
        default=HistoricalImportBatchStatus.RECEIVED,
        server_default=HistoricalImportBatchStatus.RECEIVED.value,
    )
    created_by_user_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey(User.id, ondelete="RESTRICT"),
        nullable=False,
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class HistoricalImportRow(Base):
    __tablename__ = "historical_import_rows"
    __table_args__ = (
        CheckConstraint("source_row_number > 0", name="source_row_positive"),
        CheckConstraint(
            "length(trim(idempotency_key)) > 0", name="idempotency_required"
        ),
        CheckConstraint("length(payload_sha256) = 64", name="payload_sha256_length"),
        UniqueConstraint(
            "batch_id",
            "source_row_number",
            name="uq_historical_import_row_number",
        ),
        UniqueConstraint(
            "batch_id",
            "idempotency_key",
            name="uq_historical_import_row_idempotency",
        ),
        Index("ix_historical_import_rows_status", "batch_id", "status"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    batch_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey(HistoricalImportBatch.id, ondelete="RESTRICT"),
        nullable=False,
    )
    source_row_number: Mapped[int] = mapped_column(Integer, nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(160), nullable=False)
    payload_sha256: Mapped[str] = mapped_column(CHAR(64), nullable=False)
    payload_json: Mapped[dict[str, object]] = mapped_column(
        JSONB().with_variant(JSON(), "sqlite"),
        nullable=False,
        default=dict,
        server_default=text("'{}'"),
    )
    status: Mapped[HistoricalImportRowStatus] = mapped_column(
        _enum(HistoricalImportRowStatus, "historical_import_row_status"),
        nullable=False,
        default=HistoricalImportRowStatus.PENDING,
        server_default=HistoricalImportRowStatus.PENDING.value,
    )
    nomination_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey(HistoricalNomination.id, ondelete="RESTRICT"),
    )
    error_code: Mapped[str | None] = mapped_column(String(64))
