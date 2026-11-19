from app.modules.blockchain.models import CertificateStatus
from app.modules.dossiers.models import DossierStatus
from app.modules.historical_nominations.models import (
    HistoricalArchiveStatus,
)
from app.modules.public.catalog_repository import PublicWorkPublicationContext

PUBLISHABLE_DOSSIER_STATUSES = frozenset(
    {DossierStatus.CERTIFICATE_ISSUED, DossierStatus.PUBLISHED}
)
PUBLICATION_CHECK_CODES = (
    "historical_record_active",
    "dossier_not_publishable",
    "active_certificate_required",
    "title_required",
    "slug_required",
    "description_required",
    "category_inactive",
    "category_slug_required",
    "thumbnail_not_ready",
)


def publication_checklist(
    context: PublicWorkPublicationContext,
) -> tuple[str, ...]:
    work = context.work
    reasons: list[str] = []
    if work.historical_nomination_id is not None:
        record = context.historical_nomination
        if (
            record is None
            or record.archive_status is not HistoricalArchiveStatus.ACTIVE
        ):
            reasons.append("historical_record_active")
    else:
        if (
            context.dossier is None
            or context.dossier.status not in PUBLISHABLE_DOSSIER_STATUSES
        ):
            reasons.append("dossier_not_publishable")
        if (
            context.certificate is None
            or context.certificate.status is not CertificateStatus.ACTIVE
            or context.certificate.dossier_id != work.dossier_id
        ):
            reasons.append("active_certificate_required")
    if not work.title.strip():
        reasons.append("title_required")
    if not work.slug.strip():
        reasons.append("slug_required")
    if not work.short_description.strip():
        reasons.append("description_required")
    if not context.category.is_active:
        reasons.append("category_inactive")
    if not (context.category.slug or "").strip():
        reasons.append("category_slug_required")
    if (
        work.historical_nomination_id is None
        and work.thumbnail_media_id is not None
        and not context.has_ready_video
        and not context.has_ready_image
    ):
        reasons.append("thumbnail_not_ready")
    return tuple(reasons)
