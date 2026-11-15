# Handoff: DataManager source records, public content, and certificates

Implemented from the
[approved specification](../specs/historical-nomination-data-manager.md). MFA
remains excluded. No production database migration, deployment, or commit was
made.

## Delivered

- **DATA_MANAGER** receives narrow source capabilities for legacy records and
  private evidence, plus **public_content.works.manage**,
  **certificate_content.edit**, and **certificate_archives.manage**. Migration
  0175 removes the obsolete source-submission permission; import, review, and
  broad CMS permissions remain unavailable.
- The /data-manager workspace has four distinct areas: **Hồ sơ lịch sử**, **Nội
  dung công bố**, **Bằng số**, and **Bằng lưu trữ**. The restored source detail
  route handles old nomination facts, submitter/contact details, supporting
  files, award metadata, and scans. DATA_MANAGER saves these records directly;
  no Admin review is required before publication.
- Publication-ready editing and preview remain in the separate public-work
  editor. Admin and DATA_MANAGER can edit and publish LEGACY and CURRENT work
  presentation without changing source facts. Historical record lists filter by
  publication status and the active dossier-type catalog.
- Admin and DATA_MANAGER reuse PublicWorkEditor for LEGACY and CURRENT public
  work. DATA_MANAGER may edit presentation content and media, preview, publish,
  hide, and archive. Historical public pages can be published directly from the
  source-record editor without verification-status gating. Admin retains
  category/tag, scheduling, suspension, featured placement, source-record, and
  restore controls.
- Both roles can edit pre-issue certificate content. Issued certificate edits
  submit a reasoned pending proposal; only Admin can approve and anchor it.
  Issuance and revocation remain Admin-only.
- Migration 0172 adds a distinct scan archive attached to public works. Scans
  upload privately through inspection, publish as safe derivatives, and can be
  hidden or recoverably archived. Admin alone restores an archived scan.
- Public work pages show published scan pages and archival metadata with an
  explicit label that the scan has no blockchain verification. Digital
  certificate PDFs no longer print blockchain network or transaction details;
  website verification remains the place for those details.
- Generic gallery removal and cover-crop operations reject archive-only scan
  relations so archive pages remain managed by the archive workflow.
- Migration 0174 links historical source records to the active dossier types, so
  the form and list filter show the configured type catalog. CMS categories
  remain separate.

## Verification

- Backend focused suite:
  `python -m pytest app/tests/test_certificate_archive_service.py app/tests/test_data_manager_role_migration.py app/tests/test_data_manager_auth.py app/tests/test_publication_historical_self_publish.py app/tests/test_certificate_version_service.py app/tests/test_public_work_editor.py app/tests/test_public_work_editor_api.py app/tests/test_public_media_service.py app/tests/test_certificate_generation.py`
  — 32 passed.
- Frontend focused Vitest suite (using `--configLoader runner`) — 55 passed
  across 7 files; direct TypeScript check
  (`npx tsc --noEmit --incremental false`), targeted ESLint, and Prettier check
  passed.
- Backend Ruff check and format check passed for affected modules/tests.
- Standard Next typegen and normal Vitest config setup hit Windows `EPERM` while
  writing `.next/types/routes.d.ts` and `node_modules/.vite-temp`; direct
  TypeScript and Vitest's `--configLoader runner` workaround passed.
- Alembic revisions are not applied to a production database. No commit or
  deployment was made.

## Source-workspace correction

- Restored `/data-manager/records/[recordId]` and made the historical records
  area the first data-entry view. Its list filters publication status; record
  details expose separate tabs for source facts, submitters, private documents,
  historical award metadata/scans, and record history. Managers save records
  without an Admin review stage.
- Kept publication preview and publish controls in **Nội dung công bố** and
  added direct preview/publish/hide controls to the historical record editor.
  The certificate archive tab is labeled **Bằng scan công khai** to distinguish
  public scans from private evidence attached to a historical source record.
- Added the historical activity endpoint to the local DataManager mock.
- Verification: 12 focused backend tests passed; the DataManager workspace
  Vitest suite passed; direct TypeScript, targeted ESLint, Prettier, and Ruff
  checks passed. The local browser preview was opened at the historical source
  record and its submitter, evidence, and award-scan tabs were inspected. No
  production database migration was applied.

## Latest requirement correction

- Historical data entry no longer asks DATA_MANAGER to submit records for Admin
  review. The old record-submission permission is removed in migration 0175.
- Record filters and badges describe publication visibility. Public content can
  be saved, previewed, published, and hidden directly when its content/media are
  ready.
- The historical record type selector reads the active dossier-type catalog;
  public CMS categories remain a separate field.
- Latest static checks: targeted ESLint, direct TypeScript
  (`--noEmit --incremental false`), and Ruff passed. Tests were not rerun for
  this correction.

## Fixed account provisioning

- Added `backend/app/scripts/bootstrap_data_manager.py` for a single account
  with the fixed `data_manager` username. An operator supplies the required
  account email and chooses a password in a hidden prompt; only its Argon2 hash
  is stored. No email is sent.
- The script grants only DATA_MANAGER, marks the operator-provisioned account
  active, and refuses duplicate email or username. Staging and production need
  `--confirm CREATE_DATA_MANAGER_ACCOUNT`.
- Updated `docs/runbooks/runtime-environment.md` with the command. Ruff check,
  Ruff format check, mypy on the script, and CLI help passed. Tests were not
  run.

## Workspace usability and draft deletion

- The DATA_MANAGER workspace now opens on **Hồ sơ lịch sử**. Its overview
  highlights the old-record intake action and the sequence for adding source
  facts, submitter/evidence, then public presentation. Every work area has a
  short purpose and next-step guide.
- Admin and DATA_MANAGER can delete only `DRAFT` public-work presentation rows.
  The operation uses optimistic version checks, soft deletion, audit logging,
  and public-cache invalidation. Source nominations, submitters, evidence,
  certificates, and archive scans remain intact.
- Focused frontend and backend editor/API tests were added.
- Verification: all frontend tests passed (1,114); focused backend editor/API
  tests passed (3); repository lint, typecheck, and format checks passed. Full
  `npm test` could not collect the backend suite because `openpyxl` is missing
  from the local Python environment. E2E finished with 122 passed, 9 skipped,
  and 2 unrelated failures: the mobile navigation click was intercepted by the
  Next.js dev portal, and the public portal test treated an image LCP warning as
  a console error.
