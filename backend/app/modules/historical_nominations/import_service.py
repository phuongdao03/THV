import hashlib
import json
from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.audit.service import AuditService
from app.modules.auth.authorization import AuthorizationPolicy, PolicyRequirement
from app.modules.auth.session_service import AuthPrincipal
from app.modules.historical_nominations.errors import (
    HistoricalNominationForbiddenError,
    HistoricalNominationNotFoundError,
    HistoricalNominationStateError,
    HistoricalNominationValidationError,
)
from app.modules.historical_nominations.import_parser import parse_import_file
from app.modules.historical_nominations.models import (
    HistoricalArchiveStatus,
    HistoricalImportBatch,
    HistoricalImportBatchStatus,
    HistoricalImportRow,
    HistoricalImportRowStatus,
    HistoricalNomination,
    HistoricalNominationStatus,
    HistoricalSourceKind,
    HistoricalSubjectType,
)
from app.modules.historical_nominations.service import IMPORT_FIELDS

MAX_PREVIEW_SAMPLE = 10


def _require_manager(principal: AuthPrincipal) -> None:
    if "SUPER_ADMIN" not in principal.roles:
        raise HistoricalNominationForbiddenError()
    AuthorizationPolicy.require_capability(
        principal,
        PolicyRequirement(permission="historical.import.manage"),
        HistoricalNominationForbiddenError,
    )


def _string_mapping(value: object) -> dict[str, str]:
    if not isinstance(value, dict):
        return {}
    return {
        key: item
        for key, item in value.items()
        if isinstance(key, str) and isinstance(item, str)
    }


def source_payload(row: HistoricalImportRow) -> dict[str, str]:
    return _string_mapping(row.payload_json.get("_source"))


def mapped_payload(row: HistoricalImportRow) -> dict[str, str]:
    mapped = row.payload_json.get("_mapped")
    return _string_mapping(mapped if isinstance(mapped, dict) else row.payload_json)


def _dedup_key(payload: dict[str, str]) -> tuple[str, str, str]:
    return (
        payload.get("subject_name", "").strip().casefold(),
        payload.get("title", "").strip().casefold(),
        payload.get("nomination_year", "").strip(),
    )


