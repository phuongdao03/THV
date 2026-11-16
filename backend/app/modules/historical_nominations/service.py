import hashlib
import json
from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy import case, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.audit.models import AuditLog
from app.modules.audit.service import AuditService
from app.modules.auth.authorization import AuthorizationPolicy, PolicyRequirement
from app.modules.auth.models import User, UserStatus
from app.modules.auth.session_service import AuthPrincipal
from app.modules.dossiers.models import Category, DossierType
from app.modules.historical_nominations.errors import (
    HistoricalNominationForbiddenError,
    HistoricalNominationNotFoundError,
    HistoricalNominationStateError,
    HistoricalNominationValidationError,
)
from app.modules.historical_nominations.models import (
    HistoricalArchiveStatus,
    HistoricalAward,
    HistoricalAwardVerificationStatus,
    HistoricalMediaAccessScope,
    HistoricalMediaKind,
    HistoricalMediaLink,
    HistoricalNomination,
    HistoricalNominationContentVersion,
    HistoricalNominationPartyRole,
    HistoricalNominationPublicationStatus,
    HistoricalNominationStatus,
    HistoricalNominationVersion,
    HistoricalPublicContentDraft,
    HistoricalPublicContentDraftStatus,
    HistoricalRelatedPerson,
    HistoricalRelatedPersonRole,
)
from app.modules.historical_nominations.schemas import (
    HistoricalAccountLinkWrite,
    HistoricalAwardPatch,
    HistoricalAwardWrite,
    HistoricalLinkableAccountData,
    HistoricalLinkedAwardData,
    HistoricalLinkedRecordData,
    HistoricalNominationWrite,
    HistoricalPersonWrite,
    HistoricalPublicContentApproval,
    HistoricalPublicContentDraftWrite,
    HistoricalPublicContentVersionRestore,
)
from app.modules.media.models import MediaAsset, MediaStatus
from app.modules.media.types import MediaPurpose
from app.modules.public.models import (
    PublicationStatus,
    PublicWork,
    PublicWorkVisibility,
)

EDITORIAL_FIELDS = frozenset(
    {
        "subject_type",
        "subject_name",
        "title",
        "summary",
        "description",
        "dossier_type_id",
        "category_id",
        "legacy_category_label",
        "nomination_year",
        "nominated_at",
        "historical_result",
        "source_kind",
        "source_label",
        "source_reference",
        "source_recorded_at",
        "provenance_notes",
    }
)
IMPORT_FIELDS = EDITORIAL_FIELDS - {
    "category_id",
    "dossier_type_id",
    "nominated_at",
    "source_recorded_at",
}


@dataclass(frozen=True, slots=True)
class HistoricalActivityItem:
    record_id: UUID
    record_code: str
    title: str
    action: str
    occurred_at: datetime


@dataclass(frozen=True, slots=True)
class HistoricalDashboardSummary:
    total_records: int
    draft_count: int
    waiting_review_count: int
    needs_correction_count: int
    verified_count: int
    published_count: int
    recent_activity: tuple[HistoricalActivityItem, ...]


def _require_manager(principal: AuthPrincipal, permission: str) -> None:
    if not {"DATA_MANAGER", "SUPER_ADMIN"}.intersection(principal.roles):
        raise HistoricalNominationForbiddenError()
    AuthorizationPolicy.require_capability(
        principal,
        PolicyRequirement(permission=permission),
        HistoricalNominationForbiddenError,
    )


def _require_admin(principal: AuthPrincipal) -> None:
    if "SUPER_ADMIN" not in principal.roles:
        raise HistoricalNominationForbiddenError()


def _assert_expected_version(
    record: HistoricalAward | HistoricalNomination | HistoricalPublicContentDraft,
    expected_updated_at: datetime,
) -> None:
    actual = record.updated_at
    if actual.tzinfo is None:
        actual = actual.replace(tzinfo=UTC)
    if expected_updated_at.tzinfo is None:
        expected_updated_at = expected_updated_at.replace(tzinfo=UTC)
    if actual != expected_updated_at:
        raise HistoricalNominationStateError(
            "Record changed since it was loaded. Refresh it before continuing."
        )


def _snapshot(record: HistoricalNomination) -> dict[str, object]:
    return {
        field: getattr(record, field).value
        if field in {"subject_type", "source_kind"}
        else getattr(record, field).isoformat()
        if field in {"nominated_at", "source_recorded_at"}
        and getattr(record, field) is not None
        else str(getattr(record, field))
        if field in {"category_id", "dossier_type_id"}
        and getattr(record, field) is not None
        else getattr(record, field)
        for field in sorted(EDITORIAL_FIELDS)
    }


