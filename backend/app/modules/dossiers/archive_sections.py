"""Whitelisted archive projections. No file URLs, tokens, or write operations."""

from typing import Any
from uuid import UUID

from fastapi.encoders import jsonable_encoder
from sqlalchemy import Select, String, Uuid, cast, func, literal, or_, select, union_all
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.audit.models import AuditLog
from app.modules.blockchain.models import Certificate, CertificateVersion
from app.modules.certificate_archives.models import (
    CertificateArchive,
    CertificateArchivePage,
    CertificateArchiveRevision,
)
from app.modules.council.models import CouncilCase, CouncilSession
from app.modules.dossiers.archive_schemas import (
    ArchiveEntry,
    ArchiveSection,
    ArchiveSource,
)
from app.modules.dossiers.models import (
    Dossier,
    DossierEvidence,
    DossierStatusHistory,
    DossierVersion,
)
from app.modules.historical_nominations.models import (
    HistoricalAward,
    HistoricalMediaLink,
    HistoricalNominationContentVersion,
    HistoricalNominationPartyRole,
    HistoricalNominationVersion,
    HistoricalRelatedPerson,
)
from app.modules.media.models import MediaAsset
from app.modules.public.models import PublicWork
from app.modules.reviews.models import Review, ReviewAssignment
from app.modules.reviews.schemas import ReviewData
from app.modules.reviews.service import ReviewService
from app.modules.supplements.models import SupplementRequest, SupplementResponse


