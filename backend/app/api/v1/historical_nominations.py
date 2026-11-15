from typing import Annotated
from urllib.parse import unquote
from uuid import UUID

from fastapi import APIRouter, Header, Query, Request, status

from app.core.schemas import (
    ListResponseMeta,
    PaginatedSuccessEnvelope,
    ResponseMeta,
    SuccessEnvelope,
)
from app.modules.auth.dependencies import (
    CsrfProtectedPrincipalDependency,
    CurrentPrincipalDependency,
)
from app.modules.historical_nominations.dependencies import (
    HistoricalImportServiceDependency,
    HistoricalNominationServiceDependency,
)
from app.modules.historical_nominations.errors import (
    HistoricalNominationValidationError,
)
from app.modules.historical_nominations.import_parser import MAX_IMPORT_BYTES
from app.modules.historical_nominations.import_service import (
    mapped_payload,
    source_payload,
)
from app.modules.historical_nominations.models import (
    HistoricalMediaKind,
    HistoricalNominationPublicationStatus,
    HistoricalNominationStatus,
)
from app.modules.historical_nominations.schemas import (
    HistoricalArchiveRequest,
    HistoricalAwardData,
    HistoricalAwardLibraryItemData,
    HistoricalAwardVerificationRequest,
    HistoricalAwardWrite,
    HistoricalImportPreviewData,
    HistoricalImportPreviewRequest,
    HistoricalImportResultData,
    HistoricalImportRowData,
    HistoricalImportUploadData,
    HistoricalMediaLibraryItemData,
    HistoricalMediaLinkData,
    HistoricalMediaLinkWrite,
    HistoricalNominationData,
    HistoricalNominationPatch,
    HistoricalNominationWrite,
    HistoricalPersonData,
    HistoricalPersonWrite,
    HistoricalPublicationData,
    HistoricalPublicationHide,
    HistoricalPublicContentApproval,
    HistoricalPublicContentApprovalData,
    HistoricalPublicContentDraftData,
    HistoricalPublicContentDraftSubmit,
    HistoricalPublicContentDraftWrite,
    HistoricalPublicContentPublish,
    HistoricalPublicContentVersionData,
    HistoricalPublicContentVersionRestore,
    HistoricalRecordActivityData,
    HistoricalReviewRequest,
    HistoricalWorkspaceSummaryData,
)
from app.modules.public.publication_dependencies import PublicationServiceDependency

router = APIRouter(
    prefix="/api/v1/historical-nominations",
    tags=["historical nominations"],
)


def _activity_fields(after: dict[str, object] | None) -> list[str]:
    if not after:
        return []
    changed = after.get("changed_fields")
    if isinstance(changed, list):
        return sorted(item for item in changed if isinstance(item, str))
    return sorted(after)


@router.post(
    "/imports/upload",
    status_code=status.HTTP_201_CREATED,
    response_model=SuccessEnvelope[HistoricalImportUploadData],
)
async def upload_import(
    request: Request,
    principal: CsrfProtectedPrincipalDependency,
    service: HistoricalImportServiceDependency,
    filename: Annotated[str, Header(alias="X-Filename", min_length=1, max_length=255)],
    idempotency_key: Annotated[
        str,
        Header(alias="Idempotency-Key", min_length=1, max_length=160),
    ],
) -> SuccessEnvelope[HistoricalImportUploadData]:
    length = request.headers.get("content-length")
    try:
        parsed_length = int(length) if length else 0
    except ValueError as exc:
        raise HistoricalNominationValidationError(
            "Content-Length header is invalid."
        ) from exc
    if parsed_length > MAX_IMPORT_BYTES:
        raise HistoricalNominationValidationError("Import file is too large.")
    filename = unquote(filename)
    if (
        filename != filename.strip()
        or filename in {".", ".."}
        or "/" in filename
        or "\\" in filename
        or any(ord(character) < 32 for character in filename)
    ):
        raise HistoricalNominationValidationError("Import filename is invalid.")
    content = bytearray()
    async for chunk in request.stream():
        content.extend(chunk)
        if len(content) > MAX_IMPORT_BYTES:
            raise HistoricalNominationValidationError("Import file is too large.")
    batch, rows, headers = await service.upload(
        principal,
        filename=filename,
        content=bytes(content),
        idempotency_key=idempotency_key,
    )
    data = HistoricalImportUploadData(
        batch_id=batch.id,
        headers=headers,
        sample_rows=[source_payload(row) for row in rows[:10]],
        total_rows=len(rows),
    )
    return SuccessEnvelope(
        data=data,
        meta=ResponseMeta(request_id=request.state.request_id),
    )


