# Handoff: DataManager source records, public content, and certificates

Implemented from the
[approved specification](../specs/historical-nomination-data-manager.md). MFA
remains excluded. No production database migration, deployment, or commit was
made.

## 2026-11-17: DATA_MANAGER archive access

The user extended read-only access to the unified CURRENT/LEGACY archive to
DATA_MANAGER. Both archive routes and navigation now accept this role, and the
backend checks the existing `historical.records.read` capability. The role can
read all archive sections and request signed delivery only for media referenced
by dossier evidence, historical nominations, issued certificate versions, or
certificate scan pages. No mutation, decision, issuance, or restore access was
added. The account-administration dossier list remains SUPER_ADMIN-only; no
migration was needed because the DATA_MANAGER role already has the capability.

Validation for this access change: all 3 archive backend tests, the media
delivery integration test, and all 26 focused route/navigation tests pass.
Linked-media delivery is covered for
dossier files, issued certificate PDFs and scan pages; unlinked assets remain
denied.

## 2026-11-17: archive inventory and retention safeguards

Expanded the existing SUPER_ADMIN archive so the unified CURRENT/LEGACY index
shows owner, category, recorded date, source version, document/image/video
counts, and certificate reference. Added owner and recorded-date filters plus
date/version and file-version details on the list and dossier views. The
SUPER_ADMIN account workspace now lists that account's dossiers with status,
date, and file summaries. Council vote outcomes and actors display readable
labels instead of raw enum values or user IDs.

Archive sections now include uploader/version context for files and council
vote reasons alongside final decisions and status transitions. List reads are
audited without recording search text or owner IDs. Generic media deletion
refuses assets referenced by dossier evidence, historical records, issued or
scanned certificates, or public work. Link creation locks assets before
validation to serialize against deletion. No schema or migration change.

This extends the archive API/UI already documented below; it does not assert a
production object-store inventory or repair existing missing/orphaned objects.
No production data or storage was inspected.

Validation for this update: 22 focused backend tests passed; the expanded
archive test also passed on its isolated rerun. Root structure tests (10), the
full frontend suite (259 files / 1,150 tests before the final label assertion),
and the final focused archive/account UI tests (2 files / 7 tests) passed.
Repository lint, backend Ruff, and direct frontend TypeScript checks passed.
The broader backend run (excluding the local `openpyxl`-dependent import parser)
reported 1,414 passed and 3 skipped, with one archive assertion failing only in
that run; its focused reruns passed, so the broader result is not recorded as a
clean pass. Desktop Chromium E2E passed the archive/account flow at 375, 390,
768, 1024, and 1440 px and saved ignored evidence under `frontend/test-results/`.
Mobile E2E could not complete because local Next startup stopped at its security
vulnerability notice. No migration, commit, deployment, or production operation.

## 2026-11-17: unified archive audit and safe terminology changes

The MASTER TASK P0 brief supersedes the previous push instruction: do not push,
merge, or deploy this work. Existing uncommitted UX evidence images are unrelated
and must be preserved. At that stage, the unified archive work described below
was still in progress.

### Delivered safe UI slice

- Source provenance now asks "Thông tin được lấy từ đâu?", explains internal
  use and optional unknown facts, and supplies examples for provider/reference
  and notes. Existing field/enum values remain compatible. The date remains
  when information was recorded in the source; it is not a certificate date.
- Header distinguishes the nominated person/organization from the record title.
  "Chỉnh sửa hồ sơ" opens editing; existing records use "Lưu thay đổi".
- Stop-processing is a secondary action under "Thao tác khác", with explicit
  reason confirmation. It is not saving edits or hiding published content.
  No restoration promise: the audit did not find an existing historical restore
  endpoint, and existing historical queries exclude archived records.

### Verified code architecture (not a live production inventory)

