from datetime import datetime
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import (
    JSON,
    CheckConstraint,
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
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, UtcTimestampMixin


class CertificateArchiveStatus(StrEnum):
    DRAFT = "DRAFT"
    PUBLISHED = "PUBLISHED"
    HIDDEN = "HIDDEN"
    ARCHIVED = "ARCHIVED"


class CertificateArchive(UtcTimestampMixin, Base):
    __tablename__ = "certificate_archives"
    __table_args__ = (
        CheckConstraint("version > 0", name="version_positive"),
        CheckConstraint("draft_version_no > 0", name="draft_version_positive"),
        CheckConstraint(
            "published_version_no IS NULL OR published_version_no > 0",
            name="published_version_positive",
        ),
        CheckConstraint(
            "status != 'PUBLISHED' OR published_version_no IS NOT NULL",
            name="published_requires_version",
        ),
        Index("ix_certificate_archives_work_status", "public_work_id", "status"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    public_work_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("public_works.id", ondelete="RESTRICT"),
        nullable=False,
    )
    status: Mapped[CertificateArchiveStatus] = mapped_column(
        Enum(
            CertificateArchiveStatus,
            name="certificate_archive_status",
            native_enum=False,
            create_constraint=True,
            values_callable=lambda values: [value.value for value in values],
        ),
        nullable=False,
        default=CertificateArchiveStatus.DRAFT,
        server_default=CertificateArchiveStatus.DRAFT.value,
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    draft_version_no: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    published_version_no: Mapped[int | None] = mapped_column(Integer)
    created_by_user_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    updated_by_user_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    published_by_user_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="RESTRICT")
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    archived_by_user_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="RESTRICT")
    )
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    archive_reason: Mapped[str | None] = mapped_column(Text)


class CertificateArchiveRevision(Base):
    __tablename__ = "certificate_archive_revisions"
    __table_args__ = (
        CheckConstraint("version_no > 0", name="version_no_positive"),
        UniqueConstraint(
            "archive_id", "version_no", name="uq_certificate_archive_revision"
        ),
        Index(
            "ix_certificate_archive_revisions_created",
            "archive_id",
            "created_at",
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    archive_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("certificate_archives.id", ondelete="RESTRICT"),
        nullable=False,
    )
    version_no: Mapped[int] = mapped_column(Integer, nullable=False)
    snapshot_json: Mapped[dict[str, object]] = mapped_column(
        JSONB().with_variant(JSON(), "sqlite"), nullable=False
    )
    created_by_user_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class CertificateArchivePage(Base):
    __tablename__ = "certificate_archive_pages"
    __table_args__ = (
        CheckConstraint("sort_order >= 0", name="sort_order_non_negative"),
        UniqueConstraint(
            "revision_id", "media_asset_id", name="uq_certificate_archive_page_asset"
        ),
        UniqueConstraint(
            "revision_id", "sort_order", name="uq_certificate_archive_page_order"
        ),
        Index(
            "ix_certificate_archive_pages_revision_order",
            "revision_id",
            "sort_order",
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    revision_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("certificate_archive_revisions.id", ondelete="RESTRICT"),
        nullable=False,
    )
    media_asset_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("media_assets.id", ondelete="RESTRICT"), nullable=False
    )
    public_media_relation_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("public_work_media.id", ondelete="RESTRICT")
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False)
    caption: Mapped[str | None] = mapped_column(String(500))
    alt_text: Mapped[str] = mapped_column(String(500), nullable=False)
