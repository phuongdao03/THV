from collections.abc import Callable
from datetime import UTC, datetime
from typing import Protocol, cast
from uuid import UUID, uuid4

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.audit.service import AuditService
from app.modules.auth.authorization import AuthorizationPolicy, PolicyRequirement
from app.modules.auth.session_service import AuthPrincipal
from app.modules.certificate_archives.errors import (
    CertificateArchiveConflictError,
    CertificateArchiveForbiddenError,
    CertificateArchiveNotFoundError,
    CertificateArchiveValidationError,
)
from app.modules.certificate_archives.models import (
    CertificateArchive,
    CertificateArchivePage,
    CertificateArchiveRevision,
    CertificateArchiveStatus,
)
from app.modules.certificate_archives.schemas import (
    CertificateArchiveContentData,
    CertificateArchiveContentInput,
    CertificateArchiveManagerData,
    CertificateArchivePageData,
    PublicCertificateArchiveData,
    PublicCertificateArchivePageData,
)
from app.modules.dossiers.models import Category
from app.modules.media.models import (
    MediaAsset,
    MediaConfidentiality,
    MediaEncryptionStatus,
    MediaStatus,
)
from app.modules.public.models import (
    DerivativeStatus,
    PublicationStatus,
    PublicMediaKind,
    PublicWork,
    PublicWorkMedia,
    PublicWorkVisibility,
)

ARCHIVE_SCAN_MIME_TYPES = frozenset({"image/jpeg", "image/png", "image/webp"})
MAX_ARCHIVE_PAGES = 20


class ArchiveMediaDispatcher(Protocol):
    def enqueue(self, relation_id: UUID) -> None: ...


