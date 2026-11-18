# Nomination archive media cleanup

## Behavior

- The archive evidence file title is now the single click target for opening its
  signed preview. Image/video previews render in the existing preview area.
- `historical_nominations.archive_status = ARCHIVED` is recoverable retained
  history. The archive list filters out source rows with `deleted_at`; the
  screenshot's “Đã lưu trữ” items are archived, not deleted drafts.
- Added an operator tool that finds Cloudinary objects missing from the
  application registry and aged Cloudinary `media_assets` rows with no live
  database foreign-key references. It retains dossiers, archive/source data,
  audit rows, and all referenced media.

## Commands

From `backend/`, report candidates (read-only by default):

```powershell
python -m app.scripts.purge_orphaned_media
```

Apply requires explicit environment and destructive-action confirmation. For
production, also confirm the production target:

```powershell
python -m app.scripts.purge_orphaned_media --apply --confirm-environment production --confirm-purge PURGE-ORPHANED-MEDIA --confirm-production PRODUCTION
```

The tool requires a complete Cloudinary inventory before apply, limits each run
to 100 candidates by default, rechecks foreign-key references while holding a
row lock, deletes the Cloudinary object and its backups first, then removes the
unreferenced Neon media registry row. Increase `--limit` or repeat the command
when the report says candidates were truncated. It scopes all resources to the
configured `APP_ENV` prefixes and requires a 48-hour minimum age by default.

## Boundaries

- The command does not hard-delete archived nominations or dossiers, even when
  their media is still in Cloudinary. Those records and files remain referenced
  for history and audit. Permanent deletion of archived source records requires
  a separate retention decision.
- No production inventory or purge was run during implementation.
- PostgreSQL may reclaim physical table space later through normal vacuuming;
  deleting registry rows does not guarantee an immediate Neon storage reduction.

## Draft cleanup and document uploads

Migration `0177_media_cleanup_jobs` adds dossier scope and signature expiration
to the media registry. It also adds a durable queue for files removed from a
draft or detached from editable evidence. A draft deletion detaches only
unversioned evidence and queues it alongside uploads already bound to the draft.
Both happen in the same transaction as the dossier audit event.

The cleanup worker locks the job and media row and checks the database foreign
keys for remaining references. It waits for outstanding upload signatures and
in-progress inspection before taking ownership. It marks media unavailable
before contacting Cloudinary and records provider confirmation on the separate
job. Provider failures retry five times total with exponential backoff.
Configuration for the worker and reconciliation defaults to disabled.

- `MEDIA_DRAFT_CLEANUP_ENABLED` enables the worker and its one-minute schedule.
- `MEDIA_STORAGE_RECONCILIATION_ENABLED` enables the daily read-only scan. It
  assesses only the configured environment prefixes and uses a bounded request
  budget. Treat partial scans as incomplete.
- Run `python -m app.scripts.cloudinary_read_only_audit` from `backend/` for a
  redacted report with pending, failed, and provider-confirmed cleanup totals.
  Use `--database-only` to inspect the registry without Cloudinary requests.
- A complete scan can flag active registry keys missing in storage. Unregistered
  objects and stale pending sessions remain candidates for review. The temporary
  retention policy and cleanup of legacy candidates require separate approval.

Verify the migration in isolation. Apply it before rolling out the API or
enabling either schedule in the target environment. Stop the cleanup worker to
roll back execution while preserving queued records. Export or resolve
outstanding jobs before downgrading the migration because the downgrade drops
the queue. Provider deletion already acknowledged by Cloudinary requires an
approved restore procedure.

For DOCX, PDF, PPTX, and XLSX, the Cloudinary adapter accepts raw metadata
without an explicit format field by reading the extension in the provider public
ID. The existing completion checks still validate the exact identity and the
trusted inspection still validates the file contents before delivery.
