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
    year: int | None = None
    category_id: UUID | None = None
    business_status: str
    publication_status: str | None = None
    archive_status: str | None = None
    updated_at: datetime


class ArchiveEntry(HistoricalSchema):
    id: UUID
    title: str
    status: str | None = None
    occurred_at: datetime | None = None
    actor: str | None = None
    version_id: UUID | None = None
    media_id: UUID | None = None
    mime_type: str | None = None
    bytes: int | None = None
    checksum: str | None = None
    facts: dict[str, object] = Field(default_factory=dict)
