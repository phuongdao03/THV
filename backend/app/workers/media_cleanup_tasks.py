import asyncio
import logging
from argparse import Namespace

from app.core.config import get_settings
from app.db.session import get_session_factory
from app.modules.media.cleanup import MediaCleanupService
from app.modules.media.gateway import CloudinaryMediaGateway
from app.scripts.cloudinary_read_only_audit import _audit
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


async def _process_cleanup() -> int:
    settings = get_settings()
    if not settings.media_draft_cleanup_enabled:
        return 0
    secret = settings.cloudinary_api_secret
    if (
        secret is None
        or not settings.cloudinary_cloud_name
        or not settings.cloudinary_api_key
    ):
        logger.error("media.cleanup.configuration_missing")
        return 0
    gateway = CloudinaryMediaGateway(
        cloud_name=settings.cloudinary_cloud_name,
        api_key=settings.cloudinary_api_key,
        api_secret=secret.get_secret_value(),
        timeout_seconds=settings.media_provider_timeout_seconds,
    )
    try:
        async with get_session_factory()() as session:
            cleanup = MediaCleanupService(
                session, gateway, environment=settings.app_env
            )
            for processed in range(20):
                if not await cleanup.process_one():
                    return processed
            return 20
    finally:
        await gateway.close()


@celery_app.task(ignore_result=True)  # type: ignore[untyped-decorator]
def process_draft_media_cleanup() -> int:
    return asyncio.run(_process_cleanup())


async def _reconcile_storage() -> None:
    settings = get_settings()
    if not settings.media_storage_reconciliation_enabled:
        return
    database_url = settings.database_url
    secret = settings.cloudinary_api_secret
    if database_url is None or secret is None:
        logger.error("media.reconciliation.configuration_missing")
        return
    report = await _audit(
        Namespace(
            min_age_hours=48,
            max_requests=30,
            candidate_file=None,
            database_only=False,
        ),
        config={
            "APP_ENV": settings.app_env,
            "DATABASE_URL": database_url.get_secret_value(),
            "CLOUDINARY_CLOUD_NAME": settings.cloudinary_cloud_name,
            "CLOUDINARY_API_KEY": settings.cloudinary_api_key,
            "CLOUDINARY_API_SECRET": secret.get_secret_value(),
        },
    )
    cloudinary = report["cloudinary"]
    logger.info(
        "media.reconciliation.completed",
        extra={
            "outcome": "complete" if report["inventory_complete"] else "incomplete",
            "storage_metrics": {
                "inventory_complete": report["inventory_complete"],
                "tracked_asset_keys": report["database"]["tracked_asset_keys"],
                "stale_pending": report["database"]["stale_pending_media_candidates"],
                "cleanup_jobs": report["database"]["cleanup_jobs"],
                "assets_seen": cloudinary["assets_seen"],
                "candidate_count": cloudinary["unregistered_candidates_seen"],
                "candidate_bytes": cloudinary["unregistered_candidate_bytes_seen"],
                "active_keys_missing": cloudinary["active_keys_missing"],
            },
        },
    )


@celery_app.task(ignore_result=True)  # type: ignore[untyped-decorator]
def reconcile_media_storage() -> None:
    asyncio.run(_reconcile_storage())
