"""Read-only archive queries, separate from intake and mutation scopes."""

from datetime import UTC, date, datetime, time
from uuid import UUID

from sqlalchemy import (
    String,
    case,
    cast,
    extract,
    func,
    literal,
    or_,
    select,
    union_all,
)
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.selectable import Subquery

from app.modules.audit.service import AuditService
from app.modules.auth.authorization import AuthorizationPolicy, PolicyRequirement
from app.modules.auth.models import User
from app.modules.auth.session_service import AuthPrincipal
from app.modules.blockchain.models import Certificate
from app.modules.dossiers.archive_schemas import (
    ArchiveEntry,
    ArchiveRecord,
    ArchiveSection,
    ArchiveSource,
)
from app.modules.dossiers.models import Category, Dossier, DossierEvidence
from app.modules.historical_nominations.errors import (
    HistoricalNominationForbiddenError,
    HistoricalNominationNotFoundError,
)
from app.modules.historical_nominations.models import (
    HistoricalAward,
    HistoricalMediaLink,
    HistoricalNomination,
    HistoricalNominationPartyRole,
    HistoricalNominationVersion,
    HistoricalRelatedPerson,
)
from app.modules.media.models import MediaAsset
from app.modules.public.models import PublicWork
from app.modules.users.models import UserProfile


