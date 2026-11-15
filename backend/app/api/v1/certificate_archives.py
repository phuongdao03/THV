from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, Request, status

from app.core.schemas import ResponseMeta, SuccessEnvelope
from app.modules.auth.dependencies import (
    CsrfProtectedPrincipalDependency,
    CurrentPrincipalDependency,
)
from app.modules.certificate_archives.dependencies import (
    CertificateArchiveServiceDependency,
)
from app.modules.certificate_archives.schemas import (
    CertificateArchiveCreateRequest,
    CertificateArchiveManagerData,
    CertificateArchiveTransitionRequest,
    CertificateArchiveUpdateRequest,
)

router = APIRouter(
    prefix="/api/v1/admin/certificate-archives",
    tags=["certificate-archives"],
)


@router.get("", response_model=SuccessEnvelope[list[CertificateArchiveManagerData]])
async def list_certificate_archives(
    request: Request,
    principal: CurrentPrincipalDependency,
    service: CertificateArchiveServiceDependency,
    public_work_id: Annotated[UUID | None, Query(alias="publicWorkId")] = None,
) -> SuccessEnvelope[list[CertificateArchiveManagerData]]:
    rows = await service.list(principal, public_work_id=public_work_id)
    return SuccessEnvelope(
        data=list(rows), meta=ResponseMeta(request_id=request.state.request_id)
    )


@router.get(
    "/{archive_id}", response_model=SuccessEnvelope[CertificateArchiveManagerData]
)
async def get_certificate_archive(
    archive_id: UUID,
    request: Request,
    principal: CurrentPrincipalDependency,
    service: CertificateArchiveServiceDependency,
) -> SuccessEnvelope[CertificateArchiveManagerData]:
    row = await service.get(principal, archive_id)
    return SuccessEnvelope(
        data=row, meta=ResponseMeta(request_id=request.state.request_id)
    )


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=SuccessEnvelope[CertificateArchiveManagerData],
)
async def create_certificate_archive(
    payload: CertificateArchiveCreateRequest,
    request: Request,
    principal: CsrfProtectedPrincipalDependency,
    service: CertificateArchiveServiceDependency,
) -> SuccessEnvelope[CertificateArchiveManagerData]:
    row = await service.create(
        principal,
        payload.public_work_id,
        payload.content,
        request_id=request.state.request_id,
    )
    return SuccessEnvelope(
        data=row, meta=ResponseMeta(request_id=request.state.request_id)
    )


@router.put(
    "/{archive_id}", response_model=SuccessEnvelope[CertificateArchiveManagerData]
)
async def update_certificate_archive(
    archive_id: UUID,
    payload: CertificateArchiveUpdateRequest,
    request: Request,
    principal: CsrfProtectedPrincipalDependency,
    service: CertificateArchiveServiceDependency,
) -> SuccessEnvelope[CertificateArchiveManagerData]:
    row = await service.update(
        principal,
        archive_id,
        expected_version=payload.expected_version,
        content=payload.content,
        request_id=request.state.request_id,
    )
    return SuccessEnvelope(
        data=row, meta=ResponseMeta(request_id=request.state.request_id)
    )


@router.post(
    "/{archive_id}/publish",
    response_model=SuccessEnvelope[CertificateArchiveManagerData],
)
async def publish_certificate_archive(
    archive_id: UUID,
    payload: CertificateArchiveTransitionRequest,
    request: Request,
    principal: CsrfProtectedPrincipalDependency,
    service: CertificateArchiveServiceDependency,
) -> SuccessEnvelope[CertificateArchiveManagerData]:
    row = await service.publish(
        principal,
        archive_id,
        expected_version=payload.expected_version,
        request_id=request.state.request_id,
    )
    return SuccessEnvelope(
        data=row, meta=ResponseMeta(request_id=request.state.request_id)
    )


@router.post(
    "/{archive_id}/hide",
    response_model=SuccessEnvelope[CertificateArchiveManagerData],
)
async def hide_certificate_archive(
    archive_id: UUID,
    payload: CertificateArchiveTransitionRequest,
    request: Request,
    principal: CsrfProtectedPrincipalDependency,
    service: CertificateArchiveServiceDependency,
) -> SuccessEnvelope[CertificateArchiveManagerData]:
    row = await service.hide(
        principal,
        archive_id,
        expected_version=payload.expected_version,
        request_id=request.state.request_id,
    )
    return SuccessEnvelope(
        data=row, meta=ResponseMeta(request_id=request.state.request_id)
    )


@router.post(
    "/{archive_id}/archive",
    response_model=SuccessEnvelope[CertificateArchiveManagerData],
)
async def archive_certificate(
    archive_id: UUID,
    payload: CertificateArchiveTransitionRequest,
    request: Request,
    principal: CsrfProtectedPrincipalDependency,
    service: CertificateArchiveServiceDependency,
) -> SuccessEnvelope[CertificateArchiveManagerData]:
    row = await service.archive(
        principal,
        archive_id,
        expected_version=payload.expected_version,
        reason=payload.reason or "",
        request_id=request.state.request_id,
    )
    return SuccessEnvelope(
        data=row, meta=ResponseMeta(request_id=request.state.request_id)
    )


@router.post(
    "/{archive_id}/restore",
    response_model=SuccessEnvelope[CertificateArchiveManagerData],
)
async def restore_certificate_archive(
    archive_id: UUID,
    payload: CertificateArchiveTransitionRequest,
    request: Request,
    principal: CsrfProtectedPrincipalDependency,
    service: CertificateArchiveServiceDependency,
) -> SuccessEnvelope[CertificateArchiveManagerData]:
    row = await service.restore(
        principal,
        archive_id,
        expected_version=payload.expected_version,
        request_id=request.state.request_id,
    )
    return SuccessEnvelope(
        data=row, meta=ResponseMeta(request_id=request.state.request_id)
    )
