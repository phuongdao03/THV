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
