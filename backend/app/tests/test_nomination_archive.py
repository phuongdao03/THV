import asyncio
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from functools import partial
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.db.base import Base
from app.db.session import get_session
from app.main import app, create_application
from app.modules.auth.dependencies import get_current_principal
from app.modules.auth.models import User, UserStatus
from app.modules.auth.session_service import AuthPrincipal
from app.modules.blockchain.models import Certificate, CertificateVersion
from app.modules.certificate_archives.models import (
    CertificateArchive,
    CertificateArchivePage,
    CertificateArchiveRevision,
)
from app.modules.dossiers.archive_service import NominationArchiveService
from app.modules.dossiers.models import (
    Category,
    Dossier,
    DossierEvidence,
    DossierStatus,
    DossierStatusHistory,
    DossierVersion,
)
from app.modules.historical_nominations.errors import HistoricalNominationForbiddenError
from app.modules.historical_nominations.models import (
    HistoricalArchiveStatus,
    HistoricalAward,
    HistoricalNomination,
    HistoricalNominationContentVersion,
    HistoricalNominationVersion,
    HistoricalSourceKind,
    HistoricalSubjectType,
)
from app.modules.media.models import MediaAsset, MediaStatus
from app.modules.public.models import PublicationStatus, PublicWork
from app.modules.reviews.media_access import ReviewMediaAccessPolicy
from app.modules.reviews.models import Review, ReviewAssignment, ReviewAssignmentStatus
from app.modules.supplements.models import SupplementRequest, SupplementResponse