| Domain | Existing source and retained relationships | Archive gap / required work |
| --- | --- | --- |
| New nominations | `dossiers/models.py`: Dossier, stable ID, owner/category/type; DossierVersion includes snapshot, canonical hash, submitter and timestamp | Owner API is not an admin archive; do not reuse it by bypassing ownership |
| Submitted files | DossierEvidence references dossier and submitted version; MediaAsset stores metadata/hash/status; `dossiers/service.py:_require_editable_evidence` blocks edits to versioned evidence | Admin needs version selection and a document inventory beyond active intake |
| Supplements | `supplements/models.py`: request points to dossier/requested version; responses belong to request | Join each response and its attachments to the actual submission/version; never invent a missing link |
| Reviews | ReviewAssignment points to dossier/version/reviewer; Review retains criteria, evidence references, recommendation and submission time | Admin review API restricts `ADMIN_REVIEW_DOSSIER_STATUSES`; it is not post-decision discovery |
| Work allocation | WorkAllocation points to dossier/version; WorkScope and members retain scoped assignments; generic tasks also have attachments/activity | Aggregate existing relationships; do not equate task comments with official review reports |
| Decisions | CouncilCase points to dossier and decision; CouncilVote records vote/reason; DossierStatusHistory records transitions | Confirm canonical final-decision source and immutable document/snapshot rules before changing decision contracts |
| Issued certificates | `blockchain/models.py`: Certificate → dossier; CertificateVersion → dossier version, metadata hash, predecessor/reason/status; existing certificate API exposes versions | Integrate this read view into the source workspace, never reissue from APPROVED automatically |
| PDF retention | `certificates/storage.py` uploads authenticated PDFs with overwrite=false and records version/bytes/SHA-256 | Existing file durability and accessibility need an authorized object-store inventory, not assumptions from UI |
| Historical awards | HistoricalAward → nomination/recipient; HistoricalMediaLink → nomination/award/MediaAsset; certificate_archives is a separate scanned-public-work aggregate | Display source correctly; no invented live proof, official number, signature or seal |
| Publication | PublicWork references CURRENT dossier or historical nomination; PublicWorkMedia references original assets and safe derivatives; slug history and audit events remain | Current and historical revision mechanisms differ; do not assert all editorial snapshots are complete without verification |
| Historical revisions | HistoricalNominationContentVersion stores draft/publish snapshots independently of private source facts | Restore/read archived source requires an explicit approved read contract |
| Access and downloads | Existing owner/org scope, assigned review scope, admin policies, and signed media delivery remain authoritative; EvidenceViewer supports preview/error paths | Metadata-present/object-missing must be a delivery error, not an empty file list; do not expose raw authenticated storage URLs |

No production DB or object store was inspected. No backfill, deletion, invented
historical event, new database table, wallet operation, or blockchain transaction
has been performed.

### Approved and implemented archive slice

User explicitly approved a read-only SUPER_ADMIN archive spanning
all CURRENT/LEGACY lifecycle states, including rejected/published/archived.
Existing admin intake reads explicitly filter completed states and owner reads
explicitly reject unrelated users. Broadening those reads is a privacy boundary.

Implemented additive contracts under `/api/v1`: `GET /admin/nomination-records` with paginated
source/query/category/year/business-status/publication/archive filters;
`GET /admin/nomination-records/{source}/{id}` for source facts;
separate paginated version/document/review/decision/certificate/publication/
history resources. Keep CURRENT and LEGACY identifiers and status domains
separate; use explicit DTOs and existing signed-delivery authorization.

Implemented `/admin/nomination-records` and source-specific detail
routes with overview/documents/reviews/decisions/certificates/publication/history
navigation and a mobile section picker. Reuses EvidenceViewer and
ReviewReportDetails, with independent loading/error/empty states. Existing URLs
are preserved. A second explicit user approval authorizes opening the existing
`/admin/content?workId=...` editor from publication metadata, with a return link;
navigation does not save or publish anything.

Archive projections retain source/editorial versions separately, exact review
snapshots, supplement responses, final transitions/council decisions, issued
certificate lineage, scanned revisions and audit history. Missing asset metadata
does not remove the inventory entry. At initial release, SUPER_ADMIN received
signed-delivery access for issued PDFs and scan pages; the later DATA_MANAGER
scope above adds this only for media linked to archived dossier or certificate
records. Owner version history also reuses the existing owner-scoped file viewer
without a new permission.

Validation this revision: 8 focused backend tests pass. Root structure tests
(10) and the complete frontend suite (259 files / 1,149 tests) pass; the final
archive viewer adjustment also passes its 4 focused frontend tests. Frontend/
backend typecheck, frontend ESLint, repository Prettier, backend Ruff check/
format and diff whitespace checks pass. Desktop archive E2E passed in the
preceding run. Mobile rendered list/documents, passed the overflow assertion
and produced screenshots, but its process hung later and was stopped; full
mobile completion is unverified. Local E2E screenshots live under ignored
`frontend/test-results/`; existing tracked UX evidence was not changed.
Certificate metadata hashes remain visible as references but are not used as
PDF byte checksums in EvidenceViewer.

Remaining scope: no production object-store inventory, no orphan/backfill repair,
no new source restore workflow, no schema or decision/issuance changes. Existing
supplement responses have no direct file association; the archive exposes the
recorded request/version and response, without inventing attachment ownership.
Full backend collection is blocked by missing local `openpyxl`; no passing full
backend result is claimed. No commit,
push, merge, production migration or deployment was performed for this slice.