class HistoricalImportService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._audit = AuditService(session)

    async def upload(
        self,
        principal: AuthPrincipal,
        *,
        filename: str,
        content: bytes,
        idempotency_key: str,
    ) -> tuple[HistoricalImportBatch, list[HistoricalImportRow], list[str]]:
        _require_manager(principal)
        if not idempotency_key.strip() or len(idempotency_key) > 160:
            raise HistoricalNominationValidationError("Idempotency-Key is invalid.")
        parsed = parse_import_file(filename=filename, content=content)
        digest = hashlib.sha256(content).hexdigest()
        async with self._session.begin():
            batch = await self._session.scalar(
                select(HistoricalImportBatch).where(
                    HistoricalImportBatch.idempotency_key == idempotency_key
                )
            )
            if batch is not None:
                if batch.source_file_sha256 != digest:
                    raise HistoricalNominationStateError(
                        "Idempotency-Key was already used for a different file."
                    )
                rows = list(
                    await self._session.scalars(
                        select(HistoricalImportRow)
                        .where(HistoricalImportRow.batch_id == batch.id)
                        .order_by(HistoricalImportRow.source_row_number)
                    )
                )
                headers = list(source_payload(rows[0])) if rows else []
                return batch, rows, headers

            batch = HistoricalImportBatch(
                id=uuid4(),
                idempotency_key=idempotency_key,
                source_filename=filename[:255],
                source_file_sha256=digest,
                column_mapping_json={},
                status=HistoricalImportBatchStatus.RECEIVED,
                created_by_user_id=principal.user_id,
            )
            self._session.add(batch)
            created_rows: list[HistoricalImportRow] = []
            for index, cells in enumerate(parsed.rows, start=2):
                source = dict(zip(parsed.headers, cells, strict=True))
                payload_hash = hashlib.sha256(
                    json.dumps(source, ensure_ascii=False, sort_keys=True).encode(
                        "utf-8"
                    )
                ).hexdigest()
                row = HistoricalImportRow(
                    id=uuid4(),
                    batch_id=batch.id,
                    source_row_number=index,
                    idempotency_key=f"{index}:{payload_hash}",
                    payload_sha256=payload_hash,
                    payload_json={"_source": source},
                    status=HistoricalImportRowStatus.PENDING,
                )
                created_rows.append(row)
            self._session.add_all(created_rows)
            self._audit.record(
                actor_user_id=principal.user_id,
                action="historical_import.uploaded",
                resource_type="historical_import_batch",
                resource_id=str(batch.id),
                after={"rows": len(created_rows), "sha256": digest},
            )
            await self._session.flush()
            return batch, created_rows, list(parsed.headers)

    async def preview(
        self,
        principal: AuthPrincipal,
        batch_id: UUID,
        mapping: dict[str, str],
    ) -> tuple[HistoricalImportBatch, list[HistoricalImportRow], list[str]]:
        _require_manager(principal)
        if (
            not mapping
            or not set(mapping).issubset(IMPORT_FIELDS)
            or len(set(mapping.values())) != len(mapping)
            or not {"subject_name", "title"}.issubset(mapping)
        ):
            raise HistoricalNominationValidationError(
                "Map unique source columns to subject_name and title."
            )
        async with self._session.begin():
            batch = await self._session.get(HistoricalImportBatch, batch_id)
            if batch is None or batch.created_by_user_id != principal.user_id:
                raise HistoricalNominationNotFoundError()
            if batch.status not in {
                HistoricalImportBatchStatus.RECEIVED,
                HistoricalImportBatchStatus.VALIDATED,
            }:
                raise HistoricalNominationStateError(
                    "Import batch cannot be previewed now."
                )
            rows = list(
                await self._session.scalars(
                    select(HistoricalImportRow)
                    .where(HistoricalImportRow.batch_id == batch.id)
                    .order_by(HistoricalImportRow.source_row_number)
                )
            )
            if not rows:
                raise HistoricalNominationStateError("Import batch has no rows.")
            source = source_payload(rows[0])
            headers = list(source)
            if any(header not in headers for header in mapping.values()):
                raise HistoricalNominationValidationError(
                    "Mapping references a column that is not in the uploaded file."
                )
            existing_keys: set[tuple[str, str, str]] = set()
            subject_keys = sorted(
                {
                    source_payload(row)
                    .get(mapping["subject_name"], "")
                    .strip()
                    .casefold()
                    for row in rows
                }
            )
            if subject_keys:
                for start in range(0, len(subject_keys), 300):
                    chunk = subject_keys[start : start + 300]
                    existing = await self._session.scalars(
                        select(
                            HistoricalNomination.subject_name,
                            HistoricalNomination.title,
                            HistoricalNomination.nomination_year,
                        ).where(
                            HistoricalNomination.archive_status
                            == HistoricalArchiveStatus.ACTIVE,
                            func.lower(HistoricalNomination.subject_name).in_(chunk),
                        )
                    )
                    existing_keys.update(
                        (
                            name.strip().casefold(),
                            title.strip().casefold(),
                            str(year or ""),
                        )
                        for name, title, year in existing
                    )
            batch.column_mapping_json = mapping
            seen: set[tuple[str, str, str]] = set()
            for row in rows:
                raw = source_payload(row)
                mapped = {
                    target: str(raw.get(header, "")).strip()
                    for target, header in mapping.items()
                }
                error: str | None = None
                if not mapped.get("subject_name"):
                    error = "missing_subject_name"
                elif not mapped.get("title"):
                    error = "missing_title"
                elif mapped.get("nomination_year"):
                    try:
                        year = int(mapped["nomination_year"])
                        if year < 1 or year > 2200:
                            raise ValueError
                        mapped["nomination_year"] = str(year)
                    except ValueError:
                        error = "invalid_nomination_year"
                if not error and mapped.get("source_kind"):
                    try:
                        mapped["source_kind"] = HistoricalSourceKind(
                            mapped["source_kind"].upper()
                        ).value
                    except ValueError:
                        error = "invalid_source_kind"
                key = _dedup_key(mapped)
                if error:
                    row.status = HistoricalImportRowStatus.REJECTED
                    row.error_code = error
                elif key in existing_keys or key in seen:
                    row.status = HistoricalImportRowStatus.DUPLICATE
                    row.error_code = "exact_duplicate"
                else:
                    row.status = HistoricalImportRowStatus.VALID
                    row.error_code = None
                if error is None:
                    seen.add(key)
                row.payload_json = {"_source": raw, "_mapped": mapped}
            batch.status = HistoricalImportBatchStatus.VALIDATED
            await self._session.flush()
            return batch, rows, headers

    async def confirm(
        self,
        principal: AuthPrincipal,
        batch_id: UUID,
    ) -> tuple[int, int, int]:
        _require_manager(principal)
        async with self._session.begin():
            batch = await self._session.scalar(
                select(HistoricalImportBatch)
                .where(HistoricalImportBatch.id == batch_id)
                .with_for_update()
            )
            if batch is None or batch.created_by_user_id != principal.user_id:
                raise HistoricalNominationNotFoundError()
            if batch.status in {
                HistoricalImportBatchStatus.COMPLETED,
                HistoricalImportBatchStatus.COMPLETED_WITH_ERRORS,
            }:
                rows = list(
                    await self._session.scalars(
                        select(HistoricalImportRow).where(
                            HistoricalImportRow.batch_id == batch.id
                        )
                    )
                )
                return (
                    sum(
                        row.status is HistoricalImportRowStatus.IMPORTED for row in rows
                    ),
                    sum(
                        row.status is HistoricalImportRowStatus.REJECTED for row in rows
                    ),
                    sum(
                        row.status is HistoricalImportRowStatus.DUPLICATE
                        for row in rows
                    ),
                )
            if batch.status is not HistoricalImportBatchStatus.VALIDATED:
                raise HistoricalNominationStateError(
                    "Preview and validate the batch before import."
                )
            rows = list(
                await self._session.scalars(
                    select(HistoricalImportRow)
                    .where(HistoricalImportRow.batch_id == batch.id)
                    .order_by(HistoricalImportRow.source_row_number)
                    .with_for_update()
                )
            )
            imported_count = 0
            pending_imports: list[tuple[HistoricalImportRow, UUID]] = []
            for row in rows:
                if row.status is not HistoricalImportRowStatus.VALID:
                    continue
                payload = mapped_payload(row)
                try:
                    subject_type = HistoricalSubjectType(
                        payload.get("subject_type", "PERSON").upper()
                    )
                    source_kind = HistoricalSourceKind(
                        payload.get("source_kind", "OTHER").upper()
                    )
                    year_value = payload.get("nomination_year")
                    year = int(year_value) if year_value else None
                except ValueError:
                    row.status = HistoricalImportRowStatus.REJECTED
                    row.error_code = "invalid_enum_or_year"
                    continue
                record = HistoricalNomination(
                    id=uuid4(),
                    code=f"HIST-{uuid4().hex[:16].upper()}",
                    subject_type=subject_type,
                    subject_name=payload["subject_name"],
                    title=payload["title"],
                    summary=payload.get("summary") or None,
                    description=payload.get("description") or None,
                    nomination_year=year,
                    historical_result=payload.get("historical_result") or None,
                    source_kind=source_kind,
                    source_label=payload.get("source_label") or None,
                    source_reference=payload.get("source_reference") or None,
                    provenance_notes=payload.get("provenance_notes") or None,
                    created_by_user_id=principal.user_id,
                    verification_status=HistoricalNominationStatus.DRAFT,
                )
                self._session.add(record)
                pending_imports.append((row, record.id))
                imported_count += 1

            await self._session.flush()
            for row, nomination_id in pending_imports:
                row.status = HistoricalImportRowStatus.IMPORTED
                row.nomination_id = nomination_id
                row.error_code = None
            await self._session.flush()

            rejected = sum(
                row.status is HistoricalImportRowStatus.REJECTED for row in rows
            )
            duplicates = sum(
                row.status is HistoricalImportRowStatus.DUPLICATE for row in rows
            )
            batch.status = (
                HistoricalImportBatchStatus.COMPLETED_WITH_ERRORS
                if rejected or duplicates
                else HistoricalImportBatchStatus.COMPLETED
            )
            batch.completed_at = datetime.now(UTC)
            self._audit.record(
                actor_user_id=principal.user_id,
                action="historical_import.confirmed",
                resource_type="historical_import_batch",
                resource_id=str(batch.id),
                after={
                    "imported": imported_count,
                    "rejected": rejected,
                    "duplicates": duplicates,
                },
            )
            await self._session.flush()
            return imported_count, rejected, duplicates