@router.post(
    "/imports/{batch_id}/preview",
    response_model=SuccessEnvelope[HistoricalImportPreviewData],
)
async def preview_import(
    batch_id: UUID,
    payload: HistoricalImportPreviewRequest,
    request: Request,
    principal: CsrfProtectedPrincipalDependency,
    service: HistoricalImportServiceDependency,
) -> SuccessEnvelope[HistoricalImportPreviewData]:
    batch, rows, headers = await service.preview(
        principal,
        batch_id,
        payload.column_mapping,
    )
    data = HistoricalImportPreviewData(
        batch_id=batch.id,
        headers=headers,
        total_rows=len(rows),
        valid_count=sum(row.status.value == "VALID" for row in rows),
        duplicate_count=sum(row.status.value == "DUPLICATE" for row in rows),
        rejected_count=sum(row.status.value == "REJECTED" for row in rows),
        rows=[
            HistoricalImportRowData(
                source_row_number=row.source_row_number,
                status=row.status,
                error_code=row.error_code,
                payload=mapped_payload(row),
            )
            for row in rows[:100]
        ],
    )
    return SuccessEnvelope(
        data=data,
        meta=ResponseMeta(request_id=request.state.request_id),
    )


@router.post(
    "/imports/{batch_id}/confirm",
    response_model=SuccessEnvelope[HistoricalImportResultData],
)
async def confirm_import(
    batch_id: UUID,
    request: Request,
    principal: CsrfProtectedPrincipalDependency,
    service: HistoricalImportServiceDependency,
) -> SuccessEnvelope[HistoricalImportResultData]:
    imported, rejected, duplicates = await service.confirm(principal, batch_id)
    return SuccessEnvelope(
        data=HistoricalImportResultData(
            batch_id=batch_id,
            imported_count=imported,
            rejected_count=rejected,
            duplicate_count=duplicates,
        ),
        meta=ResponseMeta(request_id=request.state.request_id),
    )


@router.delete(
    "/{record_id}/media/{link_id}",
    response_model=SuccessEnvelope[dict[str, bool]],
)
async def unlink_historical_media(
    record_id: UUID,
    link_id: UUID,
    request: Request,
    principal: CsrfProtectedPrincipalDependency,
    service: HistoricalNominationServiceDependency,
) -> SuccessEnvelope[dict[str, bool]]:
    await service.unlink_media(principal, record_id, link_id)
    return SuccessEnvelope(
        data={"unlinked": True},
        meta=ResponseMeta(request_id=request.state.request_id),
    )


@router.get(
    "/review-queue",
    response_model=PaginatedSuccessEnvelope[list[HistoricalNominationData]],
)
async def get_review_queue(
    request: Request,
    principal: CurrentPrincipalDependency,
    service: HistoricalNominationServiceDependency,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
) -> PaginatedSuccessEnvelope[list[HistoricalNominationData]]:
    records, total = await service.list_review_queue(
        principal,
        page=page,
        page_size=page_size,
    )
    return PaginatedSuccessEnvelope(
        data=[HistoricalNominationData.model_validate(record) for record in records],
        meta=ListResponseMeta(
            request_id=request.state.request_id,
            page=page,
            page_size=page_size,
            total=total,
        ),
    )