Tests must cover allowed DATA_MANAGER read-only archive access, forbidden
PUBLIC/USER/REVIEWER reads, post-decision reads, old versions and supplements, missing storage objects,
published/hidden preservation, certificate lineage, and desktop/mobile flows.
Archive/restore CURRENT state, final decision immutability changes, issuance,
and any backfill/migration need separate proposals if the audit finds gaps.

## 2026-11-16: HTTP 500 fixes for people and repeated draft saves

- Reproduced `POST /{recordId}/people` failing a foreign key: the pending party
  role could be inserted before the new related person. Flush the person before
  adding its role, within the same transaction so failures still roll back both.
- Reproduced repeated `PUT /{recordId}/public-content-draft` failing response
  serialization: the database-generated `updated_at` expired on UPDATE and
  Pydantic attempted implicit async I/O (`MissingGreenlet`). Explicitly refresh
  the saved draft before returning it. A successful database write could
  previously be followed by a 500 while rendering its response.
- Added two regressions with foreign keys enabled and DTO serialization after
  each write. Both failed before the fix. Added an HTTP test using actual
  service/database transactions and separate request sessions for adding a
  person, saving/updating the draft, then publishing with a category and cover.
- No API/schema, authorization, publication policy, or migration changes.
- Validation: 18 focused backend tests passed, including the real HTTP
  save/update/publish flow; all 1,144 frontend tests and 10 root tests passed.
  Backend lint, format check, and typecheck passed. The complete backend suite
  remains subject to the local missing `openpyxl` dependency noted below.

## 2026-11-16: save recovery, progress, account linking, certificate preview

- User clarified the account flow: staff enters old nominations, invites the
  recipient to register, then explicitly links that account. No self-service
  ownership claims or automatic name/email matching.
- `GET /historical-nominations/linkable-account?email=...` returns only an
  active account's ID/email for an exact lookup, restricted to source managers.
  Staff confirms in **Người gửi & liên quan**, under a nominee/representative,
  with a reason. `PUT /{recordId}/people/{personId}/account` locks and validates
  the record/person/account, audits the link, permits an identical retry, and
  refuses a different existing account. Reuses `linked_user_id`; no migration.
- `GET /historical-nominations/mine` returns paginated linked record/award facts
  for the session user, rendered in **Hồ sơ của tôi → Đề cử cũ đã liên kết**.
  Private notes, contacts, source files, and management permissions are excluded.
  Awards for a different named recipient are excluded. Unassigned historical
  awards on the linked nomination remain visible.
- Save recovery merges only local field changes after a 409; unrelated remote
  edits survive. An already persisted identical edit succeeds without another
  write. Overlapping changes retain the form and show the conflict.
- Completed steps have a green background, checkmark, and visible completion
  label. Empty optional people/media/award steps remain unfinished.
- Historical previews reuse the public `DigitalCertificate` reference layout
  with recorded issuer/date and an archival label, without a live QR, share
  action, or blockchain verification claim. Existing issued PDFs are unchanged.
- Verification: 1,144 frontend tests and 14 historical service/API/schema tests
  passed. Full lint, frontend/backend typechecks, and backend format checks
  passed. Desktop/mobile save/conflict/reload, explicit account linking, and
  certificate rendering (including a loaded logo) passed browser checks.
- Full backend suite remains unverified: the initial run lacked `openpyxl`;
  after installing it into temporary storage and isolating test temp paths,
  the full run reached 15% but was stopped after extended waiting. No source
  dependency or environment file was changed. Focused checks used the regular
  sandbox and passed. Unrelated pre-existing image changes were preserved.
- No commit, push, deployment, or production data change.

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
- The DATA_MANAGER correction selector uses
  `GET /api/v1/certificates/correction-candidates`, guarded by
  `certificate_content.edit`; it returns active certificates with only the
  identifier, number, work/dossier labels, version, blockchain status, and a
  transaction-presence flag. The full Admin listing remains separately guarded.
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

## Historical save, dates, and award presentation

- Fixed the historical-record PATCH boundary: Pydantic aliases were serialized
  as camelCase while the service consumes snake_case, so submitted fields could
  be ignored/rejected. The route now dumps canonical names and forwards the
  optimistic `expected_updated_at` version. Record and award edits reject stale
  versions; the UI updates cached details and shows a save confirmation only
  after the API responds.
- Added a Vietnamese `dd/mm/yyyy` keyboard-and-calendar field. It serializes a
  calendar date as `YYYY-MM-DD`, without a timezone conversion; year-only data
  stays in the separate year field and unknown dates stay empty. Blank legacy
  record/award names receive explicit placeholders so incomplete archive data
  can still be saved.
