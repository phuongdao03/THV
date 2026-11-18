"""Report or purge aged Cloudinary resources with no application references.

Run from ``backend/``. Dry-run is the default; see ``--help`` before applying.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import sys
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

import httpx
from sqlalchemy import bindparam, text
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine, create_async_engine
from sqlalchemy.pool import NullPool

from app.modules.media.gateway import CloudinaryMediaGateway
from app.scripts.cloudinary_read_only_audit import (
    _DELIVERY_TYPES,
    _PART_SUFFIX,
    _RESOURCE_TYPES,
    _TRACKED_SQL,
    _config,
    _page,
)

_MEDIA_REFERENCES_SQL = text(
    """
    SELECT source_namespace.nspname AS schema_name,
           source_table.relname AS table_name,
           source_column.attname AS column_name
    FROM pg_constraint AS foreign_key
    JOIN pg_class AS source_table
      ON source_table.oid = foreign_key.conrelid
    JOIN pg_namespace AS source_namespace
      ON source_namespace.oid = source_table.relnamespace
    JOIN pg_attribute AS source_column
      ON source_column.attrelid = foreign_key.conrelid
     AND source_column.attnum = foreign_key.conkey[1]
    JOIN pg_attribute AS target_column
      ON target_column.attrelid = foreign_key.confrelid
     AND target_column.attnum = foreign_key.confkey[1]
    WHERE foreign_key.contype = 'f'
      AND foreign_key.confrelid = 'public.media_assets'::regclass
      AND array_length(foreign_key.conkey, 1) = 1
      AND array_length(foreign_key.confkey, 1) = 1
      AND target_column.attname = 'id'
    """
)


@dataclass(frozen=True, slots=True)
class MediaReference:
    schema_name: str
    table_name: str
    column_name: str


@dataclass(frozen=True, slots=True)
class CloudinaryCandidate:
    resource_type: str
    delivery_type: str
    public_id: str
    provider_asset_id: str | None
    bytes: int


@dataclass(frozen=True, slots=True)
class MediaAssetCandidate:
    id: UUID
    cloudinary_public_id: str
    encrypted_object_public_id: str | None
    resource_type: str
    access_mode: str
    provider_asset_id: str | None
    bytes: int


def _fingerprint(*parts: str) -> str:
    return hashlib.sha256(": ".join(parts).encode()).hexdigest()[:16]


def _prefixes(environment: str) -> tuple[str, ...]:
    return (
        f"cns/{environment}/",
        f"ip-certificate/{environment}/certificates/",
    )


def _under_prefix(public_id: str, prefixes: tuple[str, ...]) -> bool:
    return any(public_id.startswith(prefix) for prefix in prefixes)


async def _reference_columns(connection: AsyncConnection) -> tuple[MediaReference, ...]:
    rows = (await connection.execute(_MEDIA_REFERENCES_SQL)).all()
    return tuple(MediaReference(str(row[0]), str(row[1]), str(row[2])) for row in rows)


async def _referenced_media_ids(
    connection: AsyncConnection,
    media_ids: tuple[UUID, ...],
    references: tuple[MediaReference, ...],
) -> set[UUID]:
    if not media_ids:
        return set()

    preparer = connection.dialect.identifier_preparer
    referenced: set[UUID] = set()
    for reference in references:
        table_name = ".".join(
            preparer.quote(name)
            for name in (reference.schema_name, reference.table_name)
        )
        column_name = preparer.quote(reference.column_name)
        statement = text(
            f"SELECT DISTINCT {column_name} FROM {table_name} "
            f"WHERE {column_name} IN :media_ids"
        ).bindparams(bindparam("media_ids", expanding=True))
        rows = await connection.execute(statement, {"media_ids": media_ids})
        referenced.update(row[0] for row in rows if row[0] is not None)
    return referenced


def _unreferenced_filter(
    connection: AsyncConnection,
    references: tuple[MediaReference, ...],
) -> str:
    preparer = connection.dialect.identifier_preparer
    media_id = ".".join(
        preparer.quote(name) for name in ("public", "media_assets", "id")
    )
    checks = []
    for reference in references:
        table_name = ".".join(
            preparer.quote(name)
            for name in (reference.schema_name, reference.table_name)
        )
        column_name = preparer.quote(reference.column_name)
        checks.append(
            f"NOT EXISTS (SELECT 1 FROM {table_name} "
            f"WHERE {column_name} = {media_id})"
        )
    return " AND ".join(checks) if checks else "TRUE"


async def _media_asset_candidates(
    connection: AsyncConnection,
    *,
    prefixes: tuple[str, ...],
    cutoff: datetime,
    limit: int,
    references: tuple[MediaReference, ...],
) -> tuple[tuple[MediaAssetCandidate, ...], bool]:
    unreferenced_filter = _unreferenced_filter(connection, references)
    result = await connection.execute(
        text(
            f"""
            SELECT id, cloudinary_public_id, encrypted_object_public_id,
                   resource_type, access_mode, provider_asset_id, bytes
            FROM public.media_assets
            WHERE storage_provider = 'CLOUDINARY'
              AND status IN ('ACTIVE', 'PENDING', 'DELETED')
              AND coalesce(deleted_at, updated_at, created_at) <= :cutoff
              AND {unreferenced_filter}
              AND (
                left(cloudinary_public_id, char_length(:prefix_one)) = :prefix_one
                OR left(cloudinary_public_id, char_length(:prefix_two)) = :prefix_two
              )
              AND (
                encrypted_object_public_id IS NULL
                OR left(encrypted_object_public_id, char_length(:prefix_one))
                    = :prefix_one
                OR left(encrypted_object_public_id, char_length(:prefix_two))
                    = :prefix_two
              )
            ORDER BY coalesce(deleted_at, updated_at, created_at), id
            LIMIT :limit
            """
        ),
        {
            "cutoff": cutoff,
            "prefix_one": prefixes[0],
            "prefix_two": prefixes[1],
            "limit": limit + 1,
        },
    )
    rows = tuple(result.all())
    candidates = tuple(
        MediaAssetCandidate(
            id=row[0],
            cloudinary_public_id=str(row[1]),
            encrypted_object_public_id=(str(row[2]) if row[2] else None),
            resource_type=str(row[3]),
            access_mode=str(row[4]),
            provider_asset_id=(str(row[5]) if row[5] else None),
            bytes=int(row[6]),
        )
        for row in rows[:limit]
    )
    return candidates, len(rows) > limit


async def _scan_cloudinary(
    config: dict[str, str],
    *,
    environment: str,
    tracked: set[tuple[str, str, str]],
    min_age_hours: int,
    max_requests: int,
    limit: int,
) -> tuple[tuple[CloudinaryCandidate, ...], bool, int, int, bool]:
    prefixes = _prefixes(environment)
    now = datetime.now(UTC)
    request_count = [0]
    seen: set[tuple[str, str, str]] = set()
    candidates: list[CloudinaryCandidate] = []
    bytes_seen = 0
    inventory_complete = True
    scopes_scanned = 0
    candidates_truncated = False

    async with httpx.AsyncClient(timeout=20.0) as client:
        for prefix in prefixes:
            for resource_type in _RESOURCE_TYPES:
                for delivery_type in _DELIVERY_TYPES:
                    rows, scope_complete = await _page(
                        client,
                        config=config,
                        resource_type=resource_type,
                        delivery_type=delivery_type,
                        prefix=prefix,
                        request_count=request_count,
                        request_limit=max_requests,
                    )
                    scopes_scanned += 1
                    inventory_complete &= scope_complete
                    for row in rows:
                        public_id = row.get("public_id")
                        created_at = row.get("created_at")
                        if not isinstance(public_id, str) or not isinstance(
                            created_at, str
                        ):
                            inventory_complete = False
                            continue
                        key = (resource_type, delivery_type, public_id)
                        if key in seen:
                            continue
                        seen.add(key)
                        size = row.get("bytes", 0)
                        size = size if isinstance(size, int) and size >= 0 else 0
                        bytes_seen += size
                        try:
                            created = datetime.fromisoformat(
                                created_at.replace("Z", "+00:00")
                            )
                        except ValueError:
                            inventory_complete = False
                            continue
                        if created.tzinfo is None:
                            created = created.replace(tzinfo=UTC)
                        base_id = _PART_SUFFIX.sub("", public_id)
                        registered = key in tracked or (
                            base_id != public_id
                            and (resource_type, delivery_type, base_id) in tracked
                        )
                        if registered or created > now - timedelta(hours=min_age_hours):
                            continue
                        if len(candidates) >= limit:
                            candidates_truncated = True
                            continue
                        provider_asset_id = row.get("asset_id")
                        if not isinstance(provider_asset_id, str):
                            inventory_complete = False
                            continue
                        candidates.append(
                            CloudinaryCandidate(
                                resource_type=resource_type,
                                delivery_type=delivery_type,
                                public_id=public_id,
                                provider_asset_id=(
                                    provider_asset_id
                                    if isinstance(provider_asset_id, str)
                                    else None
                                ),
                                bytes=size,
                            )
                        )
                    if request_count[0] >= max_requests:
                        break
                if request_count[0] >= max_requests:
                    break
            if request_count[0] >= max_requests:
                break

    expected_scopes = len(prefixes) * len(_RESOURCE_TYPES) * len(_DELIVERY_TYPES)
    return (
        tuple(candidates),
        inventory_complete and scopes_scanned == expected_scopes,
        request_count[0],
        bytes_seen,
        candidates_truncated,
    )


async def _apply(
    engine: AsyncEngine,
    config: dict[str, str],
    *,
    database_candidates: tuple[MediaAssetCandidate, ...],
    cloudinary_candidates: tuple[CloudinaryCandidate, ...],
    references: tuple[MediaReference, ...],
    prefixes: tuple[str, ...],
    cutoff: datetime,
) -> dict[str, Any]:
    gateway = CloudinaryMediaGateway(
        cloud_name=config["CLOUDINARY_CLOUD_NAME"],
        api_key=config["CLOUDINARY_API_KEY"],
        api_secret=config["CLOUDINARY_API_SECRET"],
    )
    removed_rows = 0
    removed_cloudinary = 0
    skipped_referenced = 0
    skipped_tracked_cloudinary = 0
    failures = 0
    try:
        async with engine.connect() as connection:
            current_rows = await connection.execute(_TRACKED_SQL)
            current_tracked = {
                (str(row[0]), str(row[1]), str(row[2]))
                for row in current_rows.all()
                if row[0] and row[1] and row[2]
            }

        for candidate in database_candidates:
            try:
                async with engine.begin() as connection:
                    row = (
                        await connection.execute(
                            text(
                                """
                                SELECT cloudinary_public_id,
                                       encrypted_object_public_id, resource_type,
                                       access_mode, provider_asset_id
                                FROM public.media_assets
                                WHERE id = :media_id
                                  AND storage_provider = 'CLOUDINARY'
                                  AND status IN ('ACTIVE', 'PENDING', 'DELETED')
                                  AND coalesce(deleted_at, updated_at, created_at)
                                      <= :cutoff
                                FOR UPDATE
                                """
                            ),
                            {"media_id": candidate.id, "cutoff": cutoff},
                        )
                    ).first()
                    if row is None:
                        continue
                    referenced_ids = await _referenced_media_ids(
                        connection, (candidate.id,), references
                    )
                    if candidate.id in referenced_ids:
                        skipped_referenced += 1
                        continue
                    public_id = str(row[1] or row[0])
                    resource_type = "raw" if row[1] else str(row[2])
                    access_mode = str(row[3])
                    provider_asset_id = str(row[4]) if row[4] else None
                    if (
                        not _under_prefix(public_id, prefixes)
                        or resource_type not in _RESOURCE_TYPES
                        or access_mode not in _DELIVERY_TYPES
                    ):
                        failures += 1
                        continue
                    if provider_asset_id is None and access_mode == "authenticated":
                        metadata = await gateway.find_asset_metadata(
                            public_id=public_id,
                            resource_type=resource_type,
                        )
                        provider_asset_id = (
                            metadata.provider_asset_id if metadata is not None else None
                        )
                    await gateway.delete_asset(
                        public_id=public_id,
                        resource_type=resource_type,
                        provider_asset_id=provider_asset_id,
                        purge_backups=True,
                        delivery_type=access_mode,
                    )
                    result = await connection.execute(
                        text(
                            "DELETE FROM public.media_assets "
                            "WHERE id = :media_id AND storage_provider = 'CLOUDINARY'"
                        ),
                        {"media_id": candidate.id},
                    )
                    if result.rowcount != 1:
                        raise RuntimeError("media registry row changed during purge")
                removed_rows += 1
                removed_cloudinary += 1
            except Exception:
                failures += 1

        for cloudinary_candidate in cloudinary_candidates:
            key = (
                cloudinary_candidate.resource_type,
                cloudinary_candidate.delivery_type,
                cloudinary_candidate.public_id,
            )
            base_id = _PART_SUFFIX.sub("", cloudinary_candidate.public_id)
            if key in current_tracked or (
                base_id != cloudinary_candidate.public_id
                and (
                    cloudinary_candidate.resource_type,
                    cloudinary_candidate.delivery_type,
                    base_id,
                )
                in current_tracked
            ):
                skipped_tracked_cloudinary += 1
                continue
            try:
                await gateway.delete_asset(
                    public_id=cloudinary_candidate.public_id,
                    resource_type=cloudinary_candidate.resource_type,
                    provider_asset_id=cloudinary_candidate.provider_asset_id,
                    purge_backups=True,
                    delivery_type=cloudinary_candidate.delivery_type,
                )
                removed_cloudinary += 1
            except Exception:
                failures += 1
    finally:
        await gateway.close()
    return {
        "cloudinary_resources_removed": removed_cloudinary,
        "media_asset_rows_removed_from_neon": removed_rows,
        "skipped_due_to_new_reference": skipped_referenced,
        "skipped_due_to_new_registry_entry": skipped_tracked_cloudinary,
        "failed_candidates": failures,
    }


async def _run(args: argparse.Namespace) -> dict[str, Any]:
    if not 48 <= args.min_age_hours <= 720:
        raise RuntimeError("--min-age-hours must be between 48 and 720.")
    if not 1 <= args.max_requests <= 100:
        raise RuntimeError("--max-requests must be between 1 and 100.")
    if not 1 <= args.limit <= 1000:
        raise RuntimeError("--limit must be between 1 and 1000.")

    config = _config()
    environment = config.get("APP_ENV", "local").strip().lower()
    if environment not in {"local", "staging", "production"}:
        raise RuntimeError("APP_ENV must be local, staging, or production.")
    if args.apply and args.confirm_environment != environment:
        raise RuntimeError("Apply requires --confirm-environment matching APP_ENV.")
    if args.apply and args.confirm_purge != "PURGE-ORPHANED-MEDIA":
        raise RuntimeError("Apply requires --confirm-purge PURGE-ORPHANED-MEDIA.")
    if (
        args.apply
        and environment == "production"
        and args.confirm_production != "PRODUCTION"
    ):
        raise RuntimeError("Production apply requires --confirm-production PRODUCTION.")

    prefixes = _prefixes(environment)
    cutoff = datetime.now(UTC) - timedelta(hours=args.min_age_hours)
    engine = create_async_engine(config["DATABASE_URL"], poolclass=NullPool)
    try:
        async with engine.connect() as connection:
            await connection.execute(text("SET TRANSACTION READ ONLY"))
            tracked_rows = await connection.execute(_TRACKED_SQL)
            tracked = {
                (str(row[0]), str(row[1]), str(row[2]))
                for row in tracked_rows.all()
                if row[0] and row[1] and row[2]
            }
            references = await _reference_columns(connection)
            (
                database_candidates,
                database_candidates_truncated,
            ) = await _media_asset_candidates(
                connection,
                prefixes=prefixes,
                cutoff=cutoff,
                limit=args.limit,
                references=references,
            )

        (
            cloudinary_candidates,
            inventory_complete,
            request_count,
            bytes_seen,
            cloudinary_candidates_truncated,
        ) = (
            await _scan_cloudinary(
                config,
                environment=environment,
                tracked=tracked,
                min_age_hours=args.min_age_hours,
                max_requests=args.max_requests,
                limit=args.limit,
            )
        )
        report: dict[str, Any] = {
            "environment": environment,
            "dry_run": not args.apply,
            "minimum_age_hours": args.min_age_hours,
            "inventory_complete": inventory_complete,
            "cloudinary_admin_requests": request_count,
            "cloudinary_bytes_in_scanned_prefixes": bytes_seen,
            "database_media_candidates": len(database_candidates),
            "database_candidates_truncated": database_candidates_truncated,
            "database_media_candidate_bytes": sum(
                candidate.bytes for candidate in database_candidates
            ),
            "unregistered_cloudinary_candidates": len(cloudinary_candidates),
            "cloudinary_candidates_truncated": cloudinary_candidates_truncated,
            "unregistered_cloudinary_candidate_bytes": sum(
                candidate.bytes for candidate in cloudinary_candidates
            ),
            "media_candidate_fingerprints": [
                _fingerprint(candidate.resource_type, candidate.cloudinary_public_id)
                for candidate in database_candidates
            ],
            "cloudinary_candidate_fingerprints": [
                _fingerprint(
                    candidate.resource_type,
                    candidate.delivery_type,
                    candidate.public_id,
                )
                for candidate in cloudinary_candidates
            ],
            "automatic_deletion": False,
        }
        if not args.apply:
            return report
        if not inventory_complete:
            raise RuntimeError("Cloudinary inventory is incomplete; apply is blocked.")

        applied = await _apply(
            engine,
            config,
            database_candidates=database_candidates,
            cloudinary_candidates=cloudinary_candidates,
            references=references,
            prefixes=prefixes,
            cutoff=cutoff,
        )
        report["automatic_deletion"] = True
        report["apply"] = applied
        return report
    finally:
        await engine.dispose()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--min-age-hours", type=int, default=48)
    parser.add_argument("--max-requests", type=int, default=100)
    parser.add_argument("--limit", type=int, default=100)
    parser.add_argument(
        "--apply",
        action="store_true",
        help=(
            "Delete eligible orphan resources; without this flag, "
            "only report candidates."
        ),
    )
    parser.add_argument(
        "--confirm-environment",
        help="Required with --apply; must exactly match APP_ENV.",
    )
    parser.add_argument(
        "--confirm-purge",
        help="Required with --apply: PURGE-ORPHANED-MEDIA.",
    )
    parser.add_argument(
        "--confirm-production",
        help="Required for production apply: PRODUCTION.",
    )
    args = parser.parse_args()
    try:
        report = asyncio.run(_run(args))
    except Exception as exc:
        print(
            json.dumps(
                {
                    "error_type": type(exc).__name__,
                    "detail": str(exc) if isinstance(exc, RuntimeError) else None,
                    "automatic_deletion": False,
                }
            ),
            file=sys.stderr,
        )
        return 1
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