@router.get("", response_model=PaginatedSuccessEnvelope[list[HistoricalNominationData]])
async def list_historical_nominations(
    request: Request,
    principal: CurrentPrincipalDependency,
    service: HistoricalNominationServiceDependency,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
    query: Annotated[str | None, Query(max_length=255)] = None,
    record_status: Annotated[
        HistoricalNominationStatus | None,
        Query(alias="status"),
    ] = None,
    publication_status: HistoricalNominationPublicationStatus | None = None,
    year: Annotated[int | None, Query(ge=1, le=2200)] = None,
    category_id: UUID | None = None,
    dossier_type_id: UUID | None = None,
) -> PaginatedSuccessEnvelope[list[HistoricalNominationData]]:
    records, total = await service.list_records(
        principal,
        page=page,
        page_size=page_size,
        query=query,
        status=record_status,
        publication_status=publication_status,
        year=year,
        category_id=category_id,
        dossier_type_id=dossier_type_id,
    )
    media_counts = await service.media_counts(
        principal,
        [record.id for record in records],
    )
    items = [HistoricalNominationData.model_validate(record) for record in records]
    for item in items:
        item.media_count = media_counts.get(item.id, 0)
    return PaginatedSuccessEnvelope(
        data=items,
        meta=ListResponseMeta(
            request_id=request.state.request_id,
            page=page,
            page_size=page_size,
            total=total,
        ),
    )


@router.get(
    "/dashboard-summary",
    response_model=SuccessEnvelope[HistoricalWorkspaceSummaryData],
)
async def get_historical_dashboard_summary(
    request: Request,
    principal: CurrentPrincipalDependency,
    service: HistoricalNominationServiceDependency,
) -> SuccessEnvelope[HistoricalWorkspaceSummaryData]:
    summary = await service.dashboard_summary(principal)
    return SuccessEnvelope(
        data=HistoricalWorkspaceSummaryData.model_validate(summary),
        meta=ResponseMeta(request_id=request.state.request_id),
    )


@router.get(
    "/media-library",
    response_model=PaginatedSuccessEnvelope[list[HistoricalMediaLibraryItemData]],
)
async def get_historical_media_library(
    request: Request,
    principal: CurrentPrincipalDependency,
    service: HistoricalNominationServiceDependency,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 50,
    query: Annotated[str | None, Query(max_length=255)] = None,
    media_kind: Annotated[HistoricalMediaKind | None, Query()] = None,
) -> PaginatedSuccessEnvelope[list[HistoricalMediaLibraryItemData]]:
    rows, total = await service.list_media_library(
        principal,
        page=page,
        page_size=page_size,
        query=query,
        media_kind=media_kind,
    )
    return PaginatedSuccessEnvelope(
        data=[
            HistoricalMediaLibraryItemData(
                id=link.id,
                media_id=asset.id,
                record_id=record.id,
                record_code=record.code,
                record_title=record.title,
                media_kind=link.media_kind,
                public_candidate=link.public_candidate,
                filename=asset.original_filename,
                mime_type=asset.mime_type,
                bytes=asset.bytes,
                status=asset.status.value,
                width=asset.width,
                height=asset.height,
                duration_ms=asset.duration_ms,
                attached_at=link.attached_at,
                award_id=link.award_id,
            )
            for link, asset, record in rows
        ],
        meta=ListResponseMeta(
            request_id=request.state.request_id,
            page=page,
            page_size=page_size,
            total=total,
        ),
    )


@router.get(
    "/awards-library",
    response_model=PaginatedSuccessEnvelope[list[HistoricalAwardLibraryItemData]],
)
async def get_historical_awards_library(
    request: Request,
    principal: CurrentPrincipalDependency,
    service: HistoricalNominationServiceDependency,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 50,
    query: Annotated[str | None, Query(max_length=255)] = None,
) -> PaginatedSuccessEnvelope[list[HistoricalAwardLibraryItemData]]:
    rows, total = await service.list_award_library(
        principal,
        page=page,
        page_size=page_size,
        query=query,
    )
    return PaginatedSuccessEnvelope(
        data=[
            HistoricalAwardLibraryItemData(
                id=award.id,
                record_id=record.id,
                record_code=record.code,
                subject_name=record.subject_name,
                award_name=award.award_name,
                certificate_number=award.certificate_number,
                issued_at=award.issued_at,
                issued_by=award.issued_by,
                verification_status=award.verification_status,
                recipient_person_id=award.recipient_person_id,
                provenance_notes=award.provenance_notes,
            )
            for award, record in rows
        ],
        meta=ListResponseMeta(
            request_id=request.state.request_id,
            page=page,
            page_size=page_size,
            total=total,
        ),
    )


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_historical_nomination(
    payload: HistoricalNominationWrite,
    request: Request,
    principal: CsrfProtectedPrincipalDependency,
    service: HistoricalNominationServiceDependency,
) -> SuccessEnvelope[HistoricalNominationData]:
    record = await service.create_record(principal, payload)
    return SuccessEnvelope(
        data=HistoricalNominationData.model_validate(record),
        meta=ResponseMeta(request_id=request.state.request_id),
    )


