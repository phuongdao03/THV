import logging
from collections.abc import Callable
from datetime import UTC, datetime
from enum import StrEnum
from typing import cast
from uuid import UUID, uuid4

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import DomainError
from app.db.outbox import OutboxEvent
from app.modules.audit.service import AuditService
from app.modules.auth.authorization import AuthorizationPolicy, PolicyRequirement
from app.modules.auth.repositories import OutboxRepository
from app.modules.auth.security import OutboxPayloadCipher
from app.modules.auth.session_service import AuthPrincipal
from app.modules.dossiers.models import Category
from app.modules.historical_nominations.models import (
    HistoricalArchiveStatus,
    HistoricalMediaAccessScope,
    HistoricalMediaLink,
    HistoricalNomination,
    HistoricalNominationContentVersion,
    HistoricalNominationPublicationStatus,
    HistoricalPublicContentDraft,
)
from app.modules.media.models import MediaAsset, MediaStatus
from app.modules.public.catalog_repository import (
    PublicWorkPublicationContext,
    PublicWorkRepository,
)
from app.modules.public.errors import (
    PublicWorkFeaturedWindowError,
    PublicWorkForbiddenError,
    PublicWorkMetadataValidationError,
    PublicWorkNotFoundError,
    PublicWorkNotPublishableError,
    PublicWorkReasonRequiredError,
    PublicWorkScheduleError,
    PublicWorkSlugConflictError,
    PublicWorkVersionConflictError,
)
from app.modules.public.media_dispatcher import CeleryPublicMediaDispatcher
from app.modules.public.media_service import PUBLIC_MEDIA_MIME_KINDS
from app.modules.public.models import (
    DerivativeStatus,
    PublicationStatus,
    PublicMediaKind,
    PublicWork,
    PublicWorkMedia,
    PublicWorkSlugHistory,
    PublicWorkVisibility,
)
from app.modules.public.publication_policy import publication_checklist

PUBLICATION_ADMIN_ROLES = frozenset({"SUPER_ADMIN"})
logger = logging.getLogger(__name__)


class PublicationAction(StrEnum):
    PUBLISH = "PUBLISH"
    SCHEDULE = "SCHEDULE"
    HIDE = "HIDE"
    SUSPEND = "SUSPEND"
    ARCHIVE = "ARCHIVE"


class PublicationTransitionError(DomainError):
    def __init__(
        self,
        current: PublicationStatus,
        action: PublicationAction,
    ) -> None:
        self.current = current
        self.action = action
        super().__init__(
            code="INVALID_VISIBILITY_TRANSITION",
            message=f"{action.value} is not allowed from {current.value}.",
            status_code=409,
            details={"current_status": current.value, "action": action.value},
        )


ALLOWED_ACTIONS: dict[PublicationStatus, frozenset[PublicationAction]] = {
    PublicationStatus.DRAFT: frozenset(
        {
            PublicationAction.PUBLISH,
            PublicationAction.SCHEDULE,
            PublicationAction.SUSPEND,
            PublicationAction.ARCHIVE,
        }
    ),
    PublicationStatus.PENDING_PUBLICATION: frozenset(
        {
            PublicationAction.PUBLISH,
            PublicationAction.SCHEDULE,
            PublicationAction.HIDE,
            PublicationAction.SUSPEND,
            PublicationAction.ARCHIVE,
        }
    ),
    PublicationStatus.PUBLISHED: frozenset(
        {
            PublicationAction.HIDE,
            PublicationAction.SUSPEND,
            PublicationAction.ARCHIVE,
        }
    ),
    PublicationStatus.HIDDEN: frozenset(
        {
            PublicationAction.PUBLISH,
            PublicationAction.SCHEDULE,
            PublicationAction.SUSPEND,
            PublicationAction.ARCHIVE,
        }
    ),
    PublicationStatus.SUSPENDED: frozenset(
        {PublicationAction.HIDE, PublicationAction.ARCHIVE}
    ),
    PublicationStatus.ARCHIVED: frozenset(),
}


def assert_transition(
    current: PublicationStatus,
    action: PublicationAction,
) -> None:
    if action not in ALLOWED_ACTIONS[current]:
        raise PublicationTransitionError(current, action)