class HistoricalNominationService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._audit = AuditService(session)

    async def dashboard_summary(
        self,
        principal: AuthPrincipal,
        *,
        activity_limit: int = 8,
    ) -> HistoricalDashboardSummary:
        _require_manager(principal, "historical.records.read")
        active_filter = (
            HistoricalNomination.archive_status == HistoricalArchiveStatus.ACTIVE,
            HistoricalNomination.deleted_at.is_(None),
        )
        async with self._session.begin():
            grouped_counts = await self._session.execute(
                select(
                    HistoricalNomination.verification_status,
                    func.count(HistoricalNomination.id),
                )
                .where(*active_filter)
                .group_by(HistoricalNomination.verification_status)
            )
            counts = {status: int(count) for status, count in grouped_counts}
            total_records = sum(counts.values())
            published_count = int(
                await self._session.scalar(
                    select(func.count(HistoricalNomination.id)).where(
                        *active_filter,
                        HistoricalNomination.publication_status
                        == HistoricalNominationPublicationStatus.PUBLISHED,
                    )
                )
                or 0
            )
            audit_rows = list(
                await self._session.scalars(
                    select(AuditLog)
                    .where(
                        AuditLog.resource_type == "historical_nomination",
                        AuditLog.action.like("historical_nomination.%"),
                    )
                    .order_by(AuditLog.created_at.desc())
                    .limit(activity_limit)
                )
            )
            activity_ids: list[UUID] = []
            for row in audit_rows:
                try:
                    activity_ids.append(UUID(row.resource_id))
                except ValueError:
                    continue
            records_by_id = (
                {
                    record.id: record
                    for record in await self._session.scalars(
                        select(HistoricalNomination).where(
                            HistoricalNomination.id.in_(activity_ids),
                            HistoricalNomination.deleted_at.is_(None),
                        )
                    )
                }
                if activity_ids
                else {}
            )
            recent_activity = tuple(
                HistoricalActivityItem(
                    record_id=record.id,
                    record_code=record.code,
                    title=record.title,
                    action=row.action,
                    occurred_at=row.created_at,
                )
                for row in audit_rows
                if (record := records_by_id.get(UUID(row.resource_id))) is not None
            )
        return HistoricalDashboardSummary(
            total_records=total_records,
            draft_count=counts.get(HistoricalNominationStatus.DRAFT, 0),
            waiting_review_count=sum(
                counts.get(status, 0)
                for status in (
                    HistoricalNominationStatus.SUBMITTED,
                    HistoricalNominationStatus.UNDER_REVIEW,
                    HistoricalNominationStatus.HELD,
                )
            ),
            needs_correction_count=counts.get(
                HistoricalNominationStatus.NEEDS_CORRECTION,
                0,
            ),
            verified_count=counts.get(HistoricalNominationStatus.VERIFIED, 0),
            published_count=published_count,
            recent_activity=recent_activity,
        )

    async def list_records(
        self,
        principal: AuthPrincipal,
        *,
        page: int = 1,
        page_size: int = 25,
        query: str | None = None,
        status: HistoricalNominationStatus | None = None,
        publication_status: HistoricalNominationPublicationStatus | None = None,
        year: int | None = None,
        category_id: UUID | None = None,
        dossier_type_id: UUID | None = None,
    ) -> tuple[list[HistoricalNomination], int]:
        _require_manager(principal, "historical.records.read")
        filters = [
            HistoricalNomination.archive_status == HistoricalArchiveStatus.ACTIVE,
            HistoricalNomination.deleted_at.is_(None),
        ]
        if status is not None:
            filters.append(HistoricalNomination.verification_status == status)
        if publication_status is not None:
            filters.append(
                HistoricalNomination.publication_status == publication_status
            )
        if year is not None:
            filters.append(HistoricalNomination.nomination_year == year)
        if category_id is not None:
            filters.append(HistoricalNomination.category_id == category_id)
        if dossier_type_id is not None:
            filters.append(HistoricalNomination.dossier_type_id == dossier_type_id)
        if query:
            pattern = f"%{query.strip()}%"
            filters.append(
                HistoricalNomination.subject_name.ilike(pattern)
                | HistoricalNomination.title.ilike(pattern)
                | HistoricalNomination.code.ilike(pattern)
                | HistoricalNomination.legacy_code.ilike(pattern)
            )
        async with self._session.begin():
            total = int(
                await self._session.scalar(
                    select(func.count())
                    .select_from(HistoricalNomination)
                    .where(*filters)
                )
                or 0
            )
            records = list(
                await self._session.scalars(
                    select(HistoricalNomination)
                    .where(*filters)
                    .order_by(HistoricalNomination.updated_at.desc())
                    .offset((page - 1) * page_size)
                    .limit(page_size)
                )
            )
        return records, total

    async def workspace_counts(
        self,
        principal: AuthPrincipal,
        record_ids: list[UUID],
    ) -> dict[UUID, dict[str, int]]:
        _require_manager(principal, "historical.records.read")
        if not record_ids:
            return {}
        counts = {
            record_id: {
                "media_count": 0,
                "photo_video_count": 0,
                "document_count": 0,
                "award_count": 0,
            }
            for record_id in record_ids
        }
        async with self._session.begin():
            media_rows = await self._session.execute(
                select(
                    HistoricalMediaLink.nomination_id,
                    func.count(HistoricalMediaLink.id),
                    func.sum(
                        case(
                            (
                                HistoricalMediaLink.media_kind.in_(
                                    [
                                        HistoricalMediaKind.PHOTO,
                                        HistoricalMediaKind.VIDEO,
                                    ]
                                ),
                                1,
                            ),
                            else_=0,
                        )
                    ),
                    func.sum(
                        case(
                            (
                                HistoricalMediaLink.media_kind.in_(
                                    [
                                        HistoricalMediaKind.SCANNED_DOCUMENT,
                                        HistoricalMediaKind.SUPPORTING_DOCUMENT,
                                    ]
                                ),
                                1,
                            ),
                            else_=0,
                        )
                    ),
                )
                .where(HistoricalMediaLink.nomination_id.in_(record_ids))
                .group_by(HistoricalMediaLink.nomination_id)
            )
            for record_id, media, photo_video, documents in media_rows:
                counts[record_id].update(
                    media_count=int(media or 0),
                    photo_video_count=int(photo_video or 0),
                    document_count=int(documents or 0),
                )
            award_rows = await self._session.execute(
                select(HistoricalAward.nomination_id, func.count(HistoricalAward.id))
                .where(HistoricalAward.nomination_id.in_(record_ids))
                .group_by(HistoricalAward.nomination_id)
            )
            for record_id, awards in award_rows:
                counts[record_id]["award_count"] = int(awards or 0)
        return counts

    async def get_record(
        self,
        principal: AuthPrincipal,
        record_id: UUID,
    ) -> HistoricalNomination:
        _require_manager(principal, "historical.records.read")
        async with self._session.begin():
            record = await self._session.get(HistoricalNomination, record_id)
            if (
                record is None
                or record.archive_status is HistoricalArchiveStatus.ARCHIVED
                or record.deleted_at is not None
            ):
                raise HistoricalNominationNotFoundError()
            return record

    async def create_record(
        self,
        principal: AuthPrincipal,
        payload: HistoricalNominationWrite,
        *,
        creation_request_id: UUID | None = None,
    ) -> HistoricalNomination:
        _require_manager(principal, "historical.records.manage")
        values = payload.model_dump(by_alias=False)
        values["title"] = values["title"] or "Hồ sơ chưa đặt tên"
        async with self._session.begin():
            if values["dossier_type_id"] is not None:
                dossier_type = await self._validate_dossier_type(
                    values["dossier_type_id"]
                )
                values["category_id"] = dossier_type.category_id
            else:
                await self._validate_category(values["category_id"])
            if creation_request_id is not None:
                existing_result = await self._session.execute(
                    select(HistoricalNomination).where(
                        HistoricalNomination.created_by_user_id == principal.user_id,
                        HistoricalNomination.creation_request_id == creation_request_id,
                    )
                )
                existing = existing_result.scalar_one_or_none()
                if existing is not None:
                    if existing.deleted_at is not None:
                        raise HistoricalNominationStateError(
                            "This create request already belongs to a deleted draft."
                        )
                    return existing

            record_id = uuid4()
            record = HistoricalNomination(
                id=record_id,
                code=f"THV-LS-{datetime.now(UTC).year}-{record_id.hex.upper()}",
                creation_request_id=creation_request_id,
                **values,
                created_by_user_id=principal.user_id,
            )
            try:
                async with self._session.begin_nested():
                    self._session.add(record)
                    await self._session.flush()
            except IntegrityError:
                if creation_request_id is None:
                    raise
                existing_result = await self._session.execute(
                    select(HistoricalNomination).where(
                        HistoricalNomination.created_by_user_id == principal.user_id,
                        HistoricalNomination.creation_request_id == creation_request_id,
                    )
                )
                existing = existing_result.scalar_one_or_none()
                if existing is None or existing.deleted_at is not None:
                    raise
                return existing
            self._audit.record(
                actor_user_id=principal.user_id,
                action="historical_nomination.created",
                resource_type="historical_nomination",
                resource_id=str(record.id),
                after={"code": record.code, "status": "DRAFT"},
            )
            await self._session.flush()
            return record

    async def delete_draft(
        self,
        principal: AuthPrincipal,
        record_id: UUID,
        *,
        expected_updated_at: datetime,
    ) -> HistoricalNomination:
        _require_manager(principal, "historical.records.manage")
        async with self._session.begin():
            record = await self._active_record(record_id, for_update=True)
            _assert_expected_version(record, expected_updated_at)
            if (
                record.verification_status is not HistoricalNominationStatus.DRAFT
                or record.publication_status
                not in {
                    HistoricalNominationPublicationStatus.PRIVATE,
                    HistoricalNominationPublicationStatus.PENDING_PUBLICATION,
                }
                or record.published_at is not None
            ):
                raise HistoricalNominationStateError(
                    "Only an unpublished historical draft can be deleted."
                )
            work = await self._session.scalar(
                select(PublicWork)
                .where(PublicWork.historical_nomination_id == record.id)
                .with_for_update()
            )
            if work is not None and (
                work.publication_status is not PublicationStatus.DRAFT
                or work.published_at is not None
            ):
                raise HistoricalNominationStateError(
                    "Hide or archive the public page before deleting this draft."
                )

            record.deleted_at = datetime.now(UTC)
            record.updated_by_user_id = principal.user_id
            self._audit.record(
                actor_user_id=principal.user_id,
                action="historical_nomination.draft_deleted",
                resource_type="historical_nomination",
                resource_id=str(record.id),
                before={"code": record.code, "status": "DRAFT"},
                after={"deleted": True},
            )
            await self._session.flush()
            return record

    async def patch_record(
        self,
        principal: AuthPrincipal,
        record_id: UUID,
        changes: dict[str, object],
        *,
        expected_updated_at: datetime | None = None,
    ) -> HistoricalNomination:
        _require_manager(principal, "historical.records.manage")
        if not changes or not set(changes).issubset(EDITORIAL_FIELDS):
            raise HistoricalNominationValidationError(
                "No editable fields were provided."
            )
        async with self._session.begin():
            record = await self._active_record(record_id, for_update=True)
            if expected_updated_at is not None:
                _assert_expected_version(record, expected_updated_at)
            if "title" in changes and not str(changes["title"] or "").strip():
                changes["title"] = "Hồ sơ chưa đặt tên"
            has_dossier_type = (
                "dossier_type_id" in changes and changes["dossier_type_id"] is not None
            )
            if has_dossier_type:
                dossier_type = await self._validate_dossier_type(
                    changes["dossier_type_id"]
                )
                changes["category_id"] = dossier_type.category_id
            if "category_id" in changes and not has_dossier_type:
                await self._validate_category(changes["category_id"])
            for field, value in changes.items():
                setattr(record, field, value)
            record.updated_by_user_id = principal.user_id
            self._audit.record(
                actor_user_id=principal.user_id,
                action="historical_nomination.updated",
                resource_type="historical_nomination",
                resource_id=str(record.id),
                after={"changed_fields": sorted(changes)},
            )
            await self._session.flush()
            return record

    async def submit_record(
        self,
        principal: AuthPrincipal,
        record_id: UUID,
    ) -> HistoricalNomination:
        _require_admin(principal)
        async with self._session.begin():
            record = await self._active_record(record_id, for_update=True)
            if record.verification_status not in {
                HistoricalNominationStatus.DRAFT,
                HistoricalNominationStatus.NEEDS_CORRECTION,
            }:
                raise HistoricalNominationStateError(
                    "Record cannot be submitted in its current state."
                )
            missing = [
                field
                for field, value in (
                    ("subject_name", record.subject_name),
                    ("title", record.title),
                    ("source_kind", record.source_kind),
                    ("source_label", record.source_label),
                    ("source_reference", record.source_reference),
                )
                if not value or (isinstance(value, str) and not value.strip())
            ]
            if missing:
                raise HistoricalNominationValidationError(
                    "Fill in these required source fields before submitting: "
                    + ", ".join(missing)
                )
            record.missing_fields_json = []
            previous = await self._session.scalar(
                select(func.max(HistoricalNominationVersion.version_no)).where(
                    HistoricalNominationVersion.nomination_id == record.id
                )
            )
            snapshot = _snapshot(record)
            people = await self._session.execute(
                select(HistoricalRelatedPerson, HistoricalNominationPartyRole.role)
                .join(
                    HistoricalNominationPartyRole,
                    HistoricalNominationPartyRole.person_id
                    == HistoricalRelatedPerson.id,
                )
                .where(HistoricalNominationPartyRole.nomination_id == record.id)
                .order_by(HistoricalRelatedPerson.id)
            )
            snapshot["people"] = [
                {
                    "id": str(person.id),
                    "display_name": person.display_name,
                    "organization_name": person.organization_name,
                    "email": person.email,
                    "phone": person.phone,
                    "address": person.address,
                    "internal_notes": person.internal_notes,
                    "role": role.value,
                }
                for person, role in people
            ]
            awards = await self._session.scalars(
                select(HistoricalAward)
                .where(HistoricalAward.nomination_id == record.id)
                .order_by(HistoricalAward.id)
            )
            snapshot["awards"] = [
                {
                    "id": str(award.id),
                    "award_name": award.award_name,
                    "certificate_number": award.certificate_number,
                    "issued_at": award.issued_at.isoformat()
                    if award.issued_at
                    else None,
                    "issued_by": award.issued_by,
                    "recipient_person_id": str(award.recipient_person_id)
                    if award.recipient_person_id
                    else None,
                    "provenance_notes": award.provenance_notes,
                }
                for award in awards
            ]
            public_draft = await self._session.scalar(
                select(HistoricalPublicContentDraft).where(
                    HistoricalPublicContentDraft.nomination_id == record.id
                )
            )
            if public_draft is not None:
                snapshot["public_content_draft"] = {
                    "revision": public_draft.revision,
                    "slug": public_draft.slug,
                    "title": public_draft.title,
                    "short_description": public_draft.short_description,
                    "full_description": public_draft.full_description,
                    "author_display_name": public_draft.author_display_name,
                    "category_id": str(public_draft.category_id)
                    if public_draft.category_id
                    else None,
                    "cover_media_id": str(public_draft.cover_media_id)
                    if public_draft.cover_media_id
                    else None,
                    "featured_video_media_id": str(public_draft.featured_video_media_id)
                    if public_draft.featured_video_media_id
                    else None,
                    "public_media_ids": public_draft.public_media_ids,
                }
            media_links = await self._session.scalars(
                select(HistoricalMediaLink)
                .where(HistoricalMediaLink.nomination_id == record.id)
                .order_by(HistoricalMediaLink.display_order, HistoricalMediaLink.id)
            )
            snapshot["media"] = [
                {
                    "media_id": str(link.media_asset_id),
                    "award_id": str(link.award_id) if link.award_id else None,
                    "media_kind": link.media_kind.value,
                    "access_scope": link.access_scope.value,
                    "display_order": link.display_order,
                }
                for link in media_links
            ]
            serialized = json.dumps(
                snapshot, ensure_ascii=False, sort_keys=True, separators=(",", ":")
            )
            submitted_at = datetime.now(UTC)
            version = HistoricalNominationVersion(
                id=uuid4(),
                nomination_id=record.id,
                version_no=int(previous or 0) + 1,
                snapshot_json=snapshot,
                canonical_hash=hashlib.sha256(serialized.encode("utf-8")).hexdigest(),
                submitted_by_user_id=principal.user_id,
                submitted_at=submitted_at,
            )
            self._session.add(version)
            record.verification_status = HistoricalNominationStatus.SUBMITTED
            record.submitted_by_user_id = principal.user_id
            record.submitted_at = submitted_at
            record.updated_by_user_id = principal.user_id
            record.verification_reason = None
            self._audit.record(
                actor_user_id=principal.user_id,
                action="historical_nomination.submitted",
                resource_type="historical_nomination",
                resource_id=str(record.id),
                after={"version": version.version_no, "status": "SUBMITTED"},
            )
            await self._session.flush()
            return record

    async def list_review_queue(
        self,
        principal: AuthPrincipal,
        *,
        page: int = 1,
        page_size: int = 25,
    ) -> tuple[list[HistoricalNomination], int]:
        _require_admin(principal)
        filters = (
            HistoricalNomination.archive_status == HistoricalArchiveStatus.ACTIVE,
            HistoricalNomination.deleted_at.is_(None),
            HistoricalNomination.verification_status.in_(
                (
                    HistoricalNominationStatus.SUBMITTED,
                    HistoricalNominationStatus.UNDER_REVIEW,
                    HistoricalNominationStatus.HELD,
                )
            ),
        )
        async with self._session.begin():
            total = int(
                await self._session.scalar(
                    select(func.count())
                    .select_from(HistoricalNomination)
                    .where(*filters)
                )
                or 0
            )
            records = list(
                await self._session.scalars(
                    select(HistoricalNomination)
                    .where(*filters)
                    .order_by(HistoricalNomination.submitted_at.asc())
                    .offset((page - 1) * page_size)
                    .limit(page_size)
                )
            )
        return records, total

    async def review_record(
        self,
        principal: AuthPrincipal,
        record_id: UUID,
        *,
        action: str,
        reason: str | None,
        expected_updated_at: datetime,
    ) -> HistoricalNomination:
        _require_admin(principal)
        if (
            action in {"REQUEST_CORRECTION", "HOLD", "REJECT"}
            and not (reason or "").strip()
        ):
            raise HistoricalNominationValidationError(
                "A reason is required for this review action."
            )
        async with self._session.begin():
            record = await self._active_record(record_id, for_update=True)
            _assert_expected_version(record, expected_updated_at)
            if record.verification_status not in {
                HistoricalNominationStatus.SUBMITTED,
                HistoricalNominationStatus.UNDER_REVIEW,
                HistoricalNominationStatus.HELD,
            }:
                raise HistoricalNominationStateError(
                    "Record is not awaiting Admin review."
                )
            before = record.verification_status.value
            now = datetime.now(UTC)
            target = {
                "VERIFY": HistoricalNominationStatus.VERIFIED,
                "REQUEST_CORRECTION": HistoricalNominationStatus.NEEDS_CORRECTION,
                "HOLD": HistoricalNominationStatus.HELD,
                "REJECT": HistoricalNominationStatus.REJECTED,
            }[action]
            record.verification_status = target
            record.verification_reason = (reason or "").strip() or None
            if target is HistoricalNominationStatus.VERIFIED:
                record.verified_by_user_id = principal.user_id
                record.verified_at = now
            else:
                record.verified_by_user_id = None
                record.verified_at = None
            if action == "REQUEST_CORRECTION":
                public_draft = await self._session.scalar(
                    select(HistoricalPublicContentDraft)
                    .where(HistoricalPublicContentDraft.nomination_id == record.id)
                    .with_for_update()
                )
                if public_draft is not None:
                    public_draft.status = (
                        HistoricalPublicContentDraftStatus.NEEDS_CORRECTION
                    )
                    public_draft.updated_by_user_id = principal.user_id
                    public_draft.revision += 1
            self._audit.record(
                actor_user_id=principal.user_id,
                action=f"historical_nomination.{action.casefold()}",
                resource_type="historical_nomination",
                resource_id=str(record.id),
                before={"status": before},
                after={"status": target.value, "reason": record.verification_reason},
            )
            await self._session.flush()
            return record

    async def archive_record(
        self,
        principal: AuthPrincipal,
        record_id: UUID,
        *,
        reason: str,
        expected_updated_at: datetime,
    ) -> HistoricalNomination:
        if "SUPER_ADMIN" not in principal.roles:
            _require_manager(principal, "historical.records.manage")
        if not reason.strip():
            raise HistoricalNominationValidationError("Archive reason is required.")
        async with self._session.begin():
            record = await self._active_record(record_id, for_update=True)
            _assert_expected_version(record, expected_updated_at)
            work = await self._session.scalar(
                select(PublicWork)
                .where(PublicWork.historical_nomination_id == record.id)
                .with_for_update()
            )
            if work is not None and work.publication_status in {
                PublicationStatus.PENDING_PUBLICATION,
                PublicationStatus.PUBLISHED,
            }:
                raise HistoricalNominationStateError(
                    "Hide the public page before archiving this record."
                )
            now = datetime.now(UTC)
            record.archive_status = HistoricalArchiveStatus.ARCHIVED
            record.archived_by_user_id = principal.user_id
            record.archived_at = now
            record.archive_reason = reason.strip()
            record.publication_status = HistoricalNominationPublicationStatus.ARCHIVED
            self._audit.record(
                actor_user_id=principal.user_id,
                action="historical_nomination.archived",
                resource_type="historical_nomination",
                resource_id=str(record.id),
                after={"status": "ARCHIVED", "reason_recorded": True},
            )
            await self._session.flush()
            return record

    async def approve_public_content(
        self,
        principal: AuthPrincipal,
        record_id: UUID,
        payload: HistoricalPublicContentApproval,
    ) -> PublicWork:
        _require_admin(principal)
        async with self._session.begin():
            record = await self._active_record(record_id, for_update=True)
            _assert_expected_version(record, payload.expected_updated_at)
            if record.verification_status is not HistoricalNominationStatus.VERIFIED:
                raise HistoricalNominationStateError(
                    "Verify the historical record before approving public content."
                )
            public_draft = await self._session.scalar(
                select(HistoricalPublicContentDraft)
                .where(HistoricalPublicContentDraft.nomination_id == record.id)
                .with_for_update()
            )
            if (
                public_draft is not None
                and public_draft.status
                is not HistoricalPublicContentDraftStatus.SUBMITTED
            ):
                raise HistoricalNominationStateError(
                    "The public content proposal must be submitted by DATA_MANAGER "
                    "before Admin approval."
                )
            if public_draft is not None:
                await self._validate_public_draft_media(record, public_draft)
            if (
                record.publication_status
                is HistoricalNominationPublicationStatus.PUBLISHED
            ):
                raise HistoricalNominationStateError(
                    "Published historical content must be hidden before it can "
                    "be revised."
                )
            category = await self._session.get(Category, payload.category_id)
            if category is None or not category.is_active or not category.slug:
                raise HistoricalNominationValidationError(
                    "Choose an active public category."
                )
            work = await self._session.scalar(
                select(PublicWork)
                .where(PublicWork.historical_nomination_id == record.id)
                .with_for_update()
            )
            slug_owner = await self._session.scalar(
                select(PublicWork.id).where(
                    PublicWork.slug == payload.slug,
                    PublicWork.id != (work.id if work is not None else UUID(int=0)),
                )
            )
            if slug_owner is not None:
                raise HistoricalNominationValidationError(
                    "Public URL is already in use."
                )
            if work is not None and work.publication_status not in {
                PublicationStatus.DRAFT,
                PublicationStatus.HIDDEN,
            }:
                raise HistoricalNominationStateError(
                    "Only a draft or hidden public page can be updated here."
                )
            if work is None:
                work = PublicWork(
                    id=uuid4(),
                    dossier_id=None,
                    historical_nomination_id=record.id,
                    historical_year=record.nomination_year,
                    certificate_id=None,
                    owner_user_id=principal.user_id,
                    organization_id=None,
                    slug=payload.slug,
                    title=payload.title,
                    short_description=payload.short_description,
                    full_description=payload.full_description,
                    publication_status=PublicationStatus.DRAFT,
                    visibility=PublicWorkVisibility.PRIVATE,
                    author_display_name=payload.author_display_name,
                    category_id=category.id,
                    show_certificate=False,
                )
                self._session.add(work)
            else:
                work.historical_year = record.nomination_year
                work.slug = payload.slug
                work.title = payload.title
                work.short_description = payload.short_description
                work.full_description = payload.full_description
                work.author_display_name = payload.author_display_name
                work.category_id = category.id
                work.show_certificate = False
                work.visibility = PublicWorkVisibility.PRIVATE
                work.publication_status = PublicationStatus.DRAFT
                work.version += 1
            now = datetime.now(UTC)
            record.public_content_approved_by_user_id = principal.user_id
            record.public_content_approved_at = now
            record.publication_status = (
                HistoricalNominationPublicationStatus.PENDING_PUBLICATION
            )
            if public_draft is not None:
                public_draft.status = HistoricalPublicContentDraftStatus.APPROVED
                public_draft.updated_by_user_id = principal.user_id
                public_draft.revision += 1
            self._audit.record(
                actor_user_id=principal.user_id,
                action="historical_nomination.public_content_approved",
                resource_type="historical_nomination",
                resource_id=str(record.id),
                after={
                    "public_work_id": str(work.id),
                    "slug": work.slug,
                    "category_id": str(category.id),
                },
            )
            await self._session.flush()
            return work

    async def get_public_content_draft(
        self,
        principal: AuthPrincipal,
        record_id: UUID,
    ) -> HistoricalPublicContentDraft | None:
        if "SUPER_ADMIN" in principal.roles:
            pass
        else:
            _require_manager(principal, "historical.records.read")
        async with self._session.begin():
            await self._active_record(record_id)
            draft = await self._session.scalar(
                select(HistoricalPublicContentDraft).where(
                    HistoricalPublicContentDraft.nomination_id == record_id
                )
            )
            return draft

    async def list_public_content_versions(
        self,
        principal: AuthPrincipal,
        record_id: UUID,
    ) -> list[HistoricalNominationContentVersion]:
        _require_manager(principal, "historical.records.read")
        async with self._session.begin():
            await self._active_record(record_id)
            return list(
                await self._session.scalars(
                    select(HistoricalNominationContentVersion)
                    .where(
                        HistoricalNominationContentVersion.nomination_id == record_id
                    )
                    .order_by(HistoricalNominationContentVersion.version_no.desc())
                )
            )

    async def list_record_activity(
        self,
        principal: AuthPrincipal,
        record_id: UUID,
    ) -> list[AuditLog]:
        _require_manager(principal, "historical.records.read")
        async with self._session.begin():
            await self._active_record(record_id)
            return list(
                await self._session.scalars(
                    select(AuditLog)
                    .where(
                        AuditLog.resource_type == "historical_nomination",
                        AuditLog.resource_id == str(record_id),
                    )
                    .order_by(AuditLog.created_at.desc())
                    .limit(100)
                )
            )

    async def restore_public_content_version(
        self,
        principal: AuthPrincipal,
        record_id: UUID,
        version_id: UUID,
        payload: HistoricalPublicContentVersionRestore,
    ) -> HistoricalPublicContentDraft:
        _require_manager(principal, "historical.records.manage")
        async with self._session.begin():
            await self._active_record(record_id)
            version = await self._session.scalar(
                select(HistoricalNominationContentVersion).where(
                    HistoricalNominationContentVersion.id == version_id,
                    HistoricalNominationContentVersion.nomination_id == record_id,
                )
            )
            if version is None:
                raise HistoricalNominationNotFoundError()
            draft = await self._session.scalar(
                select(HistoricalPublicContentDraft).where(
                    HistoricalPublicContentDraft.nomination_id == record_id
                )
            )
            if payload.expected_draft_updated_at is not None:
                if draft is None:
                    raise HistoricalNominationStateError(
                        "There is no current public draft to compare. Refresh first."
                    )
                _assert_expected_version(draft, payload.expected_draft_updated_at)
            snapshot = dict(version.snapshot_json)

        def _text(name: str) -> str | None:
            value = snapshot.get(name)
            return value if isinstance(value, str) else None

        def _uuid(name: str) -> UUID | None:
            value = _text(name)
            return UUID(value) if value else None

        raw_media_ids = snapshot.get("public_media_ids", [])
        media_ids = (
            [UUID(value) for value in raw_media_ids if isinstance(value, str)]
            if isinstance(raw_media_ids, list)
            else []
        )
        return await self.save_public_content_draft(
            principal,
            record_id,
            HistoricalPublicContentDraftWrite(
                expected_updated_at=payload.expected_draft_updated_at,
                slug=_text("slug"),
                title=_text("title"),
                short_description=_text("short_description"),
                full_description=_text("full_description"),
                author_display_name=_text("author_display_name"),
                category_id=_uuid("category_id"),
                cover_media_id=_uuid("cover_media_id"),
                featured_video_media_id=_uuid("featured_video_media_id"),
                public_media_ids=media_ids,
            ),
        )

    async def save_public_content_draft(
        self,
        principal: AuthPrincipal,
        record_id: UUID,
        payload: HistoricalPublicContentDraftWrite,
    ) -> HistoricalPublicContentDraft:
        _require_manager(principal, "historical.records.manage")
        async with self._session.begin():
            record = await self._active_record(record_id, for_update=True)
            draft = await self._session.scalar(
                select(HistoricalPublicContentDraft)
                .where(HistoricalPublicContentDraft.nomination_id == record.id)
                .with_for_update()
            )
            if draft is not None and payload.expected_updated_at is not None:
                _assert_expected_version(draft, payload.expected_updated_at)
            if payload.category_id is not None:
                await self._validate_category(payload.category_id)

            selected_ids = set(payload.public_media_ids)
            selected_ids.update(
                media_id
                for media_id in (
                    payload.cover_media_id,
                    payload.featured_video_media_id,
                )
                if media_id is not None
            )
            media_rows = (
                list(
                    await self._session.execute(
                        select(HistoricalMediaLink, MediaAsset)
                        .join(
                            MediaAsset,
                            MediaAsset.id == HistoricalMediaLink.media_asset_id,
                        )
                        .where(
                            HistoricalMediaLink.nomination_id == record.id,
                            HistoricalMediaLink.media_asset_id.in_(selected_ids),
                            HistoricalMediaLink.access_scope
                            == HistoricalMediaAccessScope.PRIVATE,
                            MediaAsset.status == MediaStatus.ACTIVE,
                            MediaAsset.deleted_at.is_(None),
                        )
                    )
                )
                if selected_ids
                else []
            )
            media_by_id = {asset.id: (link, asset) for link, asset in media_rows}
            if set(media_by_id) != selected_ids:
                raise HistoricalNominationValidationError(
                    "Public media must be active private files attached to this record."
                )
            if payload.cover_media_id is not None and not media_by_id[
                payload.cover_media_id
            ][1].mime_type.startswith("image/"):
                raise HistoricalNominationValidationError(
                    "The proposed cover must be an image."
                )
            if payload.featured_video_media_id is not None and not media_by_id[
                payload.featured_video_media_id
            ][1].mime_type.startswith("video/"):
                raise HistoricalNominationValidationError(
                    "The featured media must be a video."
                )

            attached_links = await self._session.scalars(
                select(HistoricalMediaLink).where(
                    HistoricalMediaLink.nomination_id == record.id
                )
            )
            for link in attached_links:
                link.public_candidate = link.media_asset_id in selected_ids

            fields = payload.model_dump(
                by_alias=False, exclude={"expected_updated_at", "public_media_ids"}
            )
            if draft is None:
                draft = HistoricalPublicContentDraft(
                    id=uuid4(),
                    nomination_id=record.id,
                    **fields,
                    public_media_ids=[
                        str(media_id) for media_id in payload.public_media_ids
                    ],
                    status=HistoricalPublicContentDraftStatus.DRAFT,
                    created_by_user_id=principal.user_id,
                )
                self._session.add(draft)
            else:
                for field, value in fields.items():
                    setattr(draft, field, value)
                draft.public_media_ids = [
                    str(media_id) for media_id in payload.public_media_ids
                ]
                draft.status = HistoricalPublicContentDraftStatus.DRAFT
                draft.revision += 1
                draft.updated_by_user_id = principal.user_id
            await self._record_public_content_version(
                principal=principal,
                record_id=record.id,
                event_type="DRAFT_SAVED",
                snapshot={
                    "slug": draft.slug,
                    "title": draft.title,
                    "short_description": draft.short_description,
                    "full_description": draft.full_description,
                    "author_display_name": draft.author_display_name,
                    "category_id": str(draft.category_id)
                    if draft.category_id
                    else None,
                    "cover_media_id": str(draft.cover_media_id)
                    if draft.cover_media_id
                    else None,
                    "featured_video_media_id": str(draft.featured_video_media_id)
                    if draft.featured_video_media_id
                    else None,
                    "public_media_ids": list(draft.public_media_ids),
                },
            )
            record.updated_by_user_id = principal.user_id
            self._audit.record(
                actor_user_id=principal.user_id,
                action="historical_nomination.public_content_draft_saved",
                resource_type="historical_nomination",
                resource_id=str(record.id),
                after={"revision": draft.revision},
            )
            await self._session.flush()
            return draft

    async def submit_public_content_draft(
        self,
        principal: AuthPrincipal,
        record_id: UUID,
        expected_updated_at: datetime,
    ) -> HistoricalPublicContentDraft:
        _require_admin(principal)
        async with self._session.begin():
            record = await self._editable_record(record_id)
            draft = await self._session.scalar(
                select(HistoricalPublicContentDraft)
                .where(HistoricalPublicContentDraft.nomination_id == record.id)
                .with_for_update()
            )
            if draft is None:
                raise HistoricalNominationNotFoundError()
            _assert_expected_version(draft, expected_updated_at)
            if not all(
                (draft.slug, draft.title, draft.short_description, draft.category_id)
            ):
                raise HistoricalNominationValidationError(
                    "Complete the public title, URL, summary, and category before "
                    "sending it to Admin."
                )
            if draft.cover_media_id is None:
                raise HistoricalNominationValidationError(
                    "Choose a cover image before sending public content to Admin."
                )
            await self._validate_public_draft_media(record, draft)
            if draft.status is HistoricalPublicContentDraftStatus.SUBMITTED:
                raise HistoricalNominationStateError(
                    "Public content was already submitted."
                )
            draft.status = HistoricalPublicContentDraftStatus.SUBMITTED
            draft.submitted_by_user_id = principal.user_id
            draft.submitted_at = datetime.now(UTC)
            draft.updated_by_user_id = principal.user_id
            self._audit.record(
                actor_user_id=principal.user_id,
                action="historical_nomination.public_content_draft_submitted",
                resource_type="historical_nomination",
                resource_id=str(record.id),
                after={"revision": draft.revision},
            )
            await self._session.flush()
            return draft

    async def _validate_public_draft_media(
        self,
        record: HistoricalNomination,
        draft: HistoricalPublicContentDraft,
    ) -> None:
        selected_ids = {UUID(media_id) for media_id in draft.public_media_ids}
        selected_ids.update(
            media_id
            for media_id in (draft.cover_media_id, draft.featured_video_media_id)
            if media_id is not None
        )
        if not selected_ids:
            return
        rows = await self._session.execute(
            select(HistoricalMediaLink, MediaAsset)
            .join(MediaAsset, MediaAsset.id == HistoricalMediaLink.media_asset_id)
            .where(
                HistoricalMediaLink.nomination_id == record.id,
                HistoricalMediaLink.media_asset_id.in_(selected_ids),
                HistoricalMediaLink.access_scope == HistoricalMediaAccessScope.PRIVATE,
                MediaAsset.status == MediaStatus.ACTIVE,
                MediaAsset.deleted_at.is_(None),
            )
        )
        media_by_id = {asset.id: asset for _, asset in rows}
        if set(media_by_id) != selected_ids:
            raise HistoricalNominationValidationError(
                "One or more proposed public media files are no longer available."
            )
        if draft.cover_media_id is not None and not media_by_id[
            draft.cover_media_id
        ].mime_type.startswith("image/"):
            raise HistoricalNominationValidationError(
                "The proposed cover must remain an active image."
            )
        if draft.featured_video_media_id is not None and not media_by_id[
            draft.featured_video_media_id
        ].mime_type.startswith("video/"):
            raise HistoricalNominationValidationError(
                "The featured media must remain an active video."
            )

    async def _record_public_content_version(
        self,
        *,
        principal: AuthPrincipal,
        record_id: UUID,
        event_type: str,
        snapshot: dict[str, object],
    ) -> HistoricalNominationContentVersion:
        latest = await self._session.scalar(
            select(func.max(HistoricalNominationContentVersion.version_no)).where(
                HistoricalNominationContentVersion.nomination_id == record_id
            )
        )
        version = HistoricalNominationContentVersion(
            id=uuid4(),
            nomination_id=record_id,
            version_no=int(latest or 0) + 1,
            event_type=event_type,
            snapshot_json=snapshot,
            created_by_user_id=principal.user_id,
        )
        self._session.add(version)
        await self._session.flush()
        return version

    async def find_linkable_account(
        self, principal: AuthPrincipal, email: str
    ) -> HistoricalLinkableAccountData:
        _require_manager(principal, "historical.records.manage")
        async with self._session.begin():
            user = await self._session.scalar(
                select(User).where(
                    func.lower(User.email) == email.strip().lower(),
                    User.status == UserStatus.ACTIVE,
                    User.deleted_at.is_(None),
                    User.disabled_at.is_(None),
                )
            )
            if user is None:
                raise HistoricalNominationValidationError(
                    "Không tìm thấy tài khoản đang hoạt động với email này. "
                    "Hãy mời người nhận đăng ký trước."
                )
            return HistoricalLinkableAccountData(id=user.id, email=user.email)

    async def link_account(
        self,
        principal: AuthPrincipal,
        record_id: UUID,
        person_id: UUID,
        payload: HistoricalAccountLinkWrite,
    ) -> tuple[HistoricalRelatedPerson, HistoricalRelatedPersonRole]:
        _require_manager(principal, "historical.records.manage")
        async with self._session.begin():
            record = await self._editable_record(record_id)
            role = await self._session.scalar(
                select(HistoricalNominationPartyRole.role).where(
                    HistoricalNominationPartyRole.nomination_id == record_id,
                    HistoricalNominationPartyRole.person_id == person_id,
                )
            )
            if role is None:
                raise HistoricalNominationNotFoundError()
            if role not in (
                HistoricalRelatedPersonRole.NOMINEE,
                HistoricalRelatedPersonRole.REPRESENTATIVE,
            ):
                raise HistoricalNominationValidationError(
                    "Chỉ liên kết tài khoản người được đề cử hoặc đại diện."
                )
            person = await self._session.scalar(
                select(HistoricalRelatedPerson)
                .where(HistoricalRelatedPerson.id == person_id)
                .with_for_update()
            )
            if person is None:
                raise HistoricalNominationNotFoundError()
            if (
                person.linked_user_id is not None
                and person.linked_user_id != payload.user_id
            ):
                raise HistoricalNominationStateError(
                    "Người này đã liên kết tài khoản khác. Không thể ghi đè liên kết."
                )
            user = await self._session.scalar(
                select(User)
                .where(
                    User.id == payload.user_id,
                    User.status == UserStatus.ACTIVE,
                    User.deleted_at.is_(None),
                    User.disabled_at.is_(None),
                )
                .with_for_update()
            )
            if user is None:
                raise HistoricalNominationValidationError(
                    "Tài khoản không còn hoạt động. Hãy kiểm tra lại người nhận."
                )
            if person.linked_user_id == user.id:
                return person, role
            person.linked_user_id = user.id
            person.updated_by_user_id = principal.user_id
            record.updated_by_user_id = principal.user_id
            record.updated_at = datetime.now(UTC)
            self._audit.record(
                actor_user_id=principal.user_id,
                action="historical_nomination.account_linked",
                resource_type="historical_nomination",
                resource_id=str(record.id),
                after={
                    "person_id": str(person.id),
                    "linked_user_id": str(user.id),
                    "reason": payload.reason,
                },
            )
            await self._session.flush()
            return person, role

    async def list_linked_records(
        self, principal: AuthPrincipal, *, page: int, page_size: int
    ) -> tuple[list[HistoricalLinkedRecordData], int]:
        linked_people = select(HistoricalRelatedPerson.id).where(
            HistoricalRelatedPerson.linked_user_id == principal.user_id
        )
        linked_records = select(HistoricalNominationPartyRole.nomination_id).where(
            HistoricalNominationPartyRole.person_id.in_(linked_people),
            HistoricalNominationPartyRole.role.in_(
                (
                    HistoricalRelatedPersonRole.NOMINEE,
                    HistoricalRelatedPersonRole.REPRESENTATIVE,
                )
            ),
        )
        filters = (
            HistoricalNomination.id.in_(linked_records),
            HistoricalNomination.deleted_at.is_(None),
            HistoricalNomination.archive_status == HistoricalArchiveStatus.ACTIVE,
        )
        async with self._session.begin():
            total = int(
                await self._session.scalar(
                    select(func.count(HistoricalNomination.id)).where(*filters)
                )
                or 0
            )
            records = list(
                await self._session.scalars(
                    select(HistoricalNomination)
                    .where(*filters)
                    .order_by(
                        HistoricalNomination.created_at.desc(), HistoricalNomination.id
                    )
                    .offset((page - 1) * page_size)
                    .limit(page_size)
                )
            )
            awards = (
                list(
                    await self._session.scalars(
                        select(HistoricalAward)
                        .where(
                            HistoricalAward.nomination_id.in_(
                                [record.id for record in records]
                            ),
                            HistoricalAward.recipient_person_id.is_(None)
                            | HistoricalAward.recipient_person_id.in_(linked_people),
                        )
                        .order_by(HistoricalAward.created_at, HistoricalAward.id)
                    )
                )
                if records
                else []
            )
            return [
                HistoricalLinkedRecordData(
                    id=record.id,
                    code=record.code,
                    title=record.title,
                    subject_name=record.subject_name,
                    nomination_year=record.nomination_year,
                    awards=[
                        HistoricalLinkedAwardData.model_validate(
                            award, from_attributes=True
                        )
                        for award in awards
                        if award.nomination_id == record.id
                    ],
                )
                for record in records
            ], total

    async def list_people(
        self,
        principal: AuthPrincipal,
        record_id: UUID,
    ) -> list[tuple[HistoricalRelatedPerson, HistoricalRelatedPersonRole]]:
        _require_manager(principal, "historical.records.read")
        async with self._session.begin():
            await self._active_record(record_id)
            rows = await self._session.execute(
                select(HistoricalRelatedPerson, HistoricalNominationPartyRole.role)
                .join(
                    HistoricalNominationPartyRole,
                    HistoricalNominationPartyRole.person_id
                    == HistoricalRelatedPerson.id,
                )
                .where(HistoricalNominationPartyRole.nomination_id == record_id)
                .order_by(HistoricalRelatedPerson.display_name)
            )
            return [(person, role) for person, role in rows]

    async def add_person(
        self,
        principal: AuthPrincipal,
        record_id: UUID,
        payload: HistoricalPersonWrite,
    ) -> tuple[HistoricalRelatedPerson, HistoricalRelatedPersonRole]:
        _require_manager(principal, "historical.records.manage")
        values = payload.model_dump(by_alias=False, exclude={"role"})
        async with self._session.begin():
            record = await self._editable_record(record_id)
            person = HistoricalRelatedPerson(
                id=uuid4(),
                **values,
                created_by_user_id=principal.user_id,
            )
            relation = HistoricalNominationPartyRole(
                id=uuid4(),
                nomination_id=record.id,
                person_id=person.id,
                role=payload.role,
                assigned_by_user_id=principal.user_id,
            )
            self._session.add_all((person, relation))
            record.updated_by_user_id = principal.user_id
            self._audit.record(
                actor_user_id=principal.user_id,
                action="historical_nomination.person_added",
                resource_type="historical_nomination",
                resource_id=str(record.id),
                after={"person_id": str(person.id), "role": payload.role.value},
            )
            await self._session.flush()
            return person, payload.role

    async def list_awards(
        self, principal: AuthPrincipal, record_id: UUID
    ) -> list[HistoricalAward]:
        _require_manager(principal, "historical.records.read")
        async with self._session.begin():
            await self._active_record(record_id)
            return list(
                await self._session.scalars(
                    select(HistoricalAward)
                    .where(HistoricalAward.nomination_id == record_id)
                    .order_by(HistoricalAward.issued_at, HistoricalAward.award_name)
                )
            )

    async def add_award(
        self,
        principal: AuthPrincipal,
        record_id: UUID,
        payload: HistoricalAwardWrite,
    ) -> HistoricalAward:
        _require_manager(principal, "historical.records.manage")
        async with self._session.begin():
            record = await self._editable_record(record_id)
            if payload.recipient_person_id is not None:
                recipient = await self._session.scalar(
                    select(HistoricalNominationPartyRole.id).where(
                        HistoricalNominationPartyRole.nomination_id == record.id,
                        HistoricalNominationPartyRole.person_id
                        == payload.recipient_person_id,
                    )
                )
                if recipient is None:
                    raise HistoricalNominationValidationError(
                        "Award recipient must be linked to this nomination."
                    )
            award = HistoricalAward(
                id=uuid4(),
                nomination_id=record.id,
                **payload.model_dump(by_alias=False),
                created_by_user_id=principal.user_id,
            )
            self._session.add(award)
            record.updated_by_user_id = principal.user_id
            self._audit.record(
                actor_user_id=principal.user_id,
                action="historical_nomination.award_added",
                resource_type="historical_nomination",
                resource_id=str(record.id),
                after={"award_id": str(award.id)},
            )
            await self._session.flush()
            return award

    async def update_award(
        self,
        principal: AuthPrincipal,
        record_id: UUID,
        award_id: UUID,
        payload: HistoricalAwardPatch,
    ) -> HistoricalAward:
        _require_manager(principal, "historical.records.manage")
        changes = payload.model_dump(
            by_alias=False,
            exclude_unset=True,
            exclude={"expected_updated_at"},
        )
        if not changes:
            raise HistoricalNominationValidationError(
                "No editable award fields were provided."
            )
        async with self._session.begin():
            record = await self._editable_record(record_id)
            award = await self._session.scalar(
                select(HistoricalAward)
                .where(
                    HistoricalAward.id == award_id,
                    HistoricalAward.nomination_id == record.id,
                )
                .with_for_update()
            )
            if award is None:
                raise HistoricalNominationNotFoundError()
            _assert_expected_version(award, payload.expected_updated_at)
            if "award_name" in changes and not str(changes["award_name"] or "").strip():
                changes["award_name"] = "Bằng xác lập chưa đặt tên"
            recipient_id = changes.get("recipient_person_id", award.recipient_person_id)
            if recipient_id is not None:
                recipient = await self._session.scalar(
                    select(HistoricalNominationPartyRole.id).where(
                        HistoricalNominationPartyRole.nomination_id == record.id,
                        HistoricalNominationPartyRole.person_id == recipient_id,
                    )
                )
                if recipient is None:
                    raise HistoricalNominationValidationError(
                        "Award recipient must be linked to this nomination."
                    )
            for field, value in changes.items():
                setattr(award, field, value)
            award.updated_by_user_id = principal.user_id
            record.updated_by_user_id = principal.user_id
            self._audit.record(
                actor_user_id=principal.user_id,
                action="historical_nomination.award_updated",
                resource_type="historical_nomination",
                resource_id=str(record.id),
                after={
                    "award_id": str(award.id),
                    "changed_fields": sorted(changes),
                },
            )
            await self._session.flush()
            return award

    async def review_award(
        self,
        principal: AuthPrincipal,
        record_id: UUID,
        award_id: UUID,
        *,
        action: str,
        reason: str | None,
    ) -> HistoricalAward:
        _require_admin(principal)
        if action != "VERIFY" and not (reason or "").strip():
            raise HistoricalNominationValidationError(
                "A reason is required for this historical award review action."
            )
        async with self._session.begin():
            record = await self._active_record(record_id, for_update=True)
            award = await self._session.scalar(
                select(HistoricalAward)
                .where(
                    HistoricalAward.id == award_id,
                    HistoricalAward.nomination_id == record.id,
                )
                .with_for_update()
            )
            if award is None:
                raise HistoricalNominationNotFoundError()
            target = {
                "VERIFY": HistoricalAwardVerificationStatus.VERIFIED,
                "REQUEST_EVIDENCE": HistoricalAwardVerificationStatus.NEEDS_EVIDENCE,
                "MARK_UNVERIFIABLE": HistoricalAwardVerificationStatus.UNVERIFIABLE,
            }[action]
            before = award.verification_status.value
            award.verification_status = target
            award.updated_by_user_id = principal.user_id
            self._audit.record(
                actor_user_id=principal.user_id,
                action=f"historical_nomination.award_{action.casefold()}",
                resource_type="historical_nomination",
                resource_id=str(record.id),
                before={"award_id": str(award.id), "verification_status": before},
                after={
                    "award_id": str(award.id),
                    "verification_status": target.value,
                    "reason": (reason or "").strip() or None,
                },
            )
            await self._session.flush()
            return award

    async def link_media(
        self,
        principal: AuthPrincipal,
        record_id: UUID,
        *,
        media_id: UUID,
        media_kind: HistoricalMediaKind,
        award_id: UUID | None,
        display_order: int,
    ) -> HistoricalMediaLink:
        _require_manager(principal, "historical.documents.manage")
        async with self._session.begin():
            record = await self._editable_record(record_id)
            asset = await self._session.get(MediaAsset, media_id)
            if (
                asset is None
                or asset.owner_user_id != principal.user_id
                or asset.purpose != MediaPurpose.HISTORICAL_NOMINATION.value
                or asset.status is not MediaStatus.ACTIVE
                or asset.confidentiality.value != "PRIVATE"
            ):
                raise HistoricalNominationValidationError(
                    "Attach a completed private historical document you uploaded."
                )
            if award_id is not None:
                award = await self._session.get(HistoricalAward, award_id)
                if award is None or award.nomination_id != record.id:
                    raise HistoricalNominationValidationError(
                        "Award does not belong to this nomination."
                    )
            existing_link = await self._session.scalar(
                select(HistoricalMediaLink)
                .where(
                    HistoricalMediaLink.nomination_id == record.id,
                    HistoricalMediaLink.media_asset_id == media_id,
                )
                .with_for_update()
            )
            if existing_link is not None:
                if existing_link.award_id not in {None, award_id}:
                    raise HistoricalNominationValidationError(
                        "This file is already linked to another historical award."
                    )
                existing_link.award_id = award_id
                existing_link.media_kind = media_kind
                existing_link.display_order = display_order
                record.updated_by_user_id = principal.user_id
                self._audit.record(
                    actor_user_id=principal.user_id,
                    action="historical_nomination.media_reused",
                    resource_type="historical_nomination",
                    resource_id=str(record.id),
                    after={
                        "media_id": str(media_id),
                        "award_id": str(award_id) if award_id else None,
                    },
                )
                await self._session.flush()
                return existing_link
            link = HistoricalMediaLink(
                id=uuid4(),
                nomination_id=record.id,
                media_asset_id=media_id,
                award_id=award_id,
                media_kind=media_kind,
                attached_by_user_id=principal.user_id,
                display_order=display_order,
            )
            self._session.add(link)
            record.updated_by_user_id = principal.user_id
            self._audit.record(
                actor_user_id=principal.user_id,
                action="historical_nomination.media_linked",
                resource_type="historical_nomination",
                resource_id=str(record.id),
                after={"media_id": str(media_id), "media_kind": media_kind.value},
            )
            await self._session.flush()
            return link

    async def list_media(
        self,
        principal: AuthPrincipal,
        record_id: UUID,
    ) -> list[tuple[HistoricalMediaLink, MediaAsset]]:
        _require_manager(principal, "historical.documents.manage")
        async with self._session.begin():
            await self._active_record(record_id)
            rows = await self._session.execute(
                select(HistoricalMediaLink, MediaAsset)
                .join(
                    MediaAsset,
                    MediaAsset.id == HistoricalMediaLink.media_asset_id,
                )
                .where(HistoricalMediaLink.nomination_id == record_id)
                .order_by(
                    HistoricalMediaLink.display_order,
                    HistoricalMediaLink.attached_at,
                )
            )
            return list(rows.tuples())

    async def list_media_library(
        self,
        principal: AuthPrincipal,
        *,
        query: str | None = None,
        media_kind: HistoricalMediaKind | None = None,
        page: int = 1,
        page_size: int = 50,
    ) -> tuple[list[tuple[HistoricalMediaLink, MediaAsset, HistoricalNomination]], int]:
        _require_manager(principal, "historical.documents.manage")
        filters = [
            HistoricalNomination.archive_status == HistoricalArchiveStatus.ACTIVE,
            HistoricalNomination.deleted_at.is_(None),
        ]
        if media_kind is not None:
            filters.append(HistoricalMediaLink.media_kind == media_kind)
        if query and query.strip():
            pattern = f"%{query.strip()}%"
            filters.append(
                MediaAsset.original_filename.ilike(pattern)
                | HistoricalNomination.code.ilike(pattern)
                | HistoricalNomination.legacy_code.ilike(pattern)
                | HistoricalNomination.title.ilike(pattern)
                | HistoricalNomination.subject_name.ilike(pattern)
            )
        async with self._session.begin():
            total = int(
                await self._session.scalar(
                    select(func.count(HistoricalMediaLink.id))
                    .join(
                        MediaAsset,
                        MediaAsset.id == HistoricalMediaLink.media_asset_id,
                    )
                    .join(
                        HistoricalNomination,
                        HistoricalNomination.id == HistoricalMediaLink.nomination_id,
                    )
                    .where(*filters)
                )
                or 0
            )
            rows = list(
                (
                    await self._session.execute(
                        select(HistoricalMediaLink, MediaAsset, HistoricalNomination)
                        .join(
                            MediaAsset,
                            MediaAsset.id == HistoricalMediaLink.media_asset_id,
                        )
                        .join(
                            HistoricalNomination,
                            HistoricalNomination.id
                            == HistoricalMediaLink.nomination_id,
                        )
                        .where(*filters)
                        .order_by(
                            HistoricalMediaLink.attached_at.desc(),
                            HistoricalMediaLink.id,
                        )
                        .offset((page - 1) * page_size)
                        .limit(page_size)
                    )
                ).tuples()
            )
        return rows, total

    async def unlink_media(
        self,
        principal: AuthPrincipal,
        record_id: UUID,
        link_id: UUID,
    ) -> None:
        _require_manager(principal, "historical.documents.manage")
        async with self._session.begin():
            record = await self._editable_record(record_id)
            link = await self._session.scalar(
                select(HistoricalMediaLink)
                .where(
                    HistoricalMediaLink.id == link_id,
                    HistoricalMediaLink.nomination_id == record.id,
                )
                .with_for_update()
            )
            if link is None:
                raise HistoricalNominationNotFoundError()
            draft = await self._session.scalar(
                select(HistoricalPublicContentDraft).where(
                    HistoricalPublicContentDraft.nomination_id == record.id
                )
            )
            if draft is not None and (
                draft.cover_media_id == link.media_asset_id
                or draft.featured_video_media_id == link.media_asset_id
                or str(link.media_asset_id) in draft.public_media_ids
            ):
                raise HistoricalNominationStateError(
                    "Remove this file from the public content proposal before "
                    "unlinking it."
                )
            await self._session.delete(link)
            record.updated_by_user_id = principal.user_id
            self._audit.record(
                actor_user_id=principal.user_id,
                action="historical_nomination.media_unlinked",
                resource_type="historical_nomination",
                resource_id=str(record.id),
                after={"media_id": str(link.media_asset_id)},
            )

    async def list_award_library(
        self,
        principal: AuthPrincipal,
        *,
        query: str | None = None,
        page: int = 1,
        page_size: int = 50,
    ) -> tuple[list[tuple[HistoricalAward, HistoricalNomination]], int]:
        _require_manager(principal, "historical.records.read")
        filters = [
            HistoricalNomination.archive_status == HistoricalArchiveStatus.ACTIVE,
            HistoricalNomination.deleted_at.is_(None),
        ]
        if query and query.strip():
            pattern = f"%{query.strip()}%"
            filters.append(
                HistoricalAward.award_name.ilike(pattern)
                | HistoricalAward.certificate_number.ilike(pattern)
                | HistoricalAward.issued_by.ilike(pattern)
                | HistoricalNomination.subject_name.ilike(pattern)
                | HistoricalNomination.code.ilike(pattern)
                | HistoricalNomination.legacy_code.ilike(pattern)
            )
        async with self._session.begin():
            total = int(
                await self._session.scalar(
                    select(func.count(HistoricalAward.id))
                    .join(
                        HistoricalNomination,
                        HistoricalNomination.id == HistoricalAward.nomination_id,
                    )
                    .where(*filters)
                )
                or 0
            )
            rows = list(
                (
                    await self._session.execute(
                        select(HistoricalAward, HistoricalNomination)
                        .join(
                            HistoricalNomination,
                            HistoricalNomination.id == HistoricalAward.nomination_id,
                        )
                        .where(*filters)
                        .order_by(
                            HistoricalAward.issued_at.desc(),
                            HistoricalAward.created_at.desc(),
                        )
                        .offset((page - 1) * page_size)
                        .limit(page_size)
                    )
                ).tuples()
            )
        return rows, total

    async def _active_record(
        self,
        record_id: UUID,
        *,
        for_update: bool = False,
    ) -> HistoricalNomination:
        query = select(HistoricalNomination).where(
            HistoricalNomination.id == record_id,
            HistoricalNomination.archive_status == HistoricalArchiveStatus.ACTIVE,
            HistoricalNomination.deleted_at.is_(None),
        )
        if for_update:
            query = query.with_for_update()
        record = await self._session.scalar(query)
        if record is None:
            raise HistoricalNominationNotFoundError()
        return record

    async def _editable_record(self, record_id: UUID) -> HistoricalNomination:
        return await self._active_record(record_id, for_update=True)

    async def _validate_category(self, category_id: object) -> None:
        if category_id is None:
            return
        category = await self._session.get(Category, category_id)
        if category is None or not category.is_active:
            raise HistoricalNominationValidationError("Category is unavailable.")

    async def _validate_dossier_type(self, dossier_type_id: object) -> DossierType:
        dossier_type = await self._session.get(DossierType, dossier_type_id)
        if dossier_type is None or not dossier_type.is_active:
            raise HistoricalNominationValidationError("Choose an active dossier type.")
        return dossier_type