class CertificateArchiveService:
    def __init__(
        self,
        *,
        session: AsyncSession,
        dispatcher: ArchiveMediaDispatcher,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self._session = session
        self._dispatcher = dispatcher
        self._clock = clock or (lambda: datetime.now(UTC))
        self._audit = AuditService(session)

    @staticmethod
    def _require_manager(principal: AuthPrincipal) -> None:
        AuthorizationPolicy.require_capability(
            principal,
            PolicyRequirement(
                permission="certificate_archives.manage",
                compatible_roles=frozenset({"DATA_MANAGER"}),
            ),
            CertificateArchiveForbiddenError,
        )

    @staticmethod
    def _require_admin(principal: AuthPrincipal) -> None:
        if "SUPER_ADMIN" not in principal.roles:
            raise CertificateArchiveForbiddenError()

    async def list(
        self,
        principal: AuthPrincipal,
        *,
        public_work_id: UUID | None = None,
    ) -> tuple[CertificateArchiveManagerData, ...]:
        self._require_manager(principal)
        async with self._session.begin():
            statement = select(CertificateArchive).order_by(
                CertificateArchive.updated_at.desc(), CertificateArchive.id
            )
            if public_work_id is not None:
                statement = statement.where(
                    CertificateArchive.public_work_id == public_work_id
                )
            archives = tuple((await self._session.scalars(statement.limit(200))).all())
            return tuple([await self._view(archive) for archive in archives])

    async def get(
        self, principal: AuthPrincipal, archive_id: UUID
    ) -> CertificateArchiveManagerData:
        self._require_manager(principal)
        async with self._session.begin():
            archive = await self._archive(archive_id)
            return await self._view(archive)

    async def create(
        self,
        principal: AuthPrincipal,
        public_work_id: UUID,
        content: CertificateArchiveContentInput,
        *,
        request_id: str,
    ) -> CertificateArchiveManagerData:
        self._require_manager(principal)
        snapshot = self._snapshot(content)
        archive_id = uuid4()
        try:
            async with self._session.begin():
                work = await self._work(public_work_id, for_update=True)
                if work.deleted_at is not None:
                    raise CertificateArchiveNotFoundError()
                await self._validate_pages(content)
                archive = CertificateArchive(
                    id=archive_id,
                    public_work_id=work.id,
                    status=CertificateArchiveStatus.DRAFT,
                    version=1,
                    draft_version_no=1,
                    created_by_user_id=principal.user_id,
                    updated_by_user_id=principal.user_id,
                )
                revision = CertificateArchiveRevision(
                    archive_id=archive.id,
                    version_no=1,
                    snapshot_json=snapshot,
                    created_by_user_id=principal.user_id,
                )
                self._session.add_all([archive, revision])
                await self._session.flush()
                self._session.add_all(
                    [
                        CertificateArchivePage(
                            revision_id=revision.id,
                            media_asset_id=page.media_asset_id,
                            sort_order=order,
                            caption=self._plain_text(page.caption, "Page caption"),
                            alt_text=self._plain_text(page.alt_text, "Page alt text")
                            or "",
                        )
                        for order, page in enumerate(content.pages)
                    ]
                )
                self._audit.record(
                    actor_user_id=principal.user_id,
                    action="certificate.archive_created",
                    resource_type="certificate_archive",
                    resource_id=str(archive.id),
                    after={"public_work_id": str(work.id), "version": 1},
                    request_id=request_id,
                )
        except IntegrityError as error:
            raise CertificateArchiveConflictError(
                "A scan page or archive record conflicts with existing data."
            ) from error
        return await self.get(principal, archive_id)

    async def update(
        self,
        principal: AuthPrincipal,
        archive_id: UUID,
        *,
        expected_version: int,
        content: CertificateArchiveContentInput,
        request_id: str,
    ) -> CertificateArchiveManagerData:
        self._require_manager(principal)
        snapshot = self._snapshot(content)
        try:
            async with self._session.begin():
                archive = await self._archive(archive_id, for_update=True)
                if archive.version != expected_version:
                    raise CertificateArchiveConflictError()
                if archive.status is CertificateArchiveStatus.ARCHIVED:
                    raise CertificateArchiveConflictError(
                        "Restore this archived certificate before editing it."
                    )
                await self._work(archive.public_work_id, for_update=True)
                await self._validate_pages(content)
                next_version = archive.draft_version_no + 1
                revision = CertificateArchiveRevision(
                    archive_id=archive.id,
                    version_no=next_version,
                    snapshot_json=snapshot,
                    created_by_user_id=principal.user_id,
                )
                self._session.add(revision)
                await self._session.flush()
                self._session.add_all(
                    [
                        CertificateArchivePage(
                            revision_id=revision.id,
                            media_asset_id=page.media_asset_id,
                            sort_order=order,
                            caption=self._plain_text(page.caption, "Page caption"),
                            alt_text=self._plain_text(page.alt_text, "Page alt text")
                            or "",
                        )
                        for order, page in enumerate(content.pages)
                    ]
                )
                before: dict[str, object] = {
                    "draft_version_no": archive.draft_version_no
                }
                archive.draft_version_no = next_version
                archive.version += 1
                archive.updated_by_user_id = principal.user_id
                self._audit.record(
                    actor_user_id=principal.user_id,
                    action="certificate.archive_draft_updated",
                    resource_type="certificate_archive",
                    resource_id=str(archive.id),
                    before=before,
                    after={"draft_version_no": next_version},
                    request_id=request_id,
                )
        except IntegrityError as error:
            raise CertificateArchiveConflictError(
                "A scan page conflicts with an existing archive revision."
            ) from error
        return await self.get(principal, archive_id)

    async def publish(
        self,
        principal: AuthPrincipal,
        archive_id: UUID,
        *,
        expected_version: int,
        request_id: str,
    ) -> CertificateArchiveManagerData:
        self._require_manager(principal)
        pending_relation_ids: list[UUID] = []
        async with self._session.begin():
            archive = await self._archive(archive_id, for_update=True)
            if archive.version != expected_version:
                raise CertificateArchiveConflictError()
            if archive.status is CertificateArchiveStatus.ARCHIVED:
                raise CertificateArchiveConflictError(
                    "Restore this archived certificate before publishing it."
                )
            work = await self._work(archive.public_work_id, for_update=True)
            category = await self._session.get(Category, work.category_id)
            if (
                work.publication_status is not PublicationStatus.PUBLISHED
                or work.visibility
                not in {PublicWorkVisibility.PUBLIC, PublicWorkVisibility.UNLISTED}
                or category is None
                or not category.is_active
            ):
                raise CertificateArchiveConflictError(
                    "Publish the public work before publishing "
                    "its archived certificate."
                )
            revision = await self._revision(archive.id, archive.draft_version_no)
            if revision is None:
                raise CertificateArchiveConflictError(
                    "The certificate archive draft is unavailable."
                )
            pages = await self._pages(revision.id)
            snapshot = revision.snapshot_json
            if not pages:
                raise CertificateArchiveValidationError(
                    "Add at least one inspected scan image before publishing."
                )
            if not snapshot.get("rights_confirmed") or not snapshot.get(
                "privacy_reviewed"
            ):
                raise CertificateArchiveValidationError(
                    "Confirm image rights and complete the privacy review "
                    "before publishing."
                )
            await self._validate_asset_ids(tuple(page.media_asset_id for page in pages))
            for page in pages:
                relation = await self._session.scalar(
                    select(PublicWorkMedia)
                    .where(
                        PublicWorkMedia.public_work_id == work.id,
                        PublicWorkMedia.media_asset_id == page.media_asset_id,
                    )
                    .with_for_update()
                )
                if relation is None:
                    relation = PublicWorkMedia(
                        public_work_id=work.id,
                        media_asset_id=page.media_asset_id,
                        media_kind=PublicMediaKind.IMAGE,
                        is_certificate_archive_page=True,
                        sort_order=page.sort_order,
                        caption=page.caption,
                        alt_text=page.alt_text,
                        derivative_status=DerivativeStatus.PENDING,
                    )
                    self._session.add(relation)
                    await self._session.flush()
                elif not relation.is_certificate_archive_page:
                    raise CertificateArchiveConflictError(
                        "A scan already attached as gallery media cannot "
                        "also be an archive page."
                    )
                if relation.derivative_status is DerivativeStatus.FAILED:
                    relation.derivative_status = DerivativeStatus.PENDING
                    relation.failure_code = None
                page.public_media_relation_id = relation.id
                if relation.derivative_status is not DerivativeStatus.READY:
                    pending_relation_ids.append(relation.id)
            previous_status = archive.status.value
            archive.status = CertificateArchiveStatus.PUBLISHED
            archive.published_version_no = archive.draft_version_no
            archive.published_by_user_id = principal.user_id
            archive.published_at = self._clock()
            archive.updated_by_user_id = principal.user_id
            archive.version += 1
            work.version += 1
            self._audit.record(
                actor_user_id=principal.user_id,
                action="certificate.archive_published",
                resource_type="certificate_archive",
                resource_id=str(archive.id),
                before={"status": previous_status},
                after={"status": archive.status.value, "version": archive.version},
                request_id=request_id,
            )
        for relation_id in dict.fromkeys(pending_relation_ids):
            self._dispatcher.enqueue(relation_id)
        return await self.get(principal, archive_id)

    async def hide(
        self,
        principal: AuthPrincipal,
        archive_id: UUID,
        *,
        expected_version: int,
        request_id: str,
    ) -> CertificateArchiveManagerData:
        return await self._transition(
            principal,
            archive_id,
            expected_version=expected_version,
            target=CertificateArchiveStatus.HIDDEN,
            request_id=request_id,
        )

    async def archive(
        self,
        principal: AuthPrincipal,
        archive_id: UUID,
        *,
        expected_version: int,
        reason: str,
        request_id: str,
    ) -> CertificateArchiveManagerData:
        normalized = self._plain_text(reason, "Archive reason")
        if normalized is None or len(normalized) < 3:
            raise CertificateArchiveValidationError(
                "Provide a reason with at least 3 characters."
            )
        return await self._transition(
            principal,
            archive_id,
            expected_version=expected_version,
            target=CertificateArchiveStatus.ARCHIVED,
            reason=normalized,
            request_id=request_id,
        )

    async def restore(
        self,
        principal: AuthPrincipal,
        archive_id: UUID,
        *,
        expected_version: int,
        request_id: str,
    ) -> CertificateArchiveManagerData:
        self._require_admin(principal)
        async with self._session.begin():
            archive = await self._archive(archive_id, for_update=True)
            if archive.version != expected_version:
                raise CertificateArchiveConflictError()
            if archive.status is not CertificateArchiveStatus.ARCHIVED:
                raise CertificateArchiveConflictError(
                    "Only an archived certificate can be restored."
                )
            work = await self._work(archive.public_work_id, for_update=True)
            archive.status = (
                CertificateArchiveStatus.PUBLISHED
                if archive.published_version_no is not None
                else CertificateArchiveStatus.DRAFT
            )
            archive.archived_at = None
            archive.archived_by_user_id = None
            archive.archive_reason = None
            archive.updated_by_user_id = principal.user_id
            archive.version += 1
            work.version += 1
            self._audit.record(
                actor_user_id=principal.user_id,
                action="certificate.archive_restored",
                resource_type="certificate_archive",
                resource_id=str(archive.id),
                after={"status": archive.status.value},
                request_id=request_id,
            )
        return await self.get(principal, archive_id)

    async def _transition(
        self,
        principal: AuthPrincipal,
        archive_id: UUID,
        *,
        expected_version: int,
        target: CertificateArchiveStatus,
        request_id: str,
        reason: str | None = None,
    ) -> CertificateArchiveManagerData:
        self._require_manager(principal)
        async with self._session.begin():
            archive = await self._archive(archive_id, for_update=True)
            if archive.version != expected_version:
                raise CertificateArchiveConflictError()
            if archive.status is CertificateArchiveStatus.ARCHIVED:
                raise CertificateArchiveConflictError(
                    "Restore this archived certificate before changing its visibility."
                )
            work = await self._work(archive.public_work_id, for_update=True)
            before: dict[str, object] = {"status": archive.status.value}
            if target is CertificateArchiveStatus.ARCHIVED:
                archive.archived_at = self._clock()
                archive.archived_by_user_id = principal.user_id
                archive.archive_reason = reason
            archive.status = target
            archive.version += 1
            archive.updated_by_user_id = principal.user_id
            if before["status"] == CertificateArchiveStatus.PUBLISHED.value:
                work.version += 1
            self._audit.record(
                actor_user_id=principal.user_id,
                action=(
                    "certificate.archive_archived"
                    if target is CertificateArchiveStatus.ARCHIVED
                    else "certificate.archive_hidden"
                ),
                resource_type="certificate_archive",
                resource_id=str(archive.id),
                before=before,
                after={"status": archive.status.value, "reason": reason},
                request_id=request_id,
            )
        return await self.get(principal, archive_id)

    async def _view(self, archive: CertificateArchive) -> CertificateArchiveManagerData:
        work = await self._session.get(PublicWork, archive.public_work_id)
        draft_revision = await self._revision(archive.id, archive.draft_version_no)
        if work is None or draft_revision is None:
            raise CertificateArchiveNotFoundError()
        draft = await self._content_view(draft_revision)
        published = None
        if archive.published_version_no is not None:
            revision = await self._revision(archive.id, archive.published_version_no)
            if revision is not None:
                published = await self._content_view(revision, published=True)
        return CertificateArchiveManagerData(
            id=archive.id,
            public_work_id=work.id,
            public_work_title=work.title,
            status=archive.status.value,
            version=archive.version,
            draft_version_no=archive.draft_version_no,
            published_version_no=archive.published_version_no,
            draft=draft,
            published=published,
            updated_at=archive.updated_at,
        )

    async def _content_view(
        self,
        revision: CertificateArchiveRevision,
        *,
        published: bool = False,
    ) -> CertificateArchiveContentData:
        rows = await self._session.execute(
            select(CertificateArchivePage, PublicWorkMedia, MediaAsset)
            .outerjoin(
                PublicWorkMedia,
                PublicWorkMedia.id == CertificateArchivePage.public_media_relation_id,
            )
            .join(MediaAsset, MediaAsset.id == CertificateArchivePage.media_asset_id)
            .where(CertificateArchivePage.revision_id == revision.id)
            .order_by(CertificateArchivePage.sort_order)
        )
        pages = []
        for page, relation, asset in rows:
            ready = (
                published
                and relation is not None
                and relation.derivative_status is DerivativeStatus.READY
            )
            pages.append(
                CertificateArchivePageData(
                    media_asset_id=page.media_asset_id,
                    sort_order=page.sort_order,
                    caption=page.caption,
                    alt_text=page.alt_text,
                    url=relation.derivative_url if ready else None,
                    mime_type=(
                        relation.derivative_mime_type if ready else asset.mime_type
                    ),
                    width=relation.derivative_width if ready else asset.width,
                    height=relation.derivative_height if ready else asset.height,
                )
            )
        return CertificateArchiveContentData.model_validate(
            {**revision.snapshot_json, "pages": pages}
        )

    async def _archive(
        self, archive_id: UUID, *, for_update: bool = False
    ) -> CertificateArchive:
        statement = select(CertificateArchive).where(
            CertificateArchive.id == archive_id
        )
        if for_update:
            statement = statement.with_for_update().execution_options(
                populate_existing=True
            )
        archive = await self._session.scalar(statement)
        if archive is None:
            raise CertificateArchiveNotFoundError()
        return archive

    async def _work(self, work_id: UUID, *, for_update: bool = False) -> PublicWork:
        statement = select(PublicWork).where(PublicWork.id == work_id)
        if for_update:
            statement = statement.with_for_update().execution_options(
                populate_existing=True
            )
        work = await self._session.scalar(statement)
        if work is None:
            raise CertificateArchiveNotFoundError()
        return work

    async def _revision(
        self, archive_id: UUID, version_no: int
    ) -> CertificateArchiveRevision | None:
        return cast(
            CertificateArchiveRevision | None,
            await self._session.scalar(
                select(CertificateArchiveRevision).where(
                    CertificateArchiveRevision.archive_id == archive_id,
                    CertificateArchiveRevision.version_no == version_no,
                )
            ),
        )

    async def _pages(self, revision_id: UUID) -> tuple[CertificateArchivePage, ...]:
        rows = await self._session.scalars(
            select(CertificateArchivePage)
            .where(CertificateArchivePage.revision_id == revision_id)
            .order_by(CertificateArchivePage.sort_order)
        )
        return tuple(rows)

    async def _validate_pages(
        self, content: CertificateArchiveContentInput
    ) -> tuple[MediaAsset, ...]:
        if len(content.pages) > MAX_ARCHIVE_PAGES:
            raise CertificateArchiveValidationError(
                "A certificate archive can contain at most "
                f"{MAX_ARCHIVE_PAGES} scan pages."
            )
        ids = tuple(page.media_asset_id for page in content.pages)
        if len(set(ids)) != len(ids):
            raise CertificateArchiveValidationError(
                "A scan image can only appear once in a certificate archive."
            )
        return await self._validate_asset_ids(ids)

    async def _validate_asset_ids(
        self, media_asset_ids: tuple[UUID, ...]
    ) -> tuple[MediaAsset, ...]:
        if not media_asset_ids:
            return ()
        assets = tuple(
            (
                await self._session.scalars(
                    select(MediaAsset)
                    .where(MediaAsset.id.in_(media_asset_ids))
                    .with_for_update()
                )
            ).all()
        )
        by_id = {asset.id: asset for asset in assets}
        for media_id in media_asset_ids:
            asset = by_id.get(media_id)
            if (
                asset is None
                or asset.purpose != "CERTIFICATE_ARCHIVE_SCAN"
                or asset.status is not MediaStatus.ACTIVE
                or asset.deleted_at is not None
                or asset.inspected_at is None
                or asset.confidentiality is not MediaConfidentiality.PRIVATE
                or asset.access_mode != "authenticated"
                or asset.mime_type not in ARCHIVE_SCAN_MIME_TYPES
                or asset.encryption_status
                not in {
                    MediaEncryptionStatus.ENCRYPTED,
                    MediaEncryptionStatus.NOT_REQUIRED,
                    MediaEncryptionStatus.LEGACY_UNENCRYPTED,
                }
                or asset.sha256 is None
            ):
                raise CertificateArchiveValidationError(
                    "Every scan must be an inspected, retained JPEG, PNG, or "
                    "WebP image uploaded for certificate archives."
                )
        return tuple(by_id[media_id] for media_id in media_asset_ids)

    @classmethod
    def _snapshot(cls, content: CertificateArchiveContentInput) -> dict[str, object]:
        normalized = {
            key: value
            for key, value in content.model_dump(mode="json", by_alias=False).items()
            if key != "pages"
        }
        for key, value in normalized.items():
            if isinstance(value, str):
                normalized[key] = cls._plain_text(value, key)
        title = normalized.get("title")
        if not isinstance(title, str) or not title:
            raise CertificateArchiveValidationError("Certificate title is required.")
        return normalized

    @staticmethod
    def _plain_text(value: str | None, field: str) -> str | None:
        normalized = " ".join(value.split()) if value else ""
        if len(normalized) > 2_000 or any(
            character in normalized for character in "<>\x00"
        ):
            raise CertificateArchiveValidationError(f"{field} contains invalid text.")
        return normalized or None


async def list_published_public_archives(
    session: AsyncSession, public_work_id: UUID
) -> tuple[PublicCertificateArchiveData, ...]:
    archives = await session.scalars(
        select(CertificateArchive).where(
            CertificateArchive.public_work_id == public_work_id,
            CertificateArchive.status == CertificateArchiveStatus.PUBLISHED,
            CertificateArchive.published_version_no.is_not(None),
        )
    )
    result: list[PublicCertificateArchiveData] = []
    for archive in archives:
        revision = await session.scalar(
            select(CertificateArchiveRevision).where(
                CertificateArchiveRevision.archive_id == archive.id,
                CertificateArchiveRevision.version_no == archive.published_version_no,
            )
        )
        if revision is None:
            continue
        page_rows = await session.execute(
            select(CertificateArchivePage, PublicWorkMedia)
            .join(
                PublicWorkMedia,
                PublicWorkMedia.id == CertificateArchivePage.public_media_relation_id,
            )
            .where(
                CertificateArchivePage.revision_id == revision.id,
                PublicWorkMedia.is_certificate_archive_page.is_(True),
                PublicWorkMedia.derivative_status == DerivativeStatus.READY,
                PublicWorkMedia.derivative_url.is_not(None),
            )
            .order_by(CertificateArchivePage.sort_order)
        )
        pages = [
            PublicCertificateArchivePageData(
                id=page.id,
                sort_order=page.sort_order,
                caption=page.caption,
                alt_text=page.alt_text,
                url=relation.derivative_url,
                mime_type=relation.derivative_mime_type or "image/webp",
                width=relation.derivative_width,
                height=relation.derivative_height,
            )
            for page, relation in page_rows
            if relation.derivative_url is not None
        ]
        page_count = await session.scalar(
            select(func.count(CertificateArchivePage.id)).where(
                CertificateArchivePage.revision_id == revision.id
            )
        )
        if not pages or len(pages) != page_count:
            continue
        result.append(
            PublicCertificateArchiveData.model_validate(
                {**revision.snapshot_json, "id": archive.id, "pages": pages}
            )
        )
    return tuple(result)
