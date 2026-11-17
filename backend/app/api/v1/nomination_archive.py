"""Approved SUPER_ADMIN read surface for retained nomination source records."""

from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, Request

from app.core.schemas import (
    ListResponseMeta,
    PaginatedSuccessEnvelope,
    ResponseMeta,
    SuccessEnvelope,
)
from app.modules.auth.dependencies import CurrentPrincipalDependency, SessionDependency
from app.modules.dossiers.archive_schemas import (
    ArchiveEntry,
    ArchiveRecord,
    ArchiveSection,
    ArchiveSource,
)
from app.modules.dossiers.archive_service import NominationArchiveService

router = APIRouter(
    prefix="/api/v1/admin/nomination-records", tags=["nomination archive"]
)


@router.get("", response_model=PaginatedSuccessEnvelope[list[ArchiveRecord]])
async def list_nomination_archive(
    request: Request,
    principal: CurrentPrincipalDependency,
    session: SessionDependency,
    query: Annotated[str | None, Query(max_length=255)] = None,
    source: ArchiveSource | None = None,
    category_id: UUID | None = None,
    year: Annotated[int | None, Query(ge=1, le=2200)] = None,
    business_status: Annotated[str | None, Query(max_length=64)] = None,
    publication_status: Annotated[str | None, Query(max_length=64)] = None,
    archive_status: Annotated[str | None, Query(max_length=64)] = None,
    owner_user_id: UUID | None = None,
    recorded_from: date | None = None,
    recorded_to: date | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
) -> PaginatedSuccessEnvelope[list[ArchiveRecord]]:
    items, total = await NominationArchiveService(session).list_records(
        principal,
        query=query,
        source=source,
        category_id=category_id,
        year=year,
        business_status=business_status,
        publication_status=publication_status,
        archive_status=archive_status,
        owner_user_id=owner_user_id,
        recorded_from=recorded_from,
        recorded_to=recorded_to,
        page=page,
        page_size=page_size,
    )
    return PaginatedSuccessEnvelope(
        data=items,
        meta=ListResponseMeta(
            request_id=request.state.request_id,
            page=page,
            page_size=page_size,
            total=total,
        ),
    )


@router.get("/{source}/{record_id}", response_model=SuccessEnvelope[ArchiveRecord])
async def get_nomination_archive(
    source: ArchiveSource,
    record_id: UUID,
    request: Request,
    principal: CurrentPrincipalDependency,
    session: SessionDependency,
) -> SuccessEnvelope[ArchiveRecord]:
    return SuccessEnvelope(
        data=await NominationArchiveService(session).get_record(
            principal, source, record_id
        ),
        meta=ResponseMeta(request_id=request.state.request_id),
    )


@router.get(
    "/{source}/{record_id}/{section}",
    response_model=PaginatedSuccessEnvelope[list[ArchiveEntry]],
)
async def get_nomination_archive_section(
    source: ArchiveSource,
    record_id: UUID,
    section: ArchiveSection,
    request: Request,
    principal: CurrentPrincipalDependency,
    session: SessionDependency,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
) -> PaginatedSuccessEnvelope[list[ArchiveEntry]]:
    items, total = await NominationArchiveService(session).section(
        principal, source, record_id, section, page=page, page_size=page_size
    )
    return PaginatedSuccessEnvelope(
        data=items,
        meta=ListResponseMeta(
            request_id=request.state.request_id,
            page=page,
            page_size=page_size,
            total=total,
        ),
    )