def test_archive_retains_issued_certificate_versions_and_scanned_revisions() -> None:
    async def scenario() -> None:
        engine = create_async_engine("sqlite+aiosqlite://")
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        factory = async_sessionmaker(engine, expire_on_commit=False)
        admin = AuthPrincipal(
            user_id=uuid4(),
            session_id=uuid4(),
            email="cert-admin@example.test",
            roles=("SUPER_ADMIN",),
        )
        async with factory() as session:
            user = User(id=admin.user_id, email=admin.email, status=UserStatus.ACTIVE)
            category = Category(
                id=uuid4(), code="cert", slug="cert", name="Certificates"
            )
            session.add_all([user, category])
            await session.flush()
            dossier = Dossier(
                id=uuid4(),
                code="CNS-CERT-ARCHIVE",
                title="Issued source",
                category_id=category.id,
                owner_user_id=user.id,
            )
            dossier._set_status_from_workflow(DossierStatus.CERTIFICATE_ISSUED)
            session.add(dossier)
            await session.flush()
            version = DossierVersion(
                id=uuid4(),
                dossier_id=dossier.id,
                version_no=1,
                canonical_hash="a" * 64,
                snapshot_json={"dossier": {"title": dossier.title}, "evidences": []},
                submitted_by=user.id,
            )
            media = MediaAsset(
                id=uuid4(),
                owner_user_id=user.id,
                cloudinary_public_id="DO-NOT-EXPOSE",
                resource_type="image",
                access_mode="authenticated",
                original_filename="scan.png",
                mime_type="image/png",
                bytes=100,
                status=MediaStatus.ACTIVE,
            )
            work = PublicWork(
                id=uuid4(),
                dossier_id=dossier.id,
                owner_user_id=user.id,
                category_id=category.id,
                title="Published source",
                slug="cert-source",
                short_description="Certificate source",
                show_certificate=False,
            )
            pdf = MediaAsset(
                id=uuid4(),
                owner_user_id=user.id,
                cloudinary_public_id="PRIVATE-CERTIFICATE-PDF",
                resource_type="raw",
                access_mode="authenticated",
                original_filename="certificate.pdf",
                mime_type="application/pdf",
                bytes=2048,
                status=MediaStatus.ACTIVE,
            )
            session.add_all([version, media, pdf, work])
            await session.flush()
            certificate = Certificate(
                id=uuid4(),
                dossier_id=dossier.id,
                certificate_number="THV-ISSUED-ARCHIVE",
                current_version_no=1,
                issued_at=datetime.now(UTC),
                public_token_hash="b" * 64,
                qr_payload="SECRET-QR-PAYLOAD",
                pdf_media_id=pdf.id,
            )
            archive = CertificateArchive(
                id=uuid4(),
                public_work_id=work.id,
                created_by_user_id=user.id,
                updated_by_user_id=user.id,
            )
            session.add_all([certificate, archive])
            await session.flush()
            cert_version = CertificateVersion(
                id=uuid4(),
                certificate_id=certificate.id,
                dossier_version_id=version.id,
                version_no=1,
                metadata_json={"title": "Frozen certificate title"},
                metadata_hash="c" * 64,
            )
            scan_revision = CertificateArchiveRevision(
                id=uuid4(),
                archive_id=archive.id,
                version_no=1,
                snapshot_json={"title": "Old scanned award"},
                created_by_user_id=user.id,
            )
            session.add_all([cert_version, scan_revision])
            await session.flush()
            session.add(
                CertificateArchivePage(
                    revision_id=scan_revision.id,
                    media_asset_id=media.id,
                    sort_order=0,
                    alt_text="Original scan",
                )
            )
            await session.commit()
            service = NominationArchiveService(session)
            certificates, total = await service.section(
                admin, "CURRENT", dossier.id, "certificates"
            )
            assert total == 1 and certificates[0].version_id == version.id
            assert certificates[0].media_id == pdf.id
            scans, total = await service.section(
                admin, "CURRENT", dossier.id, "certificate_scans"
            )
            assert (
                total == 1
                and scans[0].media_id == media.id
                and scans[0].version_id == scan_revision.id
            )
            assert "DO-NOT-EXPOSE" not in scans[0].model_dump_json()
            assert "SECRET-QR-PAYLOAD" not in certificates[0].model_dump_json()
            policy = ReviewMediaAccessPolicy(session)
            async with session.begin():
                assert await policy.can_deliver(admin, media.id)
                assert await policy.can_deliver(admin, pdf.id)
                for role in ("DATA_MANAGER", "REVIEWER", "PUBLIC_USER"):
                    reader = AuthPrincipal(
                        user_id=uuid4(),
                        session_id=uuid4(),
                        email="other@example.test",
                        roles=(role,),
                        permissions=("dossier.evidence.read_all",),
                    )
                    assert not await policy.can_deliver(reader, media.id)
                    assert not await policy.can_deliver(reader, pdf.id)
            async with session.begin():
                work.publication_status = PublicationStatus.HIDDEN
            retained, total = await service.section(
                admin, "CURRENT", dossier.id, "certificates"
            )
            assert total == 1 and retained[0].facts["metadata_json"] == {
                "title": "Frozen certificate title"
            }
        await engine.dispose()

    asyncio.run(scenario())


