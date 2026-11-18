# Spec: Nomination Archive Media Cleanup

## Objective

Make dossier media easier to preview and provide an operator command to reclaim
Cloudinary objects and Neon media registry rows that are old and unreferenced.

## Behavior

- In the archive evidence viewer, selecting a document title fetches its signed
  URL and immediately shows supported image/video previews in the existing
  preview area. Other evidence workflows keep their explicit view action.
- `python -m app.scripts.purge_orphaned_media` is read-only by default. It
  reports Cloudinary objects absent from the application registry and old
  `media_assets` rows with no database foreign-key references.
- Candidates must be at least 48 hours old and under the current
  `cns/{APP_ENV}/` or `ip-certificate/{APP_ENV}/certificates/` namespace.
- `--apply` deletes the Cloudinary resource (including backups and encrypted
  parts where supported), then removes an unreferenced `media_assets` row.
  Before deleting a database row, it locks and rechecks all live foreign-key
  references. Incomplete Cloudinary inventory blocks apply.
- Apply requires `--confirm-environment <APP_ENV>`. Production also requires
  `--confirm-production PURGE-ORPHANED-MEDIA`.
- The command never deletes dossier/source rows, archive/audit history, or media
  still referenced by any foreign key. Archived dossiers therefore retain
  their evidence.

## Acceptance criteria

- Dry-run is the default and prints counts/bytes without credentials or personal
  identifiers.
- Apply only targets aged, unreferenced media and is idempotent if a provider
  object is already absent.
- Clicking an archive document title requires one action to show an image or
  video preview; the separate archive “view evidence” action is removed.

## Verification

- Frontend: `npm --prefix frontend run typecheck` and `npm --prefix frontend run lint`.
- Backend: `ruff check app` and `mypy app` from `backend/`.
- Do not run apply against production as part of implementation.

## Scope boundary

Rows marked archived in the screenshot are retained history, not deleted drafts.
Permanently deleting archived source records or their evidence requires a
separate retention decision.
