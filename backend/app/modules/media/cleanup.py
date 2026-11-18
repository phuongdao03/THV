import logging
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import Base
from app.modules.media.errors import MediaProviderUnavailableError
from app.modules.media.gateway import CloudinaryMediaGateway
from app.modules.media.models import (
    MediaAsset,
    MediaCleanupJob,
    MediaEncryptionStatus,
    MediaStatus,
)
from app.modules.media.references import reference_columns, referenced_media_ids
from app.modules.media.repository import MediaAssetRepository
from app.modules.media.types import MediaPurpose

logger = logging.getLogger(__name__)
MAX_ATTEMPTS = 5


class MediaCleanupService:
    def __init__(
        self,
        session: AsyncSession,
        gateway: CloudinaryMediaGateway,
        *,
        environment: str,
    ) -> None:
        self._session = session
        self._gateway = gateway
        self._repository = MediaAssetRepository(session)
        self._environment = environment

    async def _has_reference(self, media_id: UUID) -> bool:
        connection = await self._session.connection()
        if connection.dialect.name == "postgresql":
            references = tuple(
                reference
                for reference in await reference_columns(connection)
                if (reference.schema_name, reference.table_name)
                != ("public", MediaCleanupJob.__tablename__)
            )
            return bool(await referenced_media_ids(connection, (media_id,), references))
        for table in Base.metadata.tables.values():
            if table is MediaCleanupJob.__table__:
                continue
            for foreign_key in table.foreign_keys:
                if foreign_key.target_fullname != "media_assets.id":
                    continue
                column = foreign_key.parent
                if (
                    await self._session.scalar(
                        select(column).where(column == media_id).limit(1)
                    )
                    is not None
                ):
                    return True
        return False

    async def process_one(self) -> bool:
        now = datetime.now(UTC)
        async with self._session.begin():
            job = await self._session.scalar(
                select(MediaCleanupJob)
                .where(
                    MediaCleanupJob.finished_at.is_(None),
                    MediaCleanupJob.next_attempt_at <= now,
                )
                .order_by(MediaCleanupJob.next_attempt_at, MediaCleanupJob.id)
                .limit(1)
                .with_for_update(skip_locked=True)
                .execution_options(populate_existing=True)
            )
            if job is None:
                return False
            asset = await self._repository.get_by_id(job.media_id, for_update=True)
            if job.claimed_at is None:
                if not self._eligible(asset) or await self._has_reference(job.media_id):
                    job.finished_at = now
                    job.outcome = "RETAINED"
                    return True
                assert asset is not None
                if asset.upload_expires_at is not None:
                    expires_at = asset.upload_expires_at.replace(tzinfo=UTC)
                    if expires_at > now:
                        job.next_attempt_at = expires_at
                        return True
                if asset.status is MediaStatus.QUARANTINED:
                    # Inspection can be transferring an encrypted copy outside
                    # the row lock. Wait for its existing state transition.
                    job.next_attempt_at = now + timedelta(minutes=10)
                    return True
                # Commit the tombstone before sending a request whose response
                # could be lost. Attachments must reject this media on retries.
                asset.status = MediaStatus.DELETED
                asset.deleted_at = now
                job.claimed_at = now
            job_id = job.id
        await self._destroy(job_id)
        return True

    def _eligible(self, asset: MediaAsset | None) -> bool:
        if asset is None or asset.status is MediaStatus.DELETED:
            return False
        prefix = (
            f"cns/{self._environment}/owners/{asset.owner_user_id}/"
            "uploads/dossier-evidence/"
        )
        return (
            asset.purpose == MediaPurpose.DOSSIER_EVIDENCE
            and asset.storage_provider == "CLOUDINARY"
            and asset.access_mode == "authenticated"
            and asset.resource_type in {"image", "video", "raw"}
            and asset.cloudinary_public_id.rsplit(".", 1)[0] == f"{prefix}{asset.id}"
            and (
                asset.encryption_status is not MediaEncryptionStatus.ENCRYPTED
                or asset.encrypted_object_public_id
                == f"{asset.cloudinary_public_id}-ciphertext"
            )
        )

    async def _destroy(self, job_id: UUID) -> None:
        now = datetime.now(UTC)
        async with self._session.begin():
            job = await self._session.scalar(
                select(MediaCleanupJob)
                .where(
                    MediaCleanupJob.id == job_id,
                    MediaCleanupJob.finished_at.is_(None),
                    MediaCleanupJob.next_attempt_at <= now,
                )
                .with_for_update()
                .execution_options(populate_existing=True)
            )
            if job is None:
                return
            asset = await self._repository.get_by_id(job.media_id, for_update=True)
            assert asset is not None
            context = {
                "job_id": str(job_id),
                "media_id": str(asset.id),
                "dossier_id": str(job.dossier_id),
                "provider": asset.storage_provider,
                "resource_type": asset.resource_type,
            }
            if await self._has_reference(asset.id):
                job.finished_at = now
                job.outcome = "REFERENCE_CONFLICT"
                logger.error("media.cleanup.reference_conflict", extra=context)
                return
            encrypted_id = asset.encrypted_object_public_id
            job.attempts += 1
            try:
                if asset.encryption_status is MediaEncryptionStatus.ENCRYPTED:
                    assert encrypted_id is not None
                    await self._gateway.delete_asset(
                        public_id=encrypted_id,
                        resource_type="raw",
                        delivery_type=asset.access_mode,
                    )
                await self._gateway.delete_asset(
                    public_id=asset.cloudinary_public_id,
                    resource_type=asset.resource_type,
                    delivery_type=asset.access_mode,
                    inspect_encrypted_manifest=False,
                )
            except MediaProviderUnavailableError:
                job.outcome = "PROVIDER_UNAVAILABLE"
                if job.attempts >= MAX_ATTEMPTS:
                    job.finished_at = now
                else:
                    job.next_attempt_at = now + timedelta(minutes=2**job.attempts)
                logger.warning(
                    "media.cleanup.provider_unavailable",
                    extra={
                        **context,
                        "attempt_no": job.attempts,
                        "error_code": job.outcome,
                        "outcome": "failed" if job.finished_at else "retry",
                    },
                )
                return
            job.finished_at = now
            job.outcome = "DELETED"
            logger.info(
                "media.cleanup.deleted",
                extra={
                    **context,
                    "attempt_no": job.attempts,
                    "outcome": "provider_confirmed",
                    "duration_ms": int(
                        (now - job.enqueued_at.replace(tzinfo=UTC)).total_seconds()
                        * 1000
                    ),
                },
            )
