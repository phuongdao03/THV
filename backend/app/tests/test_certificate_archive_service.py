import asyncio
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.db.base import Base
from app.modules.auth.models import User, UserStatus
from app.modules.auth.session_service import AuthPrincipal
from app.modules.blockchain.models import Certificate, CertificateStatus
from app.modules.certificate_archives.errors import (
    CertificateArchiveConflictError,
    CertificateArchiveForbiddenError,
)
from app.modules.certificate_archives.schemas import (
    CertificateArchiveContentInput,
    CertificateArchivePageInput,
)
from app.modules.certificate_archives.service import CertificateArchiveService
from app.modules.media.models import (
    MediaAsset,
    MediaConfidentiality,
    MediaEncryptionStatus,
    MediaStatus,
)
from app.modules.media.types import MediaPurpose
from app.modules.public.models import (
    PublicationStatus,
    PublicWork,
    PublicWorkVisibility,
)
from app.tests.test_publication_workflow import NOW, _seed


class RecordingDispatcher:
    def __init__(self) -> None:
        self.relation_ids = []

    def enqueue(self, relation_id) -> None:
        self.relation_ids.append(relation_id)


def test_data_manager_publishes_private_scan_without_active_digital_proof() -> None:
    async def scenario() -> None:
        engine = create_async_engine("sqlite+aiosqlite://")
        sessions = async_sessionmaker(engine, expire_on_commit=False)
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        dispatcher = RecordingDispatcher()
        manager_id = uuid4()
        async with sessions() as session:
            work_id, owner_id = await _seed(session)
            async with session.begin():
                session.add(
                    User(
                        id=manager_id,
                        email="manager@example.test",
                        password_hash="hash",
                        status=UserStatus.ACTIVE,
                    )
                )
                work = await session.get(PublicWork, work_id)
                assert work is not None
                work.publication_status = PublicationStatus.PUBLISHED
                work.visibility = PublicWorkVisibility.PUBLIC
                work.published_at = NOW
                certificate = await session.get(Certificate, work.certificate_id)
                assert certificate is not None
                certificate.status = CertificateStatus.REVOKED
                scan_id = uuid4()
                session.add(
                    MediaAsset(
                        id=scan_id,
                        owner_user_id=manager_id,
                        purpose=MediaPurpose.CERTIFICATE_ARCHIVE_SCAN.value,
                        cloudinary_public_id="archive/scan-page-1",
                        resource_type="image",
                        access_mode="authenticated",
                        original_filename="scan-page-1.jpg",
                        mime_type="image/jpeg",
                        bytes=1024,
                        status=MediaStatus.ACTIVE,
                        confidentiality=MediaConfidentiality.PRIVATE,
                        encryption_status=MediaEncryptionStatus.NOT_REQUIRED,
                        sha256="a" * 64,
                        inspected_at=NOW,
                    )
                )
            manager = AuthPrincipal(
                user_id=manager_id,
                session_id=uuid4(),
                email="manager@example.test",
                roles=("DATA_MANAGER",),
                permissions=("certificate_archives.manage",),
            )
            service = CertificateArchiveService(
                session=session,
                dispatcher=dispatcher,
                clock=lambda: NOW,
            )
            draft = await service.create(
                manager,
                work_id,
                CertificateArchiveContentInput(
                    title="Bằng ghi nhận lưu trữ",
                    award_name="Nghệ nhân tiêu biểu",
                    recipient_display_name="Nguyễn Văn An",
                    issuer_name="Hội đồng lưu trữ",
                    issued_year=1998,
                    rights_confirmed=True,
                    privacy_reviewed=True,
                    pages=[
                        CertificateArchivePageInput(
                            media_asset_id=scan_id,
                            alt_text="Ảnh quét mặt trước bằng ghi nhận",
                        )
                    ],
                ),
                request_id="archive-create",
            )
            assert draft.status == "DRAFT"
            with pytest.raises(CertificateArchiveConflictError):
                await service.publish(
                    manager,
                    draft.id,
                    expected_version=draft.version - 1,
                    request_id="archive-publish-conflict",
                )
            published = await service.publish(
                manager,
                draft.id,
                expected_version=draft.version,
                request_id="archive-publish",
            )
            assert published.status == "PUBLISHED"
            assert published.published is not None
            assert len(published.published.pages) == 1
            assert dispatcher.relation_ids
            hidden = await service.hide(
                manager,
                draft.id,
                expected_version=published.version,
                request_id="archive-hide",
            )
            assert hidden.status == "HIDDEN"
            with pytest.raises(CertificateArchiveForbiddenError):
                await service.restore(
                    manager,
                    draft.id,
                    expected_version=hidden.version,
                    request_id="archive-restore-denied",
                )
        await engine.dispose()

    asyncio.run(scenario())