@router.get("/{record_id}", response_model=SuccessEnvelope[HistoricalNominationData])
async def get_historical_nomination(
    record_id: UUID,
    request: Request,
    principal: CurrentPrincipalDependency,
    service: HistoricalNominationServiceDependency,
) -> SuccessEnvelope[HistoricalNominationData]:
    record = await service.get_record(principal, record_id)
    return SuccessEnvelope(
        data=HistoricalNominationData.model_validate(record),
        meta=ResponseMeta(request_id=request.state.request_id),
    )


@router.get(
    "/{record_id}/public-content-draft",
    response_model=SuccessEnvelope[HistoricalPublicContentDraftData | None],
)
async def get_historical_public_content_draft(
    record_id: UUID,
    request: Request,
    principal: CurrentPrincipalDependency,
    service: HistoricalNominationServiceDependency,
) -> SuccessEnvelope[HistoricalPublicContentDraftData | None]:
    draft = await service.get_public_content_draft(principal, record_id)
    return SuccessEnvelope(
        data=HistoricalPublicContentDraftData.model_validate(draft)
        if draft is not None
        else None,
        meta=ResponseMeta(request_id=request.state.request_id),
    )


@router.put(
    "/{record_id}/public-content-draft",
    response_model=SuccessEnvelope[HistoricalPublicContentDraftData],
)
async def save_historical_public_content_draft(
    record_id: UUID,
    payload: HistoricalPublicContentDraftWrite,
    request: Request,
    principal: CsrfProtectedPrincipalDependency,
    service: HistoricalNominationServiceDependency,
) -> SuccessEnvelope[HistoricalPublicContentDraftData]:
    draft = await service.save_public_content_draft(principal, record_id, payload)
    return SuccessEnvelope(
        data=HistoricalPublicContentDraftData.model_validate(draft),
        meta=ResponseMeta(request_id=request.state.request_id),
    )


@router.post(
    "/{record_id}/public-content-draft/submit",
    response_model=SuccessEnvelope[HistoricalPublicContentDraftData],
)
async def submit_historical_public_content_draft(
    record_id: UUID,
    payload: HistoricalPublicContentDraftSubmit,
    request: Request,
    principal: CsrfProtectedPrincipalDependency,
    service: HistoricalNominationServiceDependency,
) -> SuccessEnvelope[HistoricalPublicContentDraftData]:
    draft = await service.submit_public_content_draft(
        principal,
        record_id,
        payload.expected_updated_at,
    )
    return SuccessEnvelope(
        data=HistoricalPublicContentDraftData.model_validate(draft),
        meta=ResponseMeta(request_id=request.state.request_id),
    )


@router.post(
    "/{record_id}/publish",
    response_model=SuccessEnvelope[HistoricalPublicationData],
)
async def publish_historical_nomination(
    record_id: UUID,
    payload: HistoricalPublicContentPublish,
    request: Request,
    principal: CsrfProtectedPrincipalDependency,
    service: PublicationServiceDependency,
) -> SuccessEnvelope[HistoricalPublicationData]:
    work = await service.publish_historical_record(
        principal,
        record_id,
        expected_draft_updated_at=payload.expected_draft_updated_at,
        expected_work_version=payload.expected_work_version,
        request_id=request.state.request_id,
    )
    return SuccessEnvelope(
        data=HistoricalPublicationData(
            record_id=record_id,
            public_work_id=work.id,
            slug=work.slug,
            publication_status=work.publication_status.value,
            version=work.version,
            published_at=work.published_at,
        ),
        meta=ResponseMeta(request_id=request.state.request_id),
    )


@router.post(
    "/{record_id}/hide",
    response_model=SuccessEnvelope[HistoricalPublicationData],
)
async def hide_historical_nomination(
    record_id: UUID,
    payload: HistoricalPublicationHide,
    request: Request,
    principal: CsrfProtectedPrincipalDependency,
    service: PublicationServiceDependency,
) -> SuccessEnvelope[HistoricalPublicationData]:
    work = await service.hide_historical_record(
        principal,
        record_id,
        expected_work_version=payload.expected_work_version,
        request_id=request.state.request_id,
    )
    return SuccessEnvelope(
        data=HistoricalPublicationData(
            record_id=record_id,
            public_work_id=work.id,
            slug=work.slug,
            publication_status=work.publication_status.value,
            version=work.version,
            published_at=work.published_at,
        ),
        meta=ResponseMeta(request_id=request.state.request_id),
    )


