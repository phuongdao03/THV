"""Read-only admin projections; never storage credentials or mutation contracts."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field

from app.modules.historical_nominations.schemas import HistoricalSchema

ArchiveSource = Literal["CURRENT", "LEGACY"]
ArchiveSection = Literal[
    "certificate_scans",
    "people",
    "documents",
    "versions",
    "reviews",
    "decisions",
    "certificates",
    "publication",
    "history",
    "supplements",
]


class ArchiveRecord(HistoricalSchema):
    id: UUID
    source: ArchiveSource
    code: str
    title: str
    subject: str | None = None
    owner_user_id: UUID | None = None
    owner_name: str | None = None
    owner_email: str | None = None
    year: int | None = None
    category_id: UUID | None = None
    category_name: str | None = None
    recorded_at: datetime
    version_no: int | None = None
    business_status: str
    publication_status: str | None = None
    archive_status: str | None = None
    document_count: int = 0
    image_count: int = 0
    video_count: int = 0
    certificate_count: int = 0
    certificate_reference: str | None = None
    updated_at: datetime


class ArchiveEntry(HistoricalSchema):
    id: UUID
    title: str
    status: str | None = None
    occurred_at: datetime | None = None
    actor: str | None = None
    version_id: UUID | None = None
    version_no: int | None = None
    media_id: UUID | None = None
    mime_type: str | None = None
    bytes: int | None = None
    checksum: str | None = None
    facts: dict[str, object] = Field(default_factory=dict)