class NominationArchiveService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    @staticmethod
    def require_archive_reader(principal: AuthPrincipal) -> None:
        AuthorizationPolicy.require_capability(
            principal,
            PolicyRequirement(
                permission="historical.records.read",
                compatible_roles=frozenset({"DATA_MANAGER"}),
            ),
            HistoricalNominationForbiddenError,
        )

    async def section(
        self,
        principal: AuthPrincipal,
        source: ArchiveSource,
        record_id: UUID,
        section: ArchiveSection,
        *,
        page: int = 1,
        page_size: int = 25,
    ) -> tuple[list[ArchiveEntry], int]:
        from app.modules.dossiers.archive_sections import read_archive_section

        await self.get_record(principal, source, record_id, audit_read=False)
        entries, total = await read_archive_section(
            self._session, source, record_id, section, page, page_size
        )
        async with self._session.begin():
            self._audit_read(principal, source, record_id, section)
        return entries, total

    @staticmethod
    def records_query(query: str | None = None) -> Subquery:
        current_documents = (
            select(
                DossierEvidence.dossier_id.label("record_id"),
                func.sum(
                    case(
                        (MediaAsset.mime_type.like("image/%"), 0),
                        (MediaAsset.mime_type.like("video/%"), 0),
                        else_=1,
                    )
                ).label("document_count"),
                func.sum(
                    case((MediaAsset.mime_type.like("image/%"), 1), else_=0)
                ).label("image_count"),
                func.sum(
                    case((MediaAsset.mime_type.like("video/%"), 1), else_=0)
                ).label("video_count"),
            )
            .outerjoin(MediaAsset, MediaAsset.id == DossierEvidence.media_asset_id)
            .group_by(DossierEvidence.dossier_id)
            .subquery()
        )
        legacy_documents = (
            select(
                HistoricalMediaLink.nomination_id.label("record_id"),
                func.sum(
                    case(
                        (MediaAsset.mime_type.like("image/%"), 0),
                        (MediaAsset.mime_type.like("video/%"), 0),
                        else_=1,
                    )
                ).label("document_count"),
                func.sum(
                    case((MediaAsset.mime_type.like("image/%"), 1), else_=0)
                ).label("image_count"),
                func.sum(
                    case((MediaAsset.mime_type.like("video/%"), 1), else_=0)
                ).label("video_count"),
            )
            .outerjoin(MediaAsset, MediaAsset.id == HistoricalMediaLink.media_asset_id)
            .group_by(HistoricalMediaLink.nomination_id)
            .subquery()
        )
        current_certificates = (
            select(
                Certificate.dossier_id.label("record_id"),
                func.count(Certificate.id).label("certificate_count"),
                func.max(Certificate.certificate_number).label("certificate_reference"),
            )
            .group_by(Certificate.dossier_id)
            .subquery()
        )
        legacy_awards = (
            select(
                HistoricalAward.nomination_id.label("record_id"),
                func.count(HistoricalAward.id).label("certificate_count"),
                func.coalesce(
                    func.max(HistoricalAward.certificate_number),
                    func.max(HistoricalAward.award_name),
                ).label("certificate_reference"),
            )
            .group_by(HistoricalAward.nomination_id)
            .subquery()
        )
        legacy_versions = (
            select(
                HistoricalNominationVersion.nomination_id.label("record_id"),
                func.max(HistoricalNominationVersion.version_no).label("version_no"),
            )
            .group_by(HistoricalNominationVersion.nomination_id)
            .subquery()
        )
        current = (
            select(
                Dossier.id.label("id"),
                literal("CURRENT").label("source"),
                Dossier.code.label("code"),
                Dossier.title.label("title"),
                User.email.label("subject"),
                Dossier.owner_user_id.label("owner_user_id"),
                UserProfile.full_name.label("owner_name"),
                User.email.label("owner_email"),
                extract(
                    "year", func.coalesce(Dossier.submitted_at, Dossier.created_at)
                ).label("year"),
                Dossier.category_id.label("category_id"),
                Category.name.label("category_name"),
                func.coalesce(Dossier.submitted_at, Dossier.created_at).label(
                    "recorded_at"
                ),
                case(
                    (Dossier.current_version_no > 0, Dossier.current_version_no),
                    else_=None,
                ).label("version_no"),
                cast(Dossier.status, String).label("business_status"),
                cast(PublicWork.publication_status, String).label("publication_status"),
                literal(None, String).label("archive_status"),
                func.coalesce(current_documents.c.document_count, 0).label(
                    "document_count"
                ),
                func.coalesce(current_documents.c.image_count, 0).label("image_count"),
                func.coalesce(current_documents.c.video_count, 0).label("video_count"),
                func.coalesce(current_certificates.c.certificate_count, 0).label(
                    "certificate_count"
                ),
                current_certificates.c.certificate_reference.label(
                    "certificate_reference"
                ),
                Dossier.updated_at.label("updated_at"),
            )
            .join(User, User.id == Dossier.owner_user_id)
            .outerjoin(UserProfile, UserProfile.user_id == User.id)
            .outerjoin(Category, Category.id == Dossier.category_id)
            .outerjoin(PublicWork, PublicWork.dossier_id == Dossier.id)
            .outerjoin(current_documents, current_documents.c.record_id == Dossier.id)
            .outerjoin(
                current_certificates, current_certificates.c.record_id == Dossier.id
            )
            .where(Dossier.deleted_at.is_(None))
        )
        legacy = select(
            HistoricalNomination.id.label("id"),
            literal("LEGACY").label("source"),
            HistoricalNomination.code.label("code"),
            HistoricalNomination.title.label("title"),
            HistoricalNomination.subject_name.label("subject"),
            literal(None).label("owner_user_id"),
            literal(None, String).label("owner_name"),
            literal(None, String).label("owner_email"),
            HistoricalNomination.nomination_year.label("year"),
            HistoricalNomination.category_id.label("category_id"),
            func.coalesce(
                Category.name, HistoricalNomination.legacy_category_label
            ).label("category_name"),
            HistoricalNomination.created_at.label("recorded_at"),
            legacy_versions.c.version_no.label("version_no"),
            cast(HistoricalNomination.verification_status, String).label(
                "business_status"
            ),
            cast(HistoricalNomination.publication_status, String).label(
                "publication_status"
            ),
            cast(HistoricalNomination.archive_status, String).label("archive_status"),
            func.coalesce(legacy_documents.c.document_count, 0).label("document_count"),
            func.coalesce(legacy_documents.c.image_count, 0).label("image_count"),
            func.coalesce(legacy_documents.c.video_count, 0).label("video_count"),
            func.coalesce(legacy_awards.c.certificate_count, 0).label(
                "certificate_count"
            ),
            legacy_awards.c.certificate_reference.label("certificate_reference"),
            HistoricalNomination.updated_at.label("updated_at"),
        ).outerjoin(Category, Category.id == HistoricalNomination.category_id)
        legacy = (
            legacy.outerjoin(
                legacy_documents,
                legacy_documents.c.record_id == HistoricalNomination.id,
            )
            .outerjoin(
                legacy_awards, legacy_awards.c.record_id == HistoricalNomination.id
            )
            .outerjoin(
                legacy_versions,
                legacy_versions.c.record_id == HistoricalNomination.id,
            )
            .where(HistoricalNomination.deleted_at.is_(None))
        )
        if query and query.strip():
            pattern = f"%{query.strip()}%"
            stored_code = f"%{query.strip().replace('THV-', 'CNS-', 1)}%"
            current = current.where(
                or_(
                    Dossier.code.ilike(pattern),
                    Dossier.code.ilike(stored_code),
                    Dossier.title.ilike(pattern),
                    User.email.ilike(pattern),
                    UserProfile.full_name.ilike(pattern),
                    cast(Dossier.form_data_json, String).ilike(pattern),
                )
            )
            related = (
                select(HistoricalNominationPartyRole.nomination_id)
                .join(
                    HistoricalRelatedPerson,
                    HistoricalRelatedPerson.id
                    == HistoricalNominationPartyRole.person_id,
                )
                .where(
                    or_(
                        HistoricalRelatedPerson.display_name.ilike(pattern),
                        HistoricalRelatedPerson.email.ilike(pattern),
                    )
                )
            )
            legacy = legacy.where(
                or_(
                    HistoricalNomination.code.ilike(pattern),
                    HistoricalNomination.title.ilike(pattern),
                    HistoricalNomination.subject_name.ilike(pattern),
                    HistoricalNomination.id.in_(related),
                )
            )
        return union_all(current, legacy).subquery()

    async def list_records(
        self,
        principal: AuthPrincipal,
        *,
        query: str | None = None,
        source: ArchiveSource | None = None,
        category_id: UUID | None = None,
        year: int | None = None,
        business_status: str | None = None,
        publication_status: str | None = None,
        archive_status: str | None = None,
        owner_user_id: UUID | None = None,
        recorded_from: date | None = None,
        recorded_to: date | None = None,
        page: int = 1,
        page_size: int = 25,
    ) -> tuple[list[ArchiveRecord], int]:
        self.require_archive_reader(principal)
        records = self.records_query(query)
        filters = []
        for name, value in (
            ("source", source),
            ("category_id", category_id),
            ("year", year),
            ("business_status", business_status),
            ("publication_status", publication_status),
            ("archive_status", archive_status),
            ("owner_user_id", owner_user_id),
        ):
            if value is not None:
                filters.append(records.c[name] == value)
        if recorded_from is not None:
            filters.append(
                records.c.recorded_at
                >= datetime.combine(recorded_from, time.min, tzinfo=UTC)
            )
        if recorded_to is not None:
            filters.append(
                records.c.recorded_at
                <= datetime.combine(recorded_to, time.max, tzinfo=UTC)
            )
        async with self._session.begin():
            total = int(
                await self._session.scalar(
                    select(func.count()).select_from(records).where(*filters)
                )
                or 0
            )
            rows = (
                (
                    await self._session.execute(
                        select(records)
                        .where(*filters)
                        .order_by(
                            records.c.updated_at.desc(), records.c.source, records.c.id
                        )
                        .offset((page - 1) * page_size)
                        .limit(page_size)
                    )
                )
                .mappings()
                .all()
            )
            results = [ArchiveRecord.model_validate(dict(row)) for row in rows]
            AuditService(self._session).record(
                actor_user_id=principal.user_id,
                action="admin.nomination_archive.list_viewed",
                resource_type="nomination_archive",
                resource_id="list",
                after={
                    "page": page,
                    "page_size": page_size,
                    "source": source,
                    "owner_filtered": owner_user_id is not None,
                    "recorded_from": (
                        recorded_from.isoformat() if recorded_from else None
                    ),
                    "recorded_to": recorded_to.isoformat() if recorded_to else None,
                    "business_status": business_status,
                    "publication_status": publication_status,
                    "archive_status": archive_status,
                },
            )
            return results, total

    async def get_record(
        self,
        principal: AuthPrincipal,
        source: ArchiveSource,
        record_id: UUID,
        *,
        audit_read: bool = True,
    ) -> ArchiveRecord:
        self.require_archive_reader(principal)
        records = self.records_query()
        async with self._session.begin():
            row = (
                (
                    await self._session.execute(
                        select(records).where(
                            records.c.id == record_id, records.c.source == source
                        )
                    )
                )
                .mappings()
                .first()
            )
            if row is None:
                raise HistoricalNominationNotFoundError()
            if audit_read:
                self._audit_read(principal, source, record_id)
            return ArchiveRecord.model_validate(dict(row))

    def _audit_read(
        self,
        principal: AuthPrincipal,
        source: ArchiveSource,
        record_id: UUID,
        section: ArchiveSection | None = None,
    ) -> None:
        AuditService(self._session).record(
            actor_user_id=principal.user_id,
            action=(
                "admin.nomination_archive.section_viewed"
                if section
                else "admin.nomination_archive.record_viewed"
            ),
            resource_type="dossier" if source == "CURRENT" else "historical_nomination",
            resource_id=str(record_id),
            after={
                "source": source,
                **({"section": section} if section else {}),
            },
        )