@router.get(
    "/{record_id}/publication",
    response_model=SuccessEnvelope[HistoricalPublicationData | None],
)
async def get_historical_publication(
    record_id: UUID,
    request: Request,
    principal: CurrentPrincipalDependency,
    service: PublicationServiceDependency,
) -> SuccessEnvelope[HistoricalPublicationData | None]:
    work = await service.get_historical_publication(principal, record_id)
    return SuccessEnvelope(
        data=(
            HistoricalPublicationData(
                record_id=record_id,
                public_work_id=work.id,
                slug=work.slug,
                publication_status=work.publication_status.value,
                version=work.version,
                published_at=work.published_at,
            )
            if work is not None
            else None
        ),
        meta=ResponseMeta(request_id=request.state.request_id),
    )


@router.get(
    "/{record_id}/activity",
    response_model=SuccessEnvelope[list[HistoricalRecordActivityData]],
)
async def list_historical_record_activity(
    record_id: UUID,
    request: Request,
    principal: CurrentPrincipalDependency,
    service: HistoricalNominationServiceDependency,
) -> SuccessEnvelope[list[HistoricalRecordActivityData]]:
    activity = await service.list_record_activity(principal, record_id)
    return SuccessEnvelope(
        data=[
            HistoricalRecordActivityData(
                id=item.id,
                actor_user_id=item.actor_user_id,
                action=item.action,
                changed_fields=_activity_fields(item.after_json),
                occurred_at=item.created_at,
            )
            for item in activity
        ],
        meta=ResponseMeta(request_id=request.state.request_id),
    )


@router.get(
    "/{record_id}/public-content-versions",
    response_model=SuccessEnvelope[list[HistoricalPublicContentVersionData]],
)
async def list_historical_public_content_versions(
    record_id: UUID,
    request: Request,
    principal: CurrentPrincipalDependency,
    service: HistoricalNominationServiceDependency,
) -> SuccessEnvelope[list[HistoricalPublicContentVersionData]]:
    versions = await service.list_public_content_versions(principal, record_id)
    return SuccessEnvelope(
        data=[
            HistoricalPublicContentVersionData.model_validate(item)
            for item in versions
        ],
        meta=ResponseMeta(request_id=request.state.request_id),
    )


@router.post(
    "/{record_id}/public-content-versions/{version_id}/restore",
    response_model=SuccessEnvelope[HistoricalPublicContentDraftData],
)
async def restore_historical_public_content_version(
    record_id: UUID,
    version_id: UUID,
    payload: HistoricalPublicContentVersionRestore,
    request: Request,
    principal: CsrfProtectedPrincipalDependency,
    service: HistoricalNominationServiceDependency,
) -> SuccessEnvelope[HistoricalPublicContentDraftData]:
    draft = await service.restore_public_content_version(
        principal,
        record_id,
        version_id,
        payload,
    )
    return SuccessEnvelope(
        data=HistoricalPublicContentDraftData.model_validate(draft),
        meta=ResponseMeta(request_id=request.state.request_id),
    )

@router.patch("/{record_id}", response_model=SuccessEnvelope[HistoricalNominationData])
async def patch_historical_nomination(
    record_id: UUID,
    payload: HistoricalNominationPatch,
    request: Request,
    principal: CsrfProtectedPrincipalDependency,
    service: HistoricalNominationServiceDependency,
) -> SuccessEnvelope[HistoricalNominationData]:
    record = await service.patch_record(
        principal,
        record_id,
        payload.model_dump(exclude_unset=True),
    )
    return SuccessEnvelope(
        data=HistoricalNominationData.model_validate(record),
        meta=ResponseMeta(request_id=request.state.request_id),
    )


