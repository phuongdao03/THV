from typing import Annotated

from fastapi import Depends

from app.modules.auth.dependencies import SessionDependency
from app.modules.certificate_archives.service import CertificateArchiveService
from app.modules.public.media_dispatcher import CeleryPublicMediaDispatcher


async def get_certificate_archive_service(
    session: SessionDependency,
) -> CertificateArchiveService:
    return CertificateArchiveService(
        session=session,
        dispatcher=CeleryPublicMediaDispatcher(),
    )


CertificateArchiveServiceDependency = Annotated[
    CertificateArchiveService,
    Depends(get_certificate_archive_service),
]