def test_archive_preserves_completed_sources_and_owner_boundaries() -> None:
    async def scenario() -> None:
        assert app.title
        engine = create_async_engine("sqlite+aiosqlite://")
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        factory = async_sessionmaker(engine, expire_on_commit=False)
        admin = AuthPrincipal(
            user_id=uuid4(),
            session_id=uuid4(),
            email="admin@example.test",
            roles=("SUPER_ADMIN",),
        )
        async with factory() as session:
            category = Category(
                id=uuid4(), code="archive", slug="archive", name="Archive"
            )
            user = User(id=admin.user_id, email=admin.email, status=UserStatus.ACTIVE)
            current = Dossier(
                id=uuid4(),
                code="CNS-2020-OLD",
                title="Rejected source",
                owner_user_id=user.id,
                category_id=category.id,
            )
            current._set_status_from_workflow(DossierStatus.REJECTED)
            legacy = HistoricalNomination(
                id=uuid4(),
                code="THV-LS-OLD",
                title="Archived source",
                subject_name="Old nominee",
                subject_type=HistoricalSubjectType.PERSON,
                source_kind=HistoricalSourceKind.ARCHIVE,
                archive_status=HistoricalArchiveStatus.ARCHIVED,
                archived_at=datetime.now(UTC),
                archived_by_user_id=user.id,
                archive_reason="Completed historical import",
                created_by_user_id=user.id,
            )
            session.add_all([category, user, current, legacy])
            await session.flush()
            media = MediaAsset(
                id=uuid4(),
                owner_user_id=user.id,
                cloudinary_public_id="PRIVATE-STORAGE-KEY",
                resource_type="raw",
                access_mode="authenticated",
                original_filename="original.pdf",
                mime_type="application/pdf",
                bytes=1024,
                status=MediaStatus.ACTIVE,
            )
            session.add_all(
                [
                    HistoricalNominationVersion(
                        nomination_id=legacy.id,
                        version_no=1,
                        snapshot_json={"source": "original private source"},
                        canonical_hash="b" * 64,
                        submitted_by_user_id=user.id,
                    ),
                    HistoricalNominationContentVersion(
                        nomination_id=legacy.id,
                        version_no=1,
                        event_type="DRAFT_SAVED",
                        snapshot_json={"title": "editorial copy"},
                        created_by_user_id=user.id,
                    ),
                ]
            )
            snapshot = {
                "schemaVersion": 2,
                "dossier": {
                    "id": str(current.id),
                    "code": current.code,
                    "title": current.title,
                },
                "evidences": [],
            }
            version = DossierVersion(
                id=uuid4(),
                dossier_id=current.id,
                version_no=1,
                snapshot_json=snapshot,
                canonical_hash="a" * 64,
                submitted_by=user.id,
                submitted_at=datetime.now(UTC),
            )
            work = PublicWork(
                id=uuid4(),
                dossier_id=current.id,
                owner_user_id=user.id,
                category_id=category.id,
                title="Public presentation",
                slug="public-presentation",
                short_description="A public presentation only.",
                show_certificate=False,
            )
            session.add_all([media, version, work])
            await session.flush()
            assignment = ReviewAssignment(
                id=uuid4(),
                dossier_id=current.id,
                dossier_version_id=version.id,
                reviewer_user_id=user.id,
                assigned_by=user.id,
                status=ReviewAssignmentStatus.SUBMITTED,
            )
            request = SupplementRequest(
                id=uuid4(),
                dossier_id=current.id,
                requested_version_id=version.id,
                criterion_key="source",
                criterion_label="Căn cứ",
                requested_information="Bổ sung nguồn",
                reason="Test reason",
                created_by=user.id,
            )
            evidence = DossierEvidence(
                id=uuid4(),
                dossier_id=current.id,
                dossier_version_id=version.id,
                media_asset_id=media.id,
                evidence_type="SOURCE",
                title="Original submitted PDF",
            )
            session.add_all(
                [
                    assignment,
                    request,
                    evidence,
                    HistoricalAward(
                        id=uuid4(),
                        nomination_id=legacy.id,
                        award_name="Historical award",
                        created_by_user_id=user.id,
                    ),
                    DossierStatusHistory(
                        dossier_id=current.id,
                        from_status=DossierStatus.UNDER_REVIEW,
                        to_status=DossierStatus.REJECTED,
                        actor_user_id=user.id,
                        reason_code="TEST",
                        note="Recorded decision",
                    ),
                ]
            )
            await session.flush()
            session.add_all(
                [
                    Review(
                        assignment_id=assignment.id,
                        private_note="Retained review report",
                        submitted_at=datetime.now(UTC),
                    ),
                    SupplementResponse(
                        request_id=request.id,
                        author_id=user.id,
                        sequence_no=1,
                        text="Retained supplement response",
                    ),
                ]
            )
            await session.commit()
            service = NominationArchiveService(session)
            rows, total = await service.list_records(admin)
            assert total == 2 and {row.source for row in rows} == {"CURRENT", "LEGACY"}
            archived, total = await service.list_records(
                admin, archive_status="ARCHIVED"
            )
            assert total == 1 and archived[0].id == legacy.id
            found, total = await service.list_records(admin, query="THV-2020-OLD")
            assert total == 1 and found[0].id == current.id
            for role in ("PUBLIC_USER", "DATA_MANAGER", "REVIEWER"):
                principal = AuthPrincipal(
                    user_id=user.id,
                    session_id=uuid4(),
                    email=user.email,
                    roles=(role,),
                    permissions=("review.assign",),
                )
                with pytest.raises(HistoricalNominationForbiddenError):
                    await service.list_records(principal)
            detail = await service.get_record(admin, "LEGACY", legacy.id)
            assert detail.archive_status == "ARCHIVED"
            legacy_versions, version_count = await service.section(
                admin, "LEGACY", legacy.id, "versions"
            )
            assert version_count == 2
            assert {
                entry.facts["snapshot_json"].get("source") for entry in legacy_versions
            } == {"original private source", None}
            sections = (
                "people",
                "documents",
                "versions",
                "reviews",
                "decisions",
                "certificates",
                "certificate_scans",
                "publication",
                "history",
                "supplements",
            )
            for source, record_id in (("CURRENT", current.id), ("LEGACY", legacy.id)):
                for section in sections:
                    entries, _ = await service.section(
                        admin, source, record_id, section
                    )
                    assert "PRIVATE-STORAGE-KEY" not in "".join(
                        entry.model_dump_json() for entry in entries
                    )
            documents, total = await service.section(
                admin, "CURRENT", current.id, "documents"
            )
            assert (
                total == 1
                and documents[0].media_id == media.id
                and documents[0].version_id == version.id
            )
            reviews, total = await service.section(
                admin, "CURRENT", current.id, "reviews"
            )
            assert (
                total == 1
                and reviews[0].facts["report"]["privateNote"]
                == "Retained review report"
            )
            assert "draftToken" not in reviews[0].facts["report"]
            decisions, total = await service.section(
                admin, "CURRENT", current.id, "decisions"
            )
            assert total == 1 and decisions[0].status == "REJECTED"
            supplements, total = await service.section(
                admin, "CURRENT", current.id, "supplements"
            )
            assert (
                total == 1
                and supplements[0].facts["response"]["text"]
                == "Retained supplement response"
            )
            async with session.begin():
                work.publication_status = PublicationStatus.HIDDEN
            retained, total = await service.section(
                admin, "CURRENT", current.id, "documents"
            )
            assert total == 1 and retained[0].media_id == documents[0].media_id
            for role in ("PUBLIC_USER", "DATA_MANAGER", "REVIEWER"):
                principal = AuthPrincipal(
                    user_id=user.id, session_id=uuid4(), email=user.email, roles=(role,)
                )
                with pytest.raises(HistoricalNominationForbiddenError):
                    await service.section(principal, "CURRENT", current.id, "documents")

            async def test_session() -> AsyncIterator[AsyncSession]:
                async with factory() as request_session:
                    yield request_session

            test_app = create_application()
            test_app.dependency_overrides[get_session] = test_session
            test_app.dependency_overrides[get_current_principal] = lambda: admin
            try:
                async with AsyncClient(
                    transport=ASGITransport(app=test_app), base_url="http://testserver"
                ) as client:
                    path = f"/api/v1/admin/nomination-records/CURRENT/{current.id}"
                    listed = await client.get("/api/v1/admin/nomination-records")
                    assert (
                        listed.status_code == 200
                        and listed.json()["meta"]["total"] == 2
                    )
                    for section in sections:
                        response = await client.get(f"{path}/{section}")
                        assert response.status_code == 200, section
                    assert (await client.post(path, json={})).status_code == 405
                    assert (
                        await client.get(
                            f"/api/v1/admin/nomination-records/CURRENT/{uuid4()}"
                        )
                    ).status_code == 404
                    for role in ("PUBLIC_USER", "DATA_MANAGER", "REVIEWER"):
                        principal = AuthPrincipal(
                            user_id=user.id,
                            session_id=uuid4(),
                            email=user.email,
                            roles=(role,),
                            permissions=("review.assign",),
                        )
                        test_app.dependency_overrides[get_current_principal] = partial(
                            lambda value: value, principal
                        )
                        assert (await client.get(path)).status_code == 403
                        assert (
                            await client.get(f"{path}/documents")
                        ).status_code == 403
                        assert (
                            await client.get("/api/v1/admin/nomination-records")
                        ).status_code == 403
            finally:
                test_app.dependency_overrides.clear()
        await engine.dispose()

    asyncio.run(scenario())