- Historical award metadata can be edited in its source record. Existing
  attached files can be linked to an award without copying the original asset.
  Its digital presentation shows only recorded metadata and linked scans and is
  labeled as historical digitization, not a new or blockchain-verified
  certificate.
- The requested YEAR/MONTH/DAY/UNKNOWN precision model is not implemented:
  adding month precision requires a schema/API change, and automatic approval
  rejected the additive database migration. Do not invent a day to represent a
  month; retain year-only and exact-date behavior until that migration is
  approved.
- Verification for this follow-up: focused backend tests (4 passed), date-field
  unit tests (3 passed), DATA_MANAGER save E2E (desktop and mobile passed),
  frontend typecheck, repository format check, Ruff, and `git diff --check`. E2E
  uses the local mock API; it does not write to production. The saved-state
  screenshot is a local ignored artifact under `frontend/test-results/`.
- No production migration, commit, push, or deployment was made.

## DATA_MANAGER intake and navigation follow-up

- The historical records area now opens directly at a compact, searchable list.
  Filters cover status, year, and dossier type; cards show media, document, and
  award counts. Public content editing remains on its own route with existing
  public scan and certificate utilities.
- The historical records area includes a searchable **Bằng xác lập cũ** view.
  It links back to the source record; attached source scans stay private and
  separate from the public scan archive.
- New source records receive unique `THV-LS-{year}-{uuid}` codes. Existing
  `HIST-` codes remain searchable aliases. Create requests accept an idempotency
  key, so retries return the same source record.
- Draft source records can be soft-deleted only while unpublished and
  unassociated with a published work. Deletion checks the record version and
  records an audit event. Evidence and awards are retained.
- Detail pages warn before leaving unsaved edits, including browser Back.
  Mobile uses a section selector instead of overflowing detail tabs. Historical
  award entry is collapsed until requested; its digitized presentation stays
  distinct from the original attached scan.
- Migration 0176 is additive and was exercised against a temporary SQLite
  database only. It has not been applied to production. Month-level date
  precision remains unavailable pending migration approval; unknown,
  year-only, and exact dates are preserved without inventing a day.
- Verification: 11 focused backend tests, 25 focused frontend tests, direct
  TypeScript, targeted ESLint/Prettier, Ruff check/format, and DATA_MANAGER save
  E2E (4 desktop/mobile tests) passed. Next type generation still hits Windows
  `EPERM` writing `.next/types/routes.d.ts`; direct
  `tsc --noEmit --incremental false` passed. No commit, push, or deployment.

## Record-entry clarity and theme follow-up

- Record entry now uses one `Thời gian đề cử` control for a year-only value or
  an exact `dd/mm/yyyy` date. The UI maps to the existing `nominationYear` and
  `nominatedAt` fields; no API or database change. Date parsing and calendar
  navigation handle years below 100 without JavaScript's `Date.UTC` 1900 offset;
  calendar navigation and selection stay within years 1–2200.
- Detail sections stay mounted after first visit, so unsaved form values remain
  when switching tabs. Each section still has an explicit save action.
- Award recipient options come from `Người gửi & liên quan`. The form explains
  this and links to add a person when the list is empty.
- The detail view now explains that the source record remains private and links
  to `Nội dung công khai`, where a draft is saved and reviewed before the
  explicit publish action makes it public.
- Filled missing dashboard theme tokens for foreground, muted surface, and
  danger colors in light and dark mode; replaced invalid primary utilities in
  the historical nomination workspaces.
- Verification: repository and frontend tests passed (10 root tests; 254
  frontend files / 1,128 tests), frontend lint and typecheck passed, and the
  root format check plus Ruff format check passed. Backend tests could not
  collect because the local Python environment lacks `openpyxl`. The E2E run
  rendered the save/reload flow, then hung in the separate browser Back
  confirmation case and was stopped; full E2E status remains unverified.
- No commit, push, deployment, API change, or database migration.

## Publication covers

- The historical draft editor and public work editor support automatic,
  selected and uploaded covers. The existing nullable cover IDs persist
  automatic mode, and upload provenance distinguishes dedicated covers.
- Catalog cards, detail and share images use the explicit public cover
  when available. The branded fallback uses public title and category,
  with the existing emblem and drum artwork in the UI.
- AUTO creates no media asset. The share route generates a PNG at request
  time or requests the selected derivative through the public media API.
  The historical cover endpoint checks active publication, attachment
  consent and image type before reading content.
- The implementation uses the existing schema. Review the publication
  cover section in the specification for the acceptance matrix.
- Backend changes are in `historical_nominations/service.py`,
  `media/service.py`, and the public module's cover, catalog, delivery and
  publication policies. Frontend changes are in the two publication
  editors, the public card and detail, and the work share-image route.
  The API adds upload provenance to the authorized historical media list.