async def read_archive_section(
    session: AsyncSession,
    source: ArchiveSource,
    record_id: UUID,
    section: ArchiveSection,
    page: int,
    page_size: int,
) -> tuple[list[ArchiveEntry], int]:
    """Caller must first authorize and resolve the exact source record."""
    if section == "decisions" and source == "CURRENT":
        return await _decisions(session, record_id, page, page_size)
    if section == "versions" and source == "LEGACY":
        return await _legacy_versions(session, record_id, page, page_size)
    stmt: Select[Any]
    if section == "people":
        if source == "LEGACY":
            stmt = (
                select(HistoricalRelatedPerson, HistoricalNominationPartyRole.role)
                .join(
                    HistoricalNominationPartyRole,
                    HistoricalNominationPartyRole.person_id
                    == HistoricalRelatedPerson.id,
                )
                .where(HistoricalNominationPartyRole.nomination_id == record_id)
                .order_by(
                    HistoricalRelatedPerson.display_name, HistoricalRelatedPerson.id
                )
            )
        else:
            stmt = select(Dossier).where(Dossier.id == record_id)
    elif section == "documents":
        model: Any = HistoricalMediaLink if source == "LEGACY" else DossierEvidence
        owner = model.nomination_id if source == "LEGACY" else model.dossier_id
        media_key = model.media_asset_id
        stmt = (
            select(model, MediaAsset)
            .outerjoin(MediaAsset, MediaAsset.id == media_key)
            .where(owner == record_id)
            .order_by(model.id)
        )
    elif section == "versions":
        if source == "CURRENT":
            stmt = (
                select(DossierVersion)
                .where(DossierVersion.dossier_id == record_id)
                .order_by(DossierVersion.version_no.desc())
            )
        else:
            stmt = (
                select(HistoricalNominationContentVersion)
                .where(HistoricalNominationContentVersion.nomination_id == record_id)
                .order_by(HistoricalNominationContentVersion.version_no.desc())
            )
    elif section == "reviews":
        if source == "LEGACY":
            return [], 0
        stmt = (
            select(ReviewAssignment, Review, DossierVersion)
            .outerjoin(Review, Review.assignment_id == ReviewAssignment.id)
            .join(
                DossierVersion, DossierVersion.id == ReviewAssignment.dossier_version_id
            )
            .where(ReviewAssignment.dossier_id == record_id)
            .order_by(ReviewAssignment.id)
        )
    elif section == "decisions":
        if source == "LEGACY":
            return [], 0
        stmt = (
            select(CouncilCase, CouncilSession)
            .join(CouncilSession, CouncilSession.id == CouncilCase.session_id)
            .where(CouncilCase.dossier_id == record_id)
            .order_by(CouncilCase.id)
        )
    elif section == "certificates":
        if source == "LEGACY":
            stmt = (
                select(HistoricalAward)
                .where(HistoricalAward.nomination_id == record_id)
                .order_by(HistoricalAward.created_at.desc(), HistoricalAward.id)
            )
        else:
            stmt = (
                select(Certificate, CertificateVersion)
                .join(
                    CertificateVersion,
                    CertificateVersion.certificate_id == Certificate.id,
                )
                .where(Certificate.dossier_id == record_id)
                .order_by(Certificate.id, CertificateVersion.version_no.desc())
            )
    elif section == "certificate_scans":
        owner = (
            PublicWork.historical_nomination_id
            if source == "LEGACY"
            else PublicWork.dossier_id
        )
        stmt = (
            select(
                CertificateArchiveRevision,
                CertificateArchive,
                CertificateArchivePage,
                MediaAsset,
            )
            .join(
                CertificateArchive,
                CertificateArchive.id == CertificateArchiveRevision.archive_id,
            )
            .join(PublicWork, PublicWork.id == CertificateArchive.public_work_id)
            .outerjoin(
                CertificateArchivePage,
                CertificateArchivePage.revision_id == CertificateArchiveRevision.id,
            )
            .outerjoin(
                MediaAsset, MediaAsset.id == CertificateArchivePage.media_asset_id
            )
            .where(owner == record_id)
            .order_by(
                CertificateArchive.id,
                CertificateArchiveRevision.version_no.desc(),
                CertificateArchivePage.sort_order,
            )
        )
    elif section == "supplements":
        if source == "LEGACY":
            return [], 0
        stmt = (
            select(SupplementRequest, SupplementResponse)
            .outerjoin(
                SupplementResponse,
                SupplementResponse.request_id == SupplementRequest.id,
            )
            .where(SupplementRequest.dossier_id == record_id)
            .order_by(
                SupplementRequest.created_at.desc(),
                SupplementRequest.id,
                SupplementResponse.sequence_no,
            )
        )
    elif section == "publication":
        owner = (
            PublicWork.historical_nomination_id
            if source == "LEGACY"
            else PublicWork.dossier_id
        )
        stmt = select(PublicWork).where(owner == record_id).order_by(PublicWork.id)
    else:
        # Domain-restricted IDs avoid unrelated audit records with matching UUIDs.
        resource_type = "historical_nomination" if source == "LEGACY" else "dossier"
        work_owner = (
            PublicWork.historical_nomination_id
            if source == "LEGACY"
            else PublicWork.dossier_id
        )
        work_ids = select(func.replace(cast(PublicWork.id, String), "-", "")).where(
            work_owner == record_id
        )
        stmt = (
            select(AuditLog)
            .where(
                or_(
                    (AuditLog.resource_type == resource_type)
                    & (AuditLog.resource_id == str(record_id)),
                    (AuditLog.resource_type == "public_work")
                    & func.replace(AuditLog.resource_id, "-", "").in_(work_ids),
                ),
            )
            .order_by(AuditLog.created_at.desc(), AuditLog.id)
        )
    async with session.begin():
        total = int(
            await session.scalar(
                select(func.count()).select_from(stmt.order_by(None).subquery())
            )
            or 0
        )
        rows = (
            await session.execute(stmt.offset((page - 1) * page_size).limit(page_size))
        ).all()
        entries = []
        for row in rows:
            obj = row[0]
            entry = ArchiveEntry(id=obj.id, title="", facts={})
            if section == "people":
                entry.title = (
                    obj.display_name if source == "LEGACY" else "Người nộp hồ sơ"
                )
                keys = (
                    ("organization_name", "email", "phone", "address", "linked_user_id")
                    if source == "LEGACY"
                    else (
                        "owner_user_id",
                        "organization_id",
                        "form_data_json",
                        "summary",
                    )
                )
                entry.facts = _facts(obj, keys)
                if source == "LEGACY":
                    entry.status = row[1].value
            elif section == "documents":
                media = row[1]
                entry.title = (
                    (media.original_filename if media else None)
                    or getattr(obj, "title", None)
                    or "Tài liệu có metadata"
                )
                entry.media_id = obj.media_asset_id
                entry.version_id = getattr(obj, "dossier_version_id", None)
                entry.status = media.status.value if media else "METADATA_WITHOUT_ASSET"
                entry.mime_type = media.mime_type if media else None
                entry.bytes = media.bytes if media else None
                entry.checksum = media.sha256 if media else None
                entry.actor = str(media.owner_user_id) if media else None
                entry.occurred_at = media.created_at if media else None
                entry.facts = _facts(
                    obj,
                    (
                        "access_scope",
                        "evidence_type",
                        "evidence_role",
                        "award_id",
                        "media_kind",
                    ),
                )
            elif section == "versions":
                entry.title = f"Phiên bản {obj.version_no}"
                entry.version_id = obj.id
                entry.checksum = getattr(obj, "canonical_hash", None)
                entry.occurred_at = getattr(obj, "submitted_at", None) or getattr(
                    obj, "created_at", None
                )
                entry.facts = _facts(
                    obj,
                    (
                        "snapshot_json",
                        "event_type",
                        "submitted_by",
                        "created_by_user_id",
                    ),
                )
            elif section == "reviews":
                review, version = row[1], row[2]
                entry.title = f"Thẩm định · phiên bản {version.version_no}"
                entry.status = obj.status.value
                entry.actor = str(obj.reviewer_user_id)
                entry.version_id = version.id
                entry.facts = {
                    "snapshot": version.snapshot_json,
                    "report": ReviewData.model_validate(
                        ReviewService._review_view(review)
                    ).model_dump(mode="json", by_alias=True, exclude={"draft_token"})
                    if review
                    else None,
                }
            elif section == "decisions":
                entry.title = "Quyết định hội đồng"
                entry.status = (
                    obj.decision.value if obj.decision else "Chưa ghi nhận quyết định"
                )
                entry.version_id = obj.dossier_version_id
                entry.facts = _facts(
                    row[1],
                    (
                        "title",
                        "status",
                        "scheduled_at",
                        "closed_at",
                        "created_by_user_id",
                    ),
                )
            elif section == "certificates":
                if source == "LEGACY":
                    entry.title = obj.award_name
                    entry.status = "LEGACY"
                    entry.facts = _facts(
                        obj,
                        (
                            "certificate_number",
                            "issued_at",
                            "issued_by",
                            "recipient_person_id",
                            "verification_status",
                        ),
                    )
                else:
                    version = row[1]
                    entry.title = (
                        f"{obj.certificate_number} · phiên bản {version.version_no}"
                    )
                    entry.status = version.status.value
                    entry.version_id = version.dossier_version_id
                    entry.media_id = version.pdf_media_id or (
                        obj.pdf_media_id
                        if obj.current_version_no == version.version_no
                        else None
                    )
                    entry.mime_type = "application/pdf"
                    entry.checksum = version.metadata_hash
                    entry.occurred_at = version.created_at
                    entry.facts = _facts(
                        version,
                        (
                            "certificate_id",
                            "metadata_json",
                            "predecessor_version_id",
                            "change_reason",
                            "decided_by",
                            "decided_at",
                            "revoked_at",
                            "blockchain_transaction_id",
                        ),
                    )
            elif section == "certificate_scans":
                archive, scan, media = row[1], row[2], row[3]
                entry.id = scan.id if scan else obj.id
                entry.title = f"Bằng lưu trữ · phiên bản {obj.version_no}"
                entry.status = archive.status.value
                entry.version_id = obj.id
                entry.occurred_at = obj.created_at
                entry.facts = {
                    "archive_id": str(archive.id),
                    "metadata_json": obj.snapshot_json,
                }
                if scan:
                    entry.media_id = scan.media_asset_id
                    entry.title = scan.caption or scan.alt_text or entry.title
                    entry.status = (
                        media.status.value if media else "METADATA_WITHOUT_ASSET"
                    )
                    entry.mime_type = media.mime_type if media else None
                    entry.bytes = media.bytes if media else None
                    entry.checksum = media.sha256 if media else None
            elif section == "supplements":
                response = row[1]
                entry.title = obj.criterion_label
                entry.status = obj.status
                entry.version_id = obj.requested_version_id
                entry.facts = _facts(
                    obj,
                    (
                        "requested_information",
                        "reason",
                        "created_by",
                        "created_at",
                        "due_at",
                    ),
                )
                if response:
                    entry.id = response.id
                    entry.facts["response"] = _facts(
                        response,
                        ("author_id", "kind", "sequence_no", "text", "created_at"),
                    )
            elif section == "publication":
                entry.title = obj.title
                entry.status = obj.publication_status.value
                entry.occurred_at = obj.published_at
                entry.facts = _facts(
                    obj,
                    (
                        "slug",
                        "version",
                        "short_description",
                        "full_description",
                        "thumbnail_media_id",
                        "author_display_name",
                        "category_id",
                        "visibility",
                    ),
                )
            else:
                entry.title = obj.action
                entry.actor = str(obj.actor_user_id) if obj.actor_user_id else None
                entry.occurred_at = obj.created_at
                entry.facts = _facts(obj, ("before_json", "after_json"))
            entries.append(entry)
        return entries, total