@router.post(
    "/{record_id}/submit",
    response_model=SuccessEnvelope[HistoricalNominationData],
)
async def submit_historical_nomination(
    record_id: UUID,
    request: Request,
    principal: CsrfProtectedPrincipalDependency,
    service: HistoricalNominationServiceDependency,
) -> SuccessEnvelope[HistoricalNominationData]:
    record = await service.submit_record(principal, record_id)
    return SuccessEnvelope(
        data=HistoricalNominationData.model_validate(record),
        meta=ResponseMeta(request_id=request.state.request_id),
    )


@router.post(
    "/{record_id}/review",
    response_model=SuccessEnvelope[HistoricalNominationData],
)
async def review_historical_nomination(
    record_id: UUID,
    payload: HistoricalReviewRequest,
    request: Request,
    principal: CsrfProtectedPrincipalDependency,
    service: HistoricalNominationServiceDependency,
) -> SuccessEnvelope[HistoricalNominationData]:
    record = await service.review_record(
        principal,
        record_id,
        action=payload.action,
        reason=payload.reason,
        expected_updated_at=payload.expected_updated_at,
    )
    return SuccessEnvelope(
        data=HistoricalNominationData.model_validate(record),
        meta=ResponseMeta(request_id=request.state.request_id),
    )


@router.post(
    "/{record_id}/public-content",
    response_model=SuccessEnvelope[HistoricalPublicContentApprovalData],
)
async def approve_historical_public_content(
    record_id: UUID,
    payload: HistoricalPublicContentApproval,
    request: Request,
    principal: CsrfProtectedPrincipalDependency,
    service: HistoricalNominationServiceDependency,
) -> SuccessEnvelope[HistoricalPublicContentApprovalData]:
    work = await service.approve_public_content(principal, record_id, payload)
    record = await service.get_record(principal, record_id)
    if record.public_content_approved_at is None:
        raise HistoricalNominationValidationError(
            "Approved content timestamp was not recorded."
        )
    return SuccessEnvelope(
        data=HistoricalPublicContentApprovalData(
            record_id=record.id,
            public_work_id=work.id,
            slug=work.slug,
            public_work_status=work.publication_status.value,
            approved_at=record.public_content_approved_at,
        ),
        meta=ResponseMeta(request_id=request.state.request_id),
    )


@router.post(
    "/{record_id}/archive",
    response_model=SuccessEnvelope[HistoricalNominationData],
)
async def archive_historical_nomination(
    record_id: UUID,
    payload: HistoricalArchiveRequest,
    request: Request,
    principal: CsrfProtectedPrincipalDependency,
    service: HistoricalNominationServiceDependency,
) -> SuccessEnvelope[HistoricalNominationData]:
    record = await service.archive_record(
        principal,
        record_id,
        reason=payload.reason,
        expected_updated_at=payload.expected_updated_at,
    )
    return SuccessEnvelope(
        data=HistoricalNominationData.model_validate(record),
        meta=ResponseMeta(request_id=request.state.request_id),
    )


@router.get(
    "/{record_id}/people",
    response_model=SuccessEnvelope[list[HistoricalPersonData]],
)
async def list_historical_people(
    record_id: UUID,
    request: Request,
    principal: CurrentPrincipalDependency,
    service: HistoricalNominationServiceDependency,
) -> SuccessEnvelope[list[HistoricalPersonData]]:
    people = await service.list_people(principal, record_id)
    return SuccessEnvelope(
        data=[
            HistoricalPersonData(
                id=person.id,
                display_name=person.display_name,
                organization_name=person.organization_name,
                email=person.email,
                phone=person.phone,
                address=person.address,
                internal_notes=person.internal_notes,
                role=role,
            )
            for person, role in people
        ],
        meta=ResponseMeta(request_id=request.state.request_id),
    )


@router.post(
    "/{record_id}/people",
    status_code=status.HTTP_201_CREATED,
    response_model=SuccessEnvelope[HistoricalPersonData],
)
async def add_historical_person(
    record_id: UUID,
    payload: HistoricalPersonWrite,
    request: Request,
    principal: CsrfProtectedPrincipalDependency,
    service: HistoricalNominationServiceDependency,
) -> SuccessEnvelope[HistoricalPersonData]:
    person, role = await service.add_person(principal, record_id, payload)
    return SuccessEnvelope(
        data=HistoricalPersonData(
            id=person.id,
            display_name=person.display_name,
            organization_name=person.organization_name,
            email=person.email,
            phone=person.phone,
            address=person.address,
            internal_notes=person.internal_notes,
            role=role,
        ),
        meta=ResponseMeta(request_id=request.state.request_id),
    )


