from datetime import date, datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.modules.historical_nominations.models import (
    HistoricalAwardVerificationStatus,
    HistoricalImportRowStatus,
    HistoricalMediaKind,
    HistoricalNominationStatus,
    HistoricalPublicContentDraftStatus,
    HistoricalRelatedPersonRole,
    HistoricalSourceKind,
    HistoricalSubjectType,
)


def _camel(name: str) -> str:
    first, *rest = name.split("_")
    return first + "".join(part.capitalize() for part in rest)


class HistoricalSchema(BaseModel):
    model_config = ConfigDict(
        alias_generator=_camel,
        populate_by_name=True,
        serialize_by_alias=True,
        extra="forbid",
        from_attributes=True,
    )


class HistoricalNominationWrite(HistoricalSchema):
    subject_type: HistoricalSubjectType = HistoricalSubjectType.PERSON
    subject_name: Annotated[str | None, Field(max_length=255)] = None
    title: Annotated[str | None, Field(max_length=255)] = None
    summary: Annotated[str | None, Field(max_length=10_000)] = None
    description: Annotated[str | None, Field(max_length=50_000)] = None
    dossier_type_id: UUID | None = None
    category_id: UUID | None = None
    legacy_category_label: Annotated[str | None, Field(max_length=255)] = None
    nomination_year: Annotated[int | None, Field(ge=1, le=2200)] = None
    nominated_at: date | None = None
    historical_result: Annotated[str | None, Field(max_length=10_000)] = None
    source_kind: HistoricalSourceKind = HistoricalSourceKind.OTHER
    source_label: Annotated[str | None, Field(max_length=255)] = None
    source_reference: Annotated[str | None, Field(max_length=500)] = None
    source_recorded_at: date | None = None
    provenance_notes: Annotated[str | None, Field(max_length=10_000)] = None

    @field_validator("subject_name", "title", mode="before")
    @classmethod
    def strip_optional_text(cls, value: object) -> object:
        if not isinstance(value, str):
            return value
        return value.strip() or None


class HistoricalNominationPatch(HistoricalSchema):
    expected_updated_at: datetime | None = None
    subject_type: HistoricalSubjectType | None = None
    subject_name: Annotated[str | None, Field(max_length=255)] = None
    title: Annotated[str | None, Field(max_length=255)] = None
    summary: Annotated[str | None, Field(max_length=10_000)] = None
    description: Annotated[str | None, Field(max_length=50_000)] = None
    dossier_type_id: UUID | None = None
    category_id: UUID | None = None
    legacy_category_label: Annotated[str | None, Field(max_length=255)] = None
    nomination_year: Annotated[int | None, Field(ge=1, le=2200)] = None
    nominated_at: date | None = None
    historical_result: Annotated[str | None, Field(max_length=10_000)] = None
    source_kind: HistoricalSourceKind | None = None
    source_label: Annotated[str | None, Field(max_length=255)] = None
    source_reference: Annotated[str | None, Field(max_length=500)] = None
    source_recorded_at: date | None = None
    provenance_notes: Annotated[str | None, Field(max_length=10_000)] = None

    @field_validator("subject_name", "title", mode="before")
    @classmethod
    def strip_optional_text(cls, value: object) -> object:
        if not isinstance(value, str):
            return value
        return value.strip() or None


class HistoricalReviewRequest(HistoricalSchema):
    action: Annotated[str, Field(pattern="^(VERIFY|REQUEST_CORRECTION|HOLD|REJECT)$")]
    expected_updated_at: datetime
    reason: Annotated[str | None, Field(max_length=10_000)] = None


