"""Admin-only archive queries, independent of intake and owner mutation scopes."""

from uuid import UUID

from sqlalchemy import String, cast, extract, func, literal, or_, select, union_all
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.selectable import Subquery

from app.modules.auth.models import User
from app.modules.auth.session_service import AuthPrincipal
from app.modules.dossiers.archive_schemas import (
    ArchiveEntry,
    ArchiveRecord,
    ArchiveSection,
    ArchiveSource,
)
from app.modules.dossiers.models import Dossier
from app.modules.historical_nominations.errors import (
    HistoricalNominationForbiddenError,
    HistoricalNominationNotFoundError,
)
from app.modules.historical_nominations.models import (
    HistoricalNomination,
    HistoricalNominationPartyRole,
    HistoricalRelatedPerson,
)
from app.modules.public.models import PublicWork


class NominationArchiveService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    @staticmethod
    def require_admin(principal: AuthPrincipal) -> None:
        # This additive archive grant is explicitly SUPER_ADMIN only, even if
        # another role has intake, source-editing or reviewer permissions.
        if "SUPER_ADMIN" not in principal.roles:
            raise HistoricalNominationForbiddenError()

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

        await self.get_record(principal, source, record_id)
        return await read_archive_section(
            self._session, source, record_id, section, page, page_size
        )

    @staticmethod
    def records_query(query: str | None = None) -> Subquery:
        current = (
            select(
                Dossier.id.label("id"),
                literal("CURRENT").label("source"),
                Dossier.code.label("code"),
                Dossier.title.label("title"),
                User.email.label("subject"),
                extract(
                    "year", func.coalesce(Dossier.submitted_at, Dossier.created_at)
                ).label("year"),
                Dossier.category_id.label("category_id"),
                cast(Dossier.status, String).label("business_status"),
                cast(PublicWork.publication_status, String).label("publication_status"),
                literal(None, String).label("archive_status"),
                Dossier.updated_at.label("updated_at"),
            )
            .join(User, User.id == Dossier.owner_user_id)
            .outerjoin(PublicWork, PublicWork.dossier_id == Dossier.id)
            .where(Dossier.deleted_at.is_(None))
        )
        legacy = select(
            HistoricalNomination.id.label("id"),
            literal("LEGACY").label("source"),
            HistoricalNomination.code.label("code"),
            HistoricalNomination.title.label("title"),
            HistoricalNomination.subject_name.label("subject"),
            HistoricalNomination.nomination_year.label("year"),
            HistoricalNomination.category_id.label("category_id"),
            cast(HistoricalNomination.verification_status, String).label(
                "business_status"
            ),
            cast(HistoricalNomination.publication_status, String).label(
                "publication_status"
            ),
            cast(HistoricalNomination.archive_status, String).label("archive_status"),
            HistoricalNomination.updated_at.label("updated_at"),
        ).where(HistoricalNomination.deleted_at.is_(None))
        if query and query.strip():
            pattern = f"%{query.strip()}%"
            stored_code = f"%{query.strip().replace('THV-', 'CNS-', 1)}%"
            current = current.where(
                or_(
                    Dossier.code.ilike(pattern),
                    Dossier.code.ilike(stored_code),
                    Dossier.title.ilike(pattern),
                    User.email.ilike(pattern),
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
        page: int = 1,
        page_size: int = 25,
    ) -> tuple[list[ArchiveRecord], int]:
        self.require_admin(principal)
        records = self.records_query(query)
        filters = []
        for name, value in (
            ("source", source),
            ("category_id", category_id),
            ("year", year),
            ("business_status", business_status),
            ("publication_status", publication_status),
            ("archive_status", archive_status),
        ):
            if value is not None:
                filters.append(records.c[name] == value)
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
            return [ArchiveRecord.model_validate(dict(row)) for row in rows], total

    async def get_record(
        self, principal: AuthPrincipal, source: ArchiveSource, record_id: UUID
    ) -> ArchiveRecord:
        self.require_admin(principal)
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
            return ArchiveRecord.model_validate(dict(row))