async def _legacy_versions(
    session: AsyncSession, record_id: UUID, page: int, page_size: int
) -> tuple[list[ArchiveEntry], int]:
    source = select(
        HistoricalNominationVersion.id.label("id"),
        (
            literal("Phiên bản hồ sơ nguồn ")
            + cast(HistoricalNominationVersion.version_no, String)
        ).label("title"),
        HistoricalNominationVersion.submitted_at.label("occurred_at"),
        HistoricalNominationVersion.canonical_hash.label("checksum"),
        HistoricalNominationVersion.snapshot_json.label("snapshot"),
        literal("SOURCE_SUBMITTED").label("event_type"),
    ).where(HistoricalNominationVersion.nomination_id == record_id)
    content = select(
        HistoricalNominationContentVersion.id.label("id"),
        (
            literal("Phiên bản nội dung công bố ")
            + cast(HistoricalNominationContentVersion.version_no, String)
        ).label("title"),
        HistoricalNominationContentVersion.created_at.label("occurred_at"),
        literal(None, String).label("checksum"),
        HistoricalNominationContentVersion.snapshot_json.label("snapshot"),
        HistoricalNominationContentVersion.event_type.label("event_type"),
    ).where(HistoricalNominationContentVersion.nomination_id == record_id)
    records = union_all(source, content).subquery()
    async with session.begin():
        total = int(
            await session.scalar(select(func.count()).select_from(records)) or 0
        )
        rows = (
            (
                await session.execute(
                    select(records)
                    .order_by(records.c.occurred_at.desc(), records.c.id)
                    .offset((page - 1) * page_size)
                    .limit(page_size)
                )
            )
            .mappings()
            .all()
        )
        return [
            ArchiveEntry(
                id=row["id"],
                title=row["title"],
                occurred_at=row["occurred_at"],
                checksum=row["checksum"],
                version_id=row["id"],
                facts={
                    "snapshot_json": row["snapshot"],
                    "event_type": row["event_type"],
                },
            )
            for row in rows
        ], total