class HistoricalArchiveRequest(HistoricalSchema):
    reason: Annotated[str, Field(min_length=1, max_length=10_000)]
    expected_updated_at: datetime

    @field_validator("reason", mode="before")
    @classmethod
    def strip_reason(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class HistoricalPublicContentApproval(HistoricalSchema):
    expected_updated_at: datetime
    slug: Annotated[
        str, Field(min_length=1, max_length=180, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    ]
    title: Annotated[str, Field(min_length=1, max_length=255)]
    short_description: Annotated[str, Field(min_length=1, max_length=500)]
    full_description: Annotated[str | None, Field(max_length=50_000)] = None
    author_display_name: Annotated[str | None, Field(max_length=255)] = None
    category_id: UUID

    @field_validator("title", "short_description", mode="before")
    @classmethod
    def strip_public_text(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class HistoricalPublicContentApprovalData(HistoricalSchema):
    record_id: UUID
    public_work_id: UUID
    slug: str
    public_work_status: str
    approved_at: datetime


class HistoricalWorkspaceActivityData(HistoricalSchema):
    record_id: UUID
    record_code: str
    title: str
    action: str
    occurred_at: datetime


class HistoricalWorkspaceSummaryData(HistoricalSchema):
    total_records: int
    draft_count: int
    waiting_review_count: int
    needs_correction_count: int
    verified_count: int
    published_count: int
    recent_activity: list[HistoricalWorkspaceActivityData]


class HistoricalPublicContentDraftWrite(HistoricalSchema):
    expected_updated_at: datetime | None = None
    slug: Annotated[
        str | None,
        Field(max_length=180, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$"),
    ] = None
    title: Annotated[str | None, Field(max_length=255)] = None
    short_description: Annotated[str | None, Field(max_length=500)] = None
    full_description: Annotated[str | None, Field(max_length=50_000)] = None
    author_display_name: Annotated[str | None, Field(max_length=255)] = None
    category_id: UUID | None = None
    cover_media_id: UUID | None = None
    featured_video_media_id: UUID | None = None
    public_media_ids: list[UUID] = Field(default_factory=list, max_length=100)


class HistoricalPublicContentDraftData(HistoricalSchema):
    id: UUID
    nomination_id: UUID
    slug: str | None
    title: str | None
    short_description: str | None
    full_description: str | None
    author_display_name: str | None
    category_id: UUID | None
    cover_media_id: UUID | None
    featured_video_media_id: UUID | None
    public_media_ids: list[str]
    status: HistoricalPublicContentDraftStatus
    revision: int
    updated_at: datetime
    submitted_at: datetime | None


class HistoricalPublicContentDraftSubmit(HistoricalSchema):
    expected_updated_at: datetime


class HistoricalPublicContentPublish(HistoricalSchema):
    expected_draft_updated_at: datetime
    expected_work_version: int | None = Field(default=None, ge=1)


class HistoricalPublicationData(HistoricalSchema):
    record_id: UUID
    public_work_id: UUID
    slug: str
    publication_status: str
    version: int
    published_at: datetime | None


class HistoricalPublicationHide(HistoricalSchema):
    expected_work_version: int = Field(ge=1)


class HistoricalPublicContentVersionData(HistoricalSchema):
    id: UUID
    nomination_id: UUID
    version_no: int
    event_type: str
    snapshot_json: dict[str, object]
    created_by_user_id: UUID
    created_at: datetime


class HistoricalPublicContentVersionRestore(HistoricalSchema):
    expected_draft_updated_at: datetime | None = None


class HistoricalRecordActivityData(HistoricalSchema):
    id: UUID
    actor_user_id: UUID | None
    action: str
    changed_fields: list[str]
    occurred_at: datetime


class HistoricalPersonWrite(HistoricalSchema):
    display_name: Annotated[str, Field(min_length=1, max_length=255)]
    organization_name: Annotated[str | None, Field(max_length=255)] = None
    email: Annotated[str | None, Field(max_length=320)] = None
    phone: Annotated[str | None, Field(max_length=64)] = None
    address: Annotated[str | None, Field(max_length=1000)] = None
    internal_notes: Annotated[str | None, Field(max_length=10_000)] = None
    role: HistoricalRelatedPersonRole

    @field_validator("display_name", mode="before")
    @classmethod
    def strip_display_name(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class HistoricalPersonData(HistoricalSchema):
    id: UUID
    display_name: str
    organization_name: str | None
    email: str | None
    phone: str | None
    address: str | None
    internal_notes: str | None
    role: HistoricalRelatedPersonRole


class HistoricalAwardWrite(HistoricalSchema):
    award_name: Annotated[str, Field(min_length=1, max_length=255)]
    certificate_number: Annotated[str | None, Field(max_length=128)] = None
    issued_at: date | None = None
    issued_by: Annotated[str | None, Field(max_length=255)] = None
    recipient_person_id: UUID | None = None
    provenance_notes: Annotated[str | None, Field(max_length=10_000)] = None


class HistoricalAwardPatch(HistoricalSchema):
    expected_updated_at: datetime
    award_name: Annotated[str | None, Field(max_length=255)] = None
    certificate_number: Annotated[str | None, Field(max_length=128)] = None
    issued_at: date | None = None
    issued_by: Annotated[str | None, Field(max_length=255)] = None
    recipient_person_id: UUID | None = None
    provenance_notes: Annotated[str | None, Field(max_length=10_000)] = None

    @field_validator("award_name", mode="before")
    @classmethod
    def strip_award_name(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class HistoricalAwardVerificationRequest(HistoricalSchema):
    action: Annotated[
        str,
        Field(pattern="^(VERIFY|REQUEST_EVIDENCE|MARK_UNVERIFIABLE)$"),
    ]
    reason: Annotated[str | None, Field(max_length=10_000)] = None


class HistoricalAwardData(HistoricalSchema):
    id: UUID
    award_name: str
    certificate_number: str | None
    issued_at: date | None
    issued_by: str | None
    verification_status: HistoricalAwardVerificationStatus
    recipient_person_id: UUID | None
    provenance_notes: str | None
    updated_at: datetime


class HistoricalMediaLinkWrite(HistoricalSchema):
    media_id: UUID
    media_kind: HistoricalMediaKind
    award_id: UUID | None = None
    display_order: Annotated[int, Field(ge=0, le=100_000)] = 0


class HistoricalMediaLinkData(HistoricalSchema):
    id: UUID
    media_id: UUID
    media_kind: HistoricalMediaKind
    access_scope: str
    display_order: int
    award_id: UUID | None = None
    public_candidate: bool = False
    filename: str | None = None
    mime_type: str | None = None
    bytes: int | None = None
    status: str | None = None
    width: int | None = None
    height: int | None = None
    duration_ms: int | None = None
    uploaded_at: datetime | None = None


class HistoricalMediaLibraryItemData(HistoricalSchema):
    id: UUID
    media_id: UUID
    record_id: UUID
    record_code: str
    record_title: str
    media_kind: HistoricalMediaKind
    public_candidate: bool
    filename: str
    mime_type: str
    bytes: int
    status: str
    width: int | None
    height: int | None
    duration_ms: int | None
    attached_at: datetime
    award_id: UUID | None


class HistoricalAwardLibraryItemData(HistoricalSchema):
    id: UUID
    record_id: UUID
    record_code: str
    subject_name: str | None
    award_name: str
    certificate_number: str | None
    issued_at: date | None
    issued_by: str | None
    verification_status: HistoricalAwardVerificationStatus
    recipient_person_id: UUID | None
    provenance_notes: str | None


class HistoricalImportPreviewRequest(HistoricalSchema):
    column_mapping: dict[str, str] = Field(max_length=20)


class HistoricalImportRowData(HistoricalSchema):
    source_row_number: int
    status: HistoricalImportRowStatus
    error_code: str | None
    payload: dict[str, str]


class HistoricalImportPreviewData(HistoricalSchema):
    batch_id: UUID
    headers: list[str]
    rows: list[HistoricalImportRowData]
    total_rows: int
    valid_count: int
    duplicate_count: int
    rejected_count: int


class HistoricalImportUploadData(HistoricalSchema):
    batch_id: UUID
    headers: list[str]
    sample_rows: list[dict[str, str]]
    total_rows: int


class HistoricalImportResultData(HistoricalSchema):
    batch_id: UUID
    imported_count: int
    rejected_count: int
    duplicate_count: int


class HistoricalNominationData(HistoricalSchema):
    id: UUID
    code: str
    subject_type: HistoricalSubjectType
    subject_name: str | None
    title: str
    summary: str | None
    description: str | None
    dossier_type_id: UUID | None = None
    category_id: UUID | None
    legacy_category_label: str | None
    nomination_year: int | None
    nominated_at: date | None
    historical_result: str | None
    source_kind: HistoricalSourceKind
    source_label: str | None
    source_reference: str | None
    source_recorded_at: date | None
    provenance_notes: str | None
    verification_status: HistoricalNominationStatus
    archive_status: str
    archive_reason: str | None
    publication_status: str
    missing_fields_json: list[str]
    submitted_at: datetime | None
    verified_at: datetime | None
    verification_reason: str | None
    created_at: datetime
    updated_at: datetime
    media_count: int = 0


class HistoricalNominationListData(HistoricalSchema):
    items: list[HistoricalNominationData]
    page: int
    page_size: int
    total: int