class PublicationService:
    def __init__(
        self,
        *,
        session: AsyncSession,
        audit: AuditService,
        payload_cipher: OutboxPayloadCipher,
        clock: Callable[[], datetime] | None = None,
        media_dispatcher: CeleryPublicMediaDispatcher | None = None,
    ) -> None:
        self._session = session
        self._repository = PublicWorkRepository(session)
        self._audit = audit
        self._outbox = OutboxRepository(session)
        self._payload_cipher = payload_cipher
        self._clock = clock or (lambda: datetime.now(UTC))
        self._media_dispatcher = media_dispatcher

    async def publish(
        self,
        principal: AuthPrincipal,
        work_id: UUID,
        *,
        expected_version: int,
        visibility: PublicWorkVisibility,
        request_id: str,
    ) -> PublicWork:
        self._require_work_editor(principal)
        if visibility is PublicWorkVisibility.PRIVATE:
            raise PublicWorkNotPublishableError(["visibility_must_be_public"])
        async with self._session.begin():
            context = await self._required_context(work_id)
            await self._claim_version(context.work, expected_version)
            assert_transition(
                context.work.publication_status,
                PublicationAction.PUBLISH,
            )
            self._require_publishable(context)
            self._apply_publish(
                context.work,
                visibility=visibility,
                published_at=self._clock(),
            )
            if "SUPER_ADMIN" in principal.roles:
                self._sync_historical_publication(
                    context,
                    HistoricalNominationPublicationStatus.PUBLISHED,
                    actor_user_id=principal.user_id,
                    published_at=context.work.published_at,
                )
            await self._record_change(
                context.work,
                principal.user_id,
                action="public_work.published",
                request_id=request_id,
            )
        return context.work

    async def publish_historical_record(
        self,
        principal: AuthPrincipal,
        record_id: UUID,
        *,
        expected_draft_updated_at: datetime,
        expected_work_version: int | None,
        request_id: str,
    ) -> PublicWork:
        """Apply and publish a LEGACY draft in one transaction."""
        self._require_historical_publisher(principal)
        queued_media_ids: list[UUID] = []
        try:
            async with self._session.begin():
                record = await self._session.scalar(
                    select(HistoricalNomination)
                    .where(
                        HistoricalNomination.id == record_id,
                        HistoricalNomination.archive_status
                        == HistoricalArchiveStatus.ACTIVE,
                    )
                    .with_for_update()
                )
                if record is None:
                    raise PublicWorkNotFoundError()
                draft = await self._session.scalar(
                    select(HistoricalPublicContentDraft)
                    .where(HistoricalPublicContentDraft.nomination_id == record.id)
                    .with_for_update()
                )
                if draft is None:
                    raise PublicWorkNotPublishableError(
                        ["historical_public_content_required"]
                    )
                if self._as_utc(draft.updated_at) != self._as_utc(
                    expected_draft_updated_at
                ):
                    raise PublicWorkVersionConflictError(current_version=draft.revision)
                if not all(
                    (
                        draft.slug,
                        draft.title,
                        draft.short_description,
                        draft.category_id,
                    )
                ):
                    raise PublicWorkNotPublishableError(
                        [
                            "title_required",
                            "slug_required",
                            "description_required",
                            "category_required",
                        ]
                    )
                title = (draft.title or "").strip()
                short_description = (draft.short_description or "").strip()
                slug = (draft.slug or "").strip().lower()
                if len(title) < 3 or len(short_description) < 10:
                    raise PublicWorkMetadataValidationError(
                        "Public title and summary need more detail."
                    )
                category = await self._session.get(Category, draft.category_id)
                if category is None or not category.is_active or not category.slug:
                    raise PublicWorkMetadataValidationError(
                        "Choose an active shared category before publishing."
                    )
                work = await self._session.scalar(
                    select(PublicWork)
                    .where(PublicWork.historical_nomination_id == record.id)
                    .with_for_update()
                )
                if work is None:
                    if expected_work_version is not None:
                        raise PublicWorkVersionConflictError(current_version=0)
                    work = PublicWork(
                        id=uuid4(),
                        dossier_id=None,
                        historical_nomination_id=record.id,
                        historical_year=record.nomination_year,
                        certificate_id=None,
                        owner_user_id=principal.user_id,
                        organization_id=None,
                        slug=slug,
                        title=title,
                        short_description=short_description,
                        full_description=draft.full_description,
                        publication_status=PublicationStatus.DRAFT,
                        visibility=PublicWorkVisibility.PRIVATE,
                        author_display_name=draft.author_display_name,
                        category_id=category.id,
                        show_certificate=False,
                    )
                    self._session.add(work)
                    await self._session.flush()
                else:
                    if work.publication_status in {
                        PublicationStatus.SUSPENDED,
                        PublicationStatus.ARCHIVED,
                    }:
                        raise PublicWorkNotPublishableError(
                            ["historical_public_work_restricted"]
                        )
                    if expected_work_version is None:
                        raise PublicWorkVersionConflictError(
                            current_version=work.version
                        )
                    await self._claim_version(work, expected_work_version)
                    if slug != work.slug:
                        if await self._repository.slug_exists(slug):
                            raise PublicWorkSlugConflictError()
                        self._repository.add_slug_history(
                            PublicWorkSlugHistory(
                                public_work_id=work.id,
                                slug=work.slug,
                            )
                        )
                    work.version += 1
                    work.slug = slug
                    work.title = title
                    work.short_description = short_description
                    work.full_description = draft.full_description
                    work.author_display_name = draft.author_display_name
                    work.category_id = category.id
                    work.historical_year = record.nomination_year
                    work.certificate_id = None
                    work.show_certificate = False

                if (
                    work.historical_nomination_id != record.id
                    or work.dossier_id is not None
                ):
                    raise PublicWorkForbiddenError()
                if slug != work.slug and await self._repository.slug_exists(slug):
                    raise PublicWorkSlugConflictError()

                selected_ids = {UUID(item) for item in draft.public_media_ids}
                selected_ids.update(
                    media_id
                    for media_id in (
                        draft.cover_media_id,
                        draft.featured_video_media_id,
                    )
                    if media_id is not None
                )
                selected_rows = []
                if selected_ids:
                    selected_rows = list(
                        await self._session.execute(
                            select(HistoricalMediaLink, MediaAsset)
                            .join(
                                MediaAsset,
                                MediaAsset.id == HistoricalMediaLink.media_asset_id,
                            )
                            .where(
                                HistoricalMediaLink.nomination_id == record.id,
                                HistoricalMediaLink.media_asset_id.in_(selected_ids),
                                HistoricalMediaLink.public_candidate.is_(True),
                                HistoricalMediaLink.access_scope
                                == HistoricalMediaAccessScope.PRIVATE,
                                MediaAsset.status == MediaStatus.ACTIVE,
                                MediaAsset.deleted_at.is_(None),
                            )
                        )
                    )
                media_by_id = {asset.id: (link, asset) for link, asset in selected_rows}
                cover_id = draft.cover_media_id
                if (
                    cover_id is not None
                    and cover_id not in media_by_id
                    and cover_id != draft.featured_video_media_id
                    and str(cover_id) not in draft.public_media_ids
                ):
                    selected_ids.discard(cover_id)
                    cover_id = None
                if set(media_by_id) != selected_ids:
                    raise PublicWorkNotPublishableError(
                        ["selected_public_media_unavailable"]
                    )
                for media_id, (_, asset) in media_by_id.items():
                    kind = PUBLIC_MEDIA_MIME_KINDS.get(asset.mime_type)
                    if kind is None:
                        raise PublicWorkNotPublishableError(
                            ["selected_public_media_unsupported"]
                        )
                    if media_id == cover_id and kind is not PublicMediaKind.IMAGE:
                        raise PublicWorkNotPublishableError(["cover_must_be_image"])
                    if (
                        media_id == draft.featured_video_media_id
                        and kind is not PublicMediaKind.VIDEO
                    ):
                        raise PublicWorkNotPublishableError(
                            ["featured_media_must_be_video"]
                        )

                existing_media = list(
                    await self._session.scalars(
                        select(PublicWorkMedia).where(
                            PublicWorkMedia.public_work_id == work.id
                        )
                    )
                )
                existing_by_asset = {
                    item.media_asset_id: item for item in existing_media
                }
                for relation in existing_media:
                    if relation.media_asset_id not in selected_ids:
                        await self._session.delete(relation)
                for sort_order, media_id in enumerate(sorted(selected_ids, key=str)):
                    if media_id in existing_by_asset:
                        existing_by_asset[media_id].sort_order = sort_order
                        continue
                    asset = media_by_id[media_id][1]
                    kind = PUBLIC_MEDIA_MIME_KINDS[asset.mime_type]
                    relation = PublicWorkMedia(
                        id=uuid4(),
                        public_work_id=work.id,
                        media_asset_id=media_id,
                        media_kind=kind,
                        sort_order=sort_order,
                        alt_text=(
                            "Ảnh tư liệu" if kind is PublicMediaKind.IMAGE else None
                        ),
                        derivative_status=DerivativeStatus.PENDING,
                    )
                    self._session.add(relation)
                    queued_media_ids.append(relation.id)
                work.thumbnail_media_id = cover_id
                work.publication_status = PublicationStatus.PUBLISHED
                work.visibility = PublicWorkVisibility.PUBLIC
                work.published_at = self._clock()
                work.scheduled_publish_at = None
                work.featured_at = None
                work.featured_until = None
                record.publication_status = (
                    HistoricalNominationPublicationStatus.PUBLISHED
                )
                record.published_by_user_id = principal.user_id
                record.published_at = work.published_at

                latest_version = await self._session.scalar(
                    select(
                        func.max(HistoricalNominationContentVersion.version_no)
                    ).where(
                        HistoricalNominationContentVersion.nomination_id == record.id
                    )
                )
                self._session.add(
                    HistoricalNominationContentVersion(
                        id=uuid4(),
                        nomination_id=record.id,
                        version_no=int(latest_version or 0) + 1,
                        event_type="PUBLISHED",
                        snapshot_json={
                            "slug": work.slug,
                            "title": work.title,
                            "short_description": work.short_description,
                            "full_description": work.full_description,
                            "author_display_name": work.author_display_name,
                            "category_id": str(work.category_id),
                            "cover_media_id": str(work.thumbnail_media_id)
                            if work.thumbnail_media_id
                            else None,
                            "public_media_ids": [
                                str(media_id)
                                for media_id in sorted(selected_ids, key=str)
                            ],
                        },
                        created_by_user_id=principal.user_id,
                    )
                )
                await self._record_change(
                    work,
                    principal.user_id,
                    action="public_work.published",
                    request_id=request_id,
                )
            if self._media_dispatcher is not None:
                for relation_id in queued_media_ids:
                    self._media_dispatcher.enqueue(relation_id)
            return work
        except PublicWorkVersionConflictError:
            raise
        except IntegrityError as error:
            await self._session.rollback()
            raise PublicWorkSlugConflictError() from error

    async def hide_historical_record(
        self,
        principal: AuthPrincipal,
        record_id: UUID,
        *,
        expected_work_version: int,
        request_id: str,
    ) -> PublicWork:
        self._require_historical_publisher(principal)
        async with self._session.begin():
            context = await self._session.scalar(
                select(PublicWork)
                .where(PublicWork.historical_nomination_id == record_id)
                .with_for_update()
            )
            if context is None or context.dossier_id is not None:
                raise PublicWorkNotFoundError()
            await self._claim_version(context, expected_work_version)
            assert_transition(context.publication_status, PublicationAction.HIDE)
            context.publication_status = PublicationStatus.HIDDEN
            context.visibility = PublicWorkVisibility.PRIVATE
            context.scheduled_publish_at = None
            context.featured_at = None
            context.featured_until = None
            record = await self._session.get(HistoricalNomination, record_id)
            if (
                record is None
                or record.archive_status is not HistoricalArchiveStatus.ACTIVE
            ):
                raise PublicWorkNotFoundError()
            record.publication_status = HistoricalNominationPublicationStatus.HIDDEN
            record.published_by_user_id = None
            record.published_at = None
            await self._record_change(
                context,
                principal.user_id,
                action="public_work.hidden",
                request_id=request_id,
            )
            return context

    async def get_historical_publication(
        self,
        principal: AuthPrincipal,
        record_id: UUID,
    ) -> PublicWork | None:
        self._require_historical_reader(principal)
        async with self._session.begin():
            record = await self._session.scalar(
                select(HistoricalNomination).where(
                    HistoricalNomination.id == record_id,
                    HistoricalNomination.archive_status
                    == HistoricalArchiveStatus.ACTIVE,
                )
            )
            if record is None:
                raise PublicWorkNotFoundError()
            return cast(
                PublicWork | None,
                await self._session.scalar(
                    select(PublicWork).where(
                        PublicWork.historical_nomination_id == record.id
                    )
                ),
            )

    async def schedule(
        self,
        principal: AuthPrincipal,
        work_id: UUID,
        *,
        expected_version: int,
        visibility: PublicWorkVisibility,
        publish_at: datetime,
        request_id: str,
    ) -> PublicWork:
        self._require_admin(principal)
        now = self._clock()
        normalized_publish_at = self._as_utc(publish_at)
        if (
            publish_at.tzinfo is None
            or normalized_publish_at <= self._as_utc(now)
            or visibility is PublicWorkVisibility.PRIVATE
        ):
            raise PublicWorkScheduleError()
        async with self._session.begin():
            context = await self._required_context(work_id)
            await self._claim_version(context.work, expected_version)
            assert_transition(
                context.work.publication_status,
                PublicationAction.SCHEDULE,
            )
            self._require_publishable(context)
            context.work.publication_status = PublicationStatus.PENDING_PUBLICATION
            context.work.visibility = visibility
            context.work.scheduled_publish_at = normalized_publish_at
            context.work.featured_at = None
            context.work.featured_until = None
            self._sync_historical_publication(
                context,
                HistoricalNominationPublicationStatus.PENDING_PUBLICATION,
            )
            await self._record_change(
                context.work,
                principal.user_id,
                action="public_work.updated",
                request_id=request_id,
            )
        return context.work

    async def hide(
        self,
        principal: AuthPrincipal,
        work_id: UUID,
        *,
        expected_version: int,
        request_id: str,
    ) -> PublicWork:
        return await self._restrict_visibility(
            principal,
            work_id,
            expected_version=expected_version,
            action=PublicationAction.HIDE,
            target=PublicationStatus.HIDDEN,
            reason=None,
            request_id=request_id,
            allow_work_editor=True,
        )

    async def suspend(
        self,
        principal: AuthPrincipal,
        work_id: UUID,
        *,
        expected_version: int,
        reason: str,
        request_id: str,
    ) -> PublicWork:
        return await self._restrict_visibility(
            principal,
            work_id,
            expected_version=expected_version,
            action=PublicationAction.SUSPEND,
            target=PublicationStatus.SUSPENDED,
            reason=self._required_reason(reason),
            request_id=request_id,
            allow_work_editor=True,
        )

    async def archive(
        self,
        principal: AuthPrincipal,
        work_id: UUID,
        *,
        expected_version: int,
        reason: str,
        request_id: str,
    ) -> PublicWork:
        return await self._restrict_visibility(
            principal,
            work_id,
            expected_version=expected_version,
            action=PublicationAction.ARCHIVE,
            target=PublicationStatus.ARCHIVED,
            reason=self._required_reason(reason),
            request_id=request_id,
        )

    async def feature(
        self,
        principal: AuthPrincipal,
        work_id: UUID,
        *,
        expected_version: int,
        featured_at: datetime,
        featured_until: datetime | None,
        request_id: str,
    ) -> PublicWork:
        self._require_admin(principal)
        if featured_at.tzinfo is None or (
            featured_until is not None and featured_until.tzinfo is None
        ):
            raise PublicWorkFeaturedWindowError()
        normalized_start = self._as_utc(featured_at)
        normalized_end = (
            self._as_utc(featured_until) if featured_until is not None else None
        )
        now = self._as_utc(self._clock())
        if normalized_end is not None and (
            normalized_end <= normalized_start or normalized_end <= now
        ):
            raise PublicWorkFeaturedWindowError()
        async with self._session.begin():
            context = await self._required_context(work_id)
            work = context.work
            await self._claim_version(work, expected_version)
            if (
                work.publication_status is not PublicationStatus.PUBLISHED
                or work.visibility is not PublicWorkVisibility.PUBLIC
            ):
                raise PublicWorkNotPublishableError(
                    ["featured_requires_published_public"]
                )
            work.featured_at = normalized_start
            work.featured_until = normalized_end
            await self._record_change(
                work,
                principal.user_id,
                action="public_work.featured",
                request_id=request_id,
            )
        return context.work

    async def unfeature(
        self,
        principal: AuthPrincipal,
        work_id: UUID,
        *,
        expected_version: int,
        request_id: str,
    ) -> PublicWork:
        self._require_admin(principal)
        async with self._session.begin():
            context = await self._required_context(work_id)
            work = context.work
            await self._claim_version(work, expected_version)
            work.featured_at = None
            work.featured_until = None
            await self._record_change(
                work,
                principal.user_id,
                action="public_work.unfeatured",
                request_id=request_id,
            )
        return context.work

    async def publish_due(self, *, now: datetime, limit: int = 100) -> int:
        if not 1 <= limit <= 1000:
            raise ValueError("limit must be between 1 and 1000")
        normalized_now = self._as_utc(now)
        async with self._session.begin():
            work_ids = await self._repository.list_due_publication_ids(
                now=normalized_now,
                limit=limit,
            )
        published = 0
        for work_id in work_ids:
            async with self._session.begin():
                context = await self._required_context(work_id)
                work = context.work
                scheduled_at = work.scheduled_publish_at
                if (
                    work.publication_status is not PublicationStatus.PENDING_PUBLICATION
                    or scheduled_at is None
                    or self._as_utc(scheduled_at) > normalized_now
                ):
                    continue
                try:
                    self._require_publishable(context)
                except PublicWorkNotPublishableError as error:
                    logger.warning(
                        "scheduled_public_work_not_publishable",
                        extra={
                            "public_work_id": str(work.id),
                            "error_code": error.code,
                        },
                    )
                    continue
                await self._claim_version(work, work.version)
                self._apply_publish(
                    work,
                    visibility=work.visibility,
                    published_at=normalized_now,
                )
                self._sync_historical_publication(
                    context,
                    HistoricalNominationPublicationStatus.PUBLISHED,
                    actor_user_id=work.owner_user_id,
                    published_at=normalized_now,
                )
                await self._record_change(
                    work,
                    None,
                    action="public_work.published",
                    request_id="scheduled-publication",
                )
                published += 1
        return published

    async def _restrict_visibility(
        self,
        principal: AuthPrincipal,
        work_id: UUID,
        *,
        expected_version: int,
        action: PublicationAction,
        target: PublicationStatus,
        reason: str | None,
        request_id: str,
        allow_work_editor: bool = False,
    ) -> PublicWork:
        if allow_work_editor:
            self._require_work_editor(principal)
        else:
            self._require_admin(principal)
        async with self._session.begin():
            context = await self._required_context(work_id)
            work = context.work
            await self._claim_version(work, expected_version)
            assert_transition(work.publication_status, action)
            work.publication_status = target
            work.visibility = PublicWorkVisibility.PRIVATE
            work.scheduled_publish_at = None
            work.featured_at = None
            work.featured_until = None
            if not allow_work_editor or "SUPER_ADMIN" in principal.roles:
                self._sync_historical_publication(
                    context,
                    {
                        PublicationStatus.HIDDEN: (
                            HistoricalNominationPublicationStatus.HIDDEN
                        ),
                        PublicationStatus.SUSPENDED: (
                            HistoricalNominationPublicationStatus.PRIVATE
                        ),
                        PublicationStatus.ARCHIVED: (
                            HistoricalNominationPublicationStatus.ARCHIVED
                        ),
                    }[target],
                )
            await self._record_change(
                work,
                principal.user_id,
                action=f"public_work.{action.value.lower()}",
                request_id=request_id,
                reason=reason,
            )
        return context.work

    async def _required_context(
        self,
        work_id: UUID,
    ) -> PublicWorkPublicationContext:
        context = await self._repository.get_publication_context(
            work_id,
            for_update=True,
        )
        if context is None:
            raise PublicWorkNotFoundError()
        return context

    @staticmethod
    def _require_publishable(context: PublicWorkPublicationContext) -> None:
        reasons = list(publication_checklist(context))
        if context.dossier is not None and context.dossier.is_test:
            reasons.append("test_dossier_cannot_be_published")
        if reasons:
            raise PublicWorkNotPublishableError(reasons)

    @staticmethod
    def _apply_publish(
        work: PublicWork,
        *,
        visibility: PublicWorkVisibility,
        published_at: datetime,
    ) -> None:
        work.publication_status = PublicationStatus.PUBLISHED
        work.visibility = visibility
        work.published_at = published_at
        work.scheduled_publish_at = None
        work.featured_at = None
        work.featured_until = None

    @staticmethod
    def _sync_historical_publication(
        context: PublicWorkPublicationContext,
        status: HistoricalNominationPublicationStatus,
        *,
        actor_user_id: UUID | None = None,
        published_at: datetime | None = None,
    ) -> None:
        record = context.historical_nomination
        if record is None:
            return
        record.publication_status = status
        record.published_by_user_id = (
            actor_user_id
            if status is HistoricalNominationPublicationStatus.PUBLISHED
            else None
        )
        record.published_at = (
            published_at
            if status is HistoricalNominationPublicationStatus.PUBLISHED
            else None
        )

    async def _record_change(
        self,
        work: PublicWork,
        actor_user_id: UUID | None,
        *,
        action: str,
        request_id: str,
        reason: str | None = None,
    ) -> None:
        await self._session.flush()
        after = self._serialize(work)
        if reason is not None:
            after["reason"] = reason
        self._audit.record(
            actor_user_id=actor_user_id,
            action=action,
            resource_type="public_work",
            resource_id=str(work.id),
            after=after,
            request_id=request_id,
        )
        encrypted = self._payload_cipher.encrypt(
            {
                "public_work_id": str(work.id),
                "slug": work.slug,
                "status": work.publication_status.value,
                "visibility": work.visibility.value,
                "version": str(work.version),
                "invalidate_cache": "true",
            },
            event_type=action,
            aggregate_id=work.id,
        )
        self._outbox.add(
            OutboxEvent(
                event_type=action,
                aggregate_type="public_work",
                aggregate_id=work.id,
                payload_ciphertext=encrypted.ciphertext,
                payload_nonce=encrypted.nonce,
                key_id=encrypted.key_id,
                occurred_at=self._clock(),
            )
        )

    @staticmethod
    def _serialize(work: PublicWork) -> dict[str, object]:
        return {
            "id": str(work.id),
            "title": work.title,
            "publication_status": work.publication_status.value,
            "visibility": work.visibility.value,
            "version": work.version,
            "published_at": (
                work.published_at.isoformat() if work.published_at else None
            ),
            "scheduled_publish_at": (
                work.scheduled_publish_at.isoformat()
                if work.scheduled_publish_at
                else None
            ),
            "featured_at": (work.featured_at.isoformat() if work.featured_at else None),
            "featured_until": (
                work.featured_until.isoformat() if work.featured_until else None
            ),
        }

    async def _claim_version(
        self,
        work: PublicWork,
        expected_version: int,
    ) -> None:
        if work.version != expected_version or not await self._repository.claim_version(
            work,
            expected_version,
        ):
            await self._session.refresh(work, attribute_names=["version"])
            raise PublicWorkVersionConflictError(current_version=work.version)

    @staticmethod
    def _require_admin(principal: AuthPrincipal) -> None:
        AuthorizationPolicy.require_capability(
            principal,
            PolicyRequirement(
                permission="public_content.manage",
                compatible_roles=PUBLICATION_ADMIN_ROLES,
            ),
            PublicWorkForbiddenError,
        )

    @staticmethod
    def _require_work_editor(principal: AuthPrincipal) -> None:
        AuthorizationPolicy.require_capability(
            principal,
            PolicyRequirement(
                permission="public_content.works.manage",
                compatible_roles=frozenset({"DATA_MANAGER"}),
            ),
            PublicWorkForbiddenError,
        )

    @staticmethod
    def _require_historical_publisher(principal: AuthPrincipal) -> None:
        PublicationService._require_work_editor(principal)

    @staticmethod
    def _require_historical_reader(principal: AuthPrincipal) -> None:
        AuthorizationPolicy.require_capability(
            principal,
            PolicyRequirement(
                permission="historical.records.read",
                compatible_roles=frozenset({"DATA_MANAGER"}),
            ),
            PublicWorkForbiddenError,
        )

    @staticmethod
    def _required_reason(reason: str) -> str:
        normalized = " ".join(reason.split())
        if not normalized:
            raise PublicWorkReasonRequiredError()
        return normalized

    @staticmethod
    def _as_utc(value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)