@router.get(
    "/{record_id}/awards",
    response_model=SuccessEnvelope[list[HistoricalAwardData]],
)
async def list_historical_awards(
    record_id: UUID,
    request: Request,
    principal: CurrentPrincipalDependency,
    service: HistoricalNominationServiceDependency,
) -> SuccessEnvelope[list[HistoricalAwardData]]:
    awards = await service.list_awards(principal, record_id)
    return SuccessEnvelope(
        data=[HistoricalAwardData.model_validate(award) for award in awards],
        meta=ResponseMeta(request_id=request.state.request_id),
    )


@router.post(
    "/{record_id}/awards",
    status_code=status.HTTP_201_CREATED,
    response_model=SuccessEnvelope[HistoricalAwardData],
)
async def add_historical_award(
    record_id: UUID,
    payload: HistoricalAwardWrite,
    request: Request,
    principal: CsrfProtectedPrincipalDependency,
    service: HistoricalNominationServiceDependency,
) -> SuccessEnvelope[HistoricalAwardData]:
    award = await service.add_award(principal, record_id, payload)
    return SuccessEnvelope(
        data=HistoricalAwardData.model_validate(award),
        meta=ResponseMeta(request_id=request.state.request_id),
    )


@router.post(
    "/{record_id}/awards/{award_id}/verification",
    response_model=SuccessEnvelope[HistoricalAwardData],
)
async def review_historical_award(
    record_id: UUID,
    award_id: UUID,
    payload: HistoricalAwardVerificationRequest,
    request: Request,
    principal: CsrfProtectedPrincipalDependency,
    service: HistoricalNominationServiceDependency,
) -> SuccessEnvelope[HistoricalAwardData]:
    award = await service.review_award(
        principal,
        record_id,
        award_id,
        action=payload.action,
        reason=payload.reason,
    )
    return SuccessEnvelope(
        data=HistoricalAwardData.model_validate(award),
        meta=ResponseMeta(request_id=request.state.request_id),
    )


@router.get(
    "/{record_id}/media",
    response_model=SuccessEnvelope[list[HistoricalMediaLinkData]],
)
async def list_historical_media(
    record_id: UUID,
    request: Request,
    principal: CurrentPrincipalDependency,
    service: HistoricalNominationServiceDependency,
) -> SuccessEnvelope[list[HistoricalMediaLinkData]]:
    links = await service.list_media(principal, record_id)
    return SuccessEnvelope(
        data=[
            HistoricalMediaLinkData(
                id=link.id,
                media_id=link.media_asset_id,
                media_kind=link.media_kind,
                access_scope=link.access_scope.value,
                display_order=link.display_order,
                award_id=link.award_id,
                public_candidate=link.public_candidate,
                filename=asset.original_filename,
                mime_type=asset.mime_type,
                bytes=asset.bytes,
                status=asset.status.value,
                width=asset.width,
                height=asset.height,
                duration_ms=asset.duration_ms,
                uploaded_at=asset.created_at,
            )
            for link, asset in links
        ],
        meta=ResponseMeta(request_id=request.state.request_id),
    )


@router.post(
    "/{record_id}/media",
    status_code=status.HTTP_201_CREATED,
    response_model=SuccessEnvelope[HistoricalMediaLinkData],
)
async def link_historical_media(
    record_id: UUID,
    payload: HistoricalMediaLinkWrite,
    request: Request,
    principal: CsrfProtectedPrincipalDependency,
    service: HistoricalNominationServiceDependency,
) -> SuccessEnvelope[HistoricalMediaLinkData]:
    link = await service.link_media(
        principal,
        record_id,
        media_id=payload.media_id,
        media_kind=payload.media_kind,
        award_id=payload.award_id,
        display_order=payload.display_order,
    )
    return SuccessEnvelope(
        data=HistoricalMediaLinkData(
            id=link.id,
            media_id=link.media_asset_id,
            media_kind=link.media_kind,
            access_scope=link.access_scope.value,
            display_order=link.display_order,
            award_id=link.award_id,
            public_candidate=link.public_candidate,
        ),
        meta=ResponseMeta(request_id=request.state.request_id),
    )