async def _decisions(
    session: AsyncSession, record_id: UUID, page: int, page_size: int
) -> tuple[list[ArchiveEntry], int]:
    transitions = select(
        DossierStatusHistory.id.label("id"),
        literal("Quyết định xử lý hồ sơ").label("title"),
        cast(DossierStatusHistory.to_status, String).label("status"),
        DossierStatusHistory.created_at.label("occurred_at"),
        cast(DossierStatusHistory.actor_user_id, String).label("actor"),
        literal(None, Uuid).label("version_id"),
        DossierStatusHistory.note.label("note"),
        DossierStatusHistory.reason_code.label("reason"),
    ).where(
        DossierStatusHistory.dossier_id == record_id,
        DossierStatusHistory.to_status.in_(
            ["APPROVED", "REJECTED", "REVOKED", "CANCELLED"]
        ),
    )
    council = (
        select(
            CouncilCase.id.label("id"),
            literal("Quyết định hội đồng").label("title"),
            cast(CouncilCase.decision, String).label("status"),
            literal(None).label("occurred_at"),
            literal(None, String).label("actor"),
            CouncilCase.dossier_version_id.label("version_id"),
            CouncilSession.title.label("note"),
            literal(None, String).label("reason"),
        )
        .join(CouncilSession, CouncilSession.id == CouncilCase.session_id)
        .where(CouncilCase.dossier_id == record_id, CouncilCase.decision.is_not(None))
    )
    records = union_all(transitions, council).subquery()
    async with session.begin():
        total = int(
            await session.scalar(select(func.count()).select_from(records)) or 0
        )
        rows = (
            (
                await session.execute(
                    select(records)
                    .order_by(records.c.occurred_at.desc(), records.c.id)
                    .offset((page - 1) * page_size)
                    .limit(page_size)
                )
            )
            .mappings()
            .all()
        )
        return [
            ArchiveEntry(
                id=row["id"],
                title=row["title"],
                status=row["status"],
                occurred_at=row["occurred_at"],
                actor=row["actor"],
                version_id=row["version_id"],
                facts={"note": row["note"], "reason": row["reason"]},
            )
            for row in rows
        ], total


def _facts(obj: Any, keys: tuple[str, ...]) -> dict[str, object]:
    # Only explicitly requested, known domain fields are exposed. In particular
    # this cannot dump storage keys or auth/QR tokens from arbitrary ORM models.
    return {
        key: jsonable_encoder(getattr(obj, key)) for key in keys if hasattr(obj, key)
    }
