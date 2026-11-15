from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


def _camel(name: str) -> str:
    first, *rest = name.split("_")
    return first + "".join(part.capitalize() for part in rest)


class CertificateArchiveSchema(BaseModel):
    model_config = ConfigDict(
        alias_generator=_camel,
        populate_by_name=True,
        serialize_by_alias=True,
        extra="forbid",
        from_attributes=True,
    )


class CertificateArchivePageInput(CertificateArchiveSchema):
    media_asset_id: UUID
    caption: str | None = Field(default=None, max_length=500)
    alt_text: str = Field(min_length=1, max_length=500)


class CertificateArchiveContentInput(CertificateArchiveSchema):
    title: str = Field(min_length=1, max_length=255)
    award_name: str | None = Field(default=None, max_length=255)
    certificate_number: str | None = Field(default=None, max_length=120)
    recipient_display_name: str | None = Field(default=None, max_length=255)
    issuer_name: str | None = Field(default=None, max_length=255)
    award_class: str | None = Field(default=None, max_length=255)
    issued_at: date | None = None
    issued_year: int | None = Field(default=None, ge=1, le=2200)
    public_note: str | None = Field(default=None, max_length=2_000)
    rights_confirmed: bool = False
    privacy_reviewed: bool = False
    pages: list[CertificateArchivePageInput] = Field(
        default_factory=list, max_length=20
    )


class CertificateArchiveCreateRequest(CertificateArchiveSchema):
    public_work_id: UUID
    content: CertificateArchiveContentInput


class CertificateArchiveUpdateRequest(CertificateArchiveSchema):
    expected_version: int = Field(ge=1)
    content: CertificateArchiveContentInput


class CertificateArchiveTransitionRequest(CertificateArchiveSchema):
    expected_version: int = Field(ge=1)
    reason: str | None = Field(default=None, max_length=2_000)


class CertificateArchivePageData(CertificateArchiveSchema):
    media_asset_id: UUID
    sort_order: int
    caption: str | None
    alt_text: str
    url: str | None = None
    mime_type: str | None = None
    width: int | None = None
    height: int | None = None


class CertificateArchiveContentData(CertificateArchiveSchema):
    title: str
    award_name: str | None
    certificate_number: str | None
    recipient_display_name: str | None
    issuer_name: str | None
    award_class: str | None
    issued_at: date | None
    issued_year: int | None
    public_note: str | None
    rights_confirmed: bool
    privacy_reviewed: bool
    pages: list[CertificateArchivePageData]


class CertificateArchiveManagerData(CertificateArchiveSchema):
    id: UUID
    public_work_id: UUID
    public_work_title: str
    status: str
    version: int
    draft_version_no: int
    published_version_no: int | None
    draft: CertificateArchiveContentData
    published: CertificateArchiveContentData | None
    updated_at: datetime


class PublicCertificateArchivePageData(CertificateArchiveSchema):
    id: UUID
    sort_order: int
    caption: str | None
    alt_text: str
    url: str
    mime_type: str
    width: int | None
    height: int | None


class PublicCertificateArchiveData(CertificateArchiveSchema):
    id: UUID
    title: str
    award_name: str | None
    certificate_number: str | None
    recipient_display_name: str | None
    issuer_name: str | None
    award_class: str | None
    issued_at: date | None
    issued_year: int | None
    public_note: str | None
    pages: list[PublicCertificateArchivePageData]
