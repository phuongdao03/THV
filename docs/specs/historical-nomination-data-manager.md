# DataManager legacy records, public content, and certificates

## Unified nomination archive: implementation brief (2026-11-17)

User supplied the MASTER TASK P0 brief expanding this feature into long-term
CURRENT and LEGACY record management. Publication is a projection, not storage.
Do not push, merge, deploy, migrate production, change payments, or send chain
transactions during this task.

### Verified architecture and gaps

- CURRENT records: `Dossier`, `DossierVersion.snapshot_json`,
  `DossierEvidence.dossier_version_id`, and `DossierStatusHistory` already retain
  source data and submission snapshots. Applicant `/dossiers` APIs are scoped
  to owner/organization; they cannot serve as an unrestricted admin archive.
- Review assignments/reports and the admin review snapshot already exist.
  `ReviewReportDetails` and `EvidenceViewer` are reusable read surfaces.
- LEGACY records retain people, private media, award metadata, public drafts,
  content versions and audit events. Current list/detail services exclude
  archived records, and no historical restore action has been verified.
  Do not promise restoration in UI until implemented and tested.
- Certificates and their versions, archival scans, and publication revisions
  remain separate aggregates; preserve their original source relationships.
- Main gap: a unified admin discovery/detail surface and access to retained
  data outside the active intake queue. Do not infer lost files from missing UI.

### Ordered implementation and acceptance

1. Clarify source provenance labels with examples; keep stored enum/field names.
   Rename record edit action and move stop-processing into secondary actions.
   Never describe stopping work as saving data or as revoking publication.
2. Audit retained records, documents, review/decision snapshots, certificates,
   publication history, and existing read permissions before designing queries.
3. Build an admin archive list/detail using existing source identifiers and
   separate business/publication/archive statuses. Reuse existing viewers.
4. Expose versioned documents, supplements, reviews, decisions, certificates,
   publication revisions and history without mutation controls in read views.
   Show retrieval errors separately from empty metadata; never expose private
   delivery URLs without the existing media authorization checks.
5. Verify owner/reviewer/data-manager boundaries and preservation across
   publication/hiding, then desktop/mobile flows and screenshots.

### Boundaries and validation

The user initially approved SUPER_ADMIN-only read access across completed and
archived CURRENT/LEGACY records, plus navigation to the existing publication
editor for the exact work. On 2026-11-17 the user extended the read-only archive
scope to DATA_MANAGER, whose existing `historical.records.read` capability
authorizes access to the same archive sections and only media assets linked to
those retained records/certificates. DATA_MANAGER gains no archive mutation,
decision, issuance, or restore controls. Account-administration dossier lists
remain SUPER_ADMIN-only. No approval extends to schema changes or production
operations. See the linked handoff for implementation evidence and remaining
operational gaps.

Use current module ownership and DTO conventions; no duplicate source records
or copied files. Source: `backend/app/modules/`, frontend feature components and
App Router routes. Tests: backend centralized, frontend colocated, browser E2E.
Run root `npm test`, relevant `npm run lint`, `npm run typecheck`, and
`npm run test:e2e` with npm.cmd on Windows. Record blocked checks honestly.
New authorization behavior, decision/issuance changes, and schema migrations
need a separate concrete proposal and approval. Implement safe read-only UI
and compatible relationships first; the supplied brief authorizes that work.

## Staff account linking (2026-11-16, user-approved workflow)

- Internal staff enters old nominations, invites recipients to register, then
  explicitly selects the registered account and links it to the historical
  nominee/representative. The user clarified this replaces self-service claims.
- DATA_MANAGER and SUPER_ADMIN with `historical.records.manage` may look up an
  active account by exact email and explicitly confirm its UUID with a reason.
  Names and email matches never create links automatically.
- Reuse `HistoricalRelatedPerson.linked_user_id`; no migration. Lock the person
  and record when linking; an existing different account cannot be overwritten.
  Repeating the same link is idempotent. Reject unrelated person IDs, inactive
  accounts, and roles other than NOMINEE/REPRESENTATIVE. Audit the staff action.
- Registered recipients see only their linked record summary and award facts
  in `/dossiers`. Never expose source notes, contacts, private files, or other
  people's details. Existing management endpoints remain staff-only; linking
  grants no editing, publishing, staff role, or CURRENT dossier ownership.
- Implementation order: service/DTO and permission regression tests; staff
  lookup and confirmation UI; recipient list; focused and full quality gates.
- Checks: `npm test`, `npm run lint`, `npm run typecheck`, and
  `npm run test:e2e -- historical-data-manager-save.spec.ts` (use npm.cmd on Windows).

## Follow-up verification (2026-11-16)

- Source editing handles a 409 with a fresh GET and one retry of only locally
  changed fields. Concurrent edits to other fields survive. Identical already
  saved values count as success; overlapping edits or changed editability
  states preserve form input and stop without overwriting.
- Public draft readiness accepts non-empty title and summary, matching the
  publish input contract, and lists missing saved values by name.
- Historical activity uses human-readable Vietnamese action/field labels.
- Historical presentation reuses `DigitalCertificate`, matching the supplied
  `/verify/THV-2026-99C3A2EA159D` reference. Preserve issuer/date/recipient facts,
  label it as historical, and omit live QR/share/status claims. Issued PDFs are
  unchanged.

**Status:** Implemented; local verification complete.

**Role names:** The UI's Admin role is `SUPER_ADMIN` in the codebase.

## Objective

Give DATA_MANAGER two clearly separate jobs: complete old LEGACY nomination and
award records with submitter details and source documents, then prepare public
content in the shared publication editor. Both Admin and DATA_MANAGER can edit
public presentation for LEGACY and CURRENT works. DATA_MANAGER also edits
certificate content and manages archival certificate scans. Historical-record
completion and publication do not require an Admin review step; Admin retains
all other administration.

## Fixed account provisioning

- Provide one operator-run bootstrap for the fixed username `data_manager`.
- The operator supplies an account email because the existing user model
  requires it, and sets the password through a hidden prompt. Do not send
  verification or invitation email; store only an Argon2 password hash.
- Treat the operator's explicit provisioning as email verification for this
  internal account. Assign only `DATA_MANAGER`; do not promote an existing user.
- Refuse to overwrite an existing account or reserved username. Require an
  explicit confirmation token in staging and production.

## Verified current state

- Admin's `/admin/content` already renders `PublicWorkEditor`, including a work
  list, readiness checklist, desktop/mobile preview, media controls, and
  publication actions.
- The editor API is under `/api/v1/admin/public-works`. Work editing currently
  requires broad `public_content.manage`, which must not be granted to
  DATA_MANAGER because other admin services use it.
- The codebase already contains a LEGACY record workspace with source metadata,
  related people, private documents, award details/scans, and a separate public
  content draft. Its DataManager route was redirected and its source-data
  permissions were removed, leaving only the public-work editor visible.
- Digital `Certificate` records are tied to CURRENT dossiers and have versioned
  metadata, generated PDFs, and blockchain proof. Admin can edit pre-issue
  content and request a reasoned correction version after issuance.
- The current digital certificate PDF renderer prints the blockchain network and
  transaction-hash prefix. Those technical details should move to the web
  verification view, not appear on the certificate document.

## Domain decisions

- **Source record:** An old LEGACY nomination with its provenance, submitter,
  supporting documents, related people, historical awards, and an active dossier
  type. DATA_MANAGER and Admin can create and update these records and attach
  private evidence. Completion does not require submission or review.
  DATA_MANAGER cannot import spreadsheets or edit CURRENT dossier source data.
- **Public work:** The public-facing page linked to exactly one source record.
  Its title, URL, descriptions, display author, category, tags, and public
  presentation media are editorial fields, not source-record fields.
- **Digital certificate:** A system-issued certificate tied to a CURRENT
  dossier. Its metadata versions and any blockchain proof remain immutable and
  verifiable. Any post-issue correction creates a new version with a reason; it
  does not overwrite a previously issued version. DATA_MANAGER can edit and
  submit a correction proposal; Admin approves and anchors it.
- **Archival certificate:** A distinct public-work archive record for an
  existing physical or scanned certificate. It has archival metadata and one or
  more scanned image pages, but no blockchain status, proof, or generated PDF
  requirement.
- **Certificate document content:** Human-readable archival facts such as the
  work/subject, award, issuer, certificate number, and issue date. Blockchain
  network, transaction hash, contract, and confirmation data belong on the web
  verification page only.
- **Public content draft:** A saved editorial revision that remains private
  until an explicit publish action succeeds.
- **Delete:** DATA_MANAGER can hide or archive a public work or archival
  certificate. These actions are recoverable and never delete a source record,
  original scan, digital certificate version, or audit history.

## Permission matrix

| Capability                                                                         | Admin (`SUPER_ADMIN`) | DATA_MANAGER |
| ---------------------------------------------------------------------------------- | --------------------: | -----------: |
| Create/edit/preview/publish public works from LEGACY and CURRENT sources           |                   Yes |          Yes |
| Create/edit archival certificate metadata and scanned pages                        |                   Yes |          Yes |
| Preview, publish, hide, or archive an archival certificate                         |                   Yes |          Yes |
| Restore archived public work or scan record                                        |                   Yes |           No |
| Edit pre-issue digital certificate content                                         |                   Yes |          Yes |
| Edit and submit a correction proposal for an issued digital certificate            |                   Yes |          Yes |
| Approve and anchor a corrected certificate version                                 |                   Yes |           No |
| Issue, reissue, revoke, or manage blockchain proof                                 |                   Yes |           No |
| Create/edit LEGACY nomination records, submitter, evidence, and historical awards  |                   Yes |          Yes |
| Publish/hide historical public content without source-review status gating         |                   Yes |          Yes |
| Submit legacy records for review                                                   |                    No |           No |
| Edit CURRENT dossier source data, payments, or digital certificate state           |                   Yes |           No |
| Bulk import historical records                                                     |                   Yes |           No |
| Manage categories, tags, posts, pages, banners, scheduling, and featured placement |                   Yes |           No |
| Permanently purge source or certificate history                                    |   Admin workflow only |           No |

DATA_MANAGER receives the narrow source-data capabilities
`historical.records.read`, `historical.records.manage`,
`historical.documents.manage`, plus `public_content.works.manage`,
`certificate_content.edit`, and `certificate_archives.manage`. Do not grant
`historical.records.submit`, `historical.import.manage`, review capabilities,
`historical.records.publish`, or broad `public_content.manage`; client-side
button visibility is not an authorization control.

## Certificate archive behavior

- Attach an archival certificate to an existing `PublicWork`, so the same
  archival viewer works for either a LEGACY or CURRENT work without changing the
  source record or digital `Certificate` aggregate.
- The archive form captures a display title/award name and may capture the
  printed certificate number, recipient, issuer, award class, issue date/year,
  and a short public note. Historical facts may be unknown; leave them blank or
  mark them unknown rather than inventing values.
- Upload one or more scan pages as JPEG, PNG, or WebP. A PDF is not required and
  the system does not generate a PDF from the scans. Staff can order pages, add
  captions, preview them, and replace a page through a new audited change.
- Uploads enter the existing inspected media flow. Keep originals private;
  publish only safe derivatives after a rights/privacy review. Require the
  operator to confirm the scan may be shown publicly. If a scan contains
  unrelated personal identifiers, use a redacted public copy.
- Publishing makes the metadata and safe page derivatives visible on the related
  public-work page. Label it **Bằng xác lập lưu trữ · bản scan** and state that
  this archival item has no blockchain verification. Do not invent an official
  certificate number, ACTIVE status, verification URL, or chain transaction for
  it.
- The public viewer supports page navigation, zoom, and accessible image
  descriptions. Expose only published archive records and public derivatives;
  never return private upload URLs or source media metadata.

## Digital certificate document behavior

- Keep the existing digital `Certificate`, `CertificateVersion`, and issuance
  flow separate from archival scans. Do not weaken chain/version constraints to
  make an old scan fit the digital model.
- Digital certificate content is limited to human-readable archival facts.
  Remove network and transaction-hash text from newly rendered PDFs. A QR may
  link to the website verification page with a neutral “Tra cứu trên website”
  label; all chain details remain on that web page.
- Continue to show proof status, network, transaction, confirmations, and
  explorer links in the web verification view for digital certificates.
- Existing issued PDF/version files remain immutable. A correction uses the
  version workflow and must not silently rewrite an issued PDF or its metadata.
  DATA_MANAGER can edit and submit a reasoned correction proposal; the current
  active version stays in effect until Admin approves and the new version is
  anchored. Admin can edit, approve, and anchor. Apply the revised PDF template
  to new issuance and corrected versions.
- Both roles can edit pre-issue digital certificate content and archive scan
  records. DATA_MANAGER cannot confirm issuance, approve/anchor corrections,
  reissue, revoke, or change blockchain proof state.

## User experience

- DATA_MANAGER has four work areas: **Hồ sơ lịch sử**, **Nội dung công bố**,
  **Bằng số**, and **Bằng lưu trữ**. The historical-record area lists and
  creates old nominations; each record includes source facts, **Người gửi /
  người đề cử**, private files, historical award metadata/scans, and edit
  history. The manager can save these records directly without an Admin review
  step.
- Open the workspace on the historical-record overview. Put the old-record
  intake action and its three steps first; each other work area starts with a
  short explanation of its purpose and next actions.
- Keep **Nội dung công bố** as the separate, publication-ready editor and
  preview. Admin and DATA_MANAGER can publish an active LEGACY record once its
  public content and media meet publication requirements. Private source
  evidence never becomes public automatically.
- **Bằng số** remains separate from physical historical awards. **Bằng lưu trữ**
  is the public scan archive; source-document/award scans remain private unless
  explicitly reviewed and published through the archive workflow.
- Reuse Admin's `PublicWorkEditor` and `PublicWorkPresentation` preview for work
  content. Show only controls allowed by the role.
- The public-work editor keeps three areas: searchable work list; main editor
  with public fields, read-only source summary, media, and preview; readiness
  and allowed actions. Identify source type as LEGACY or CURRENT.
- **Thêm tác phẩm** selects an eligible existing source with no public work. The
  backend resolves and validates the source; source-less public works are not
  supported by the current domain.
- Work edits save into an unpublished revision. On an already published work,
  changes remain private until the operator previews and explicitly publishes
  the new revision. Show the current live version beside the pending draft.
- The certificate archive list shows related work, archive title, printed number
  when present, page count, visibility, and last update. **Thêm bằng lưu trữ**
  selects a public work, enters metadata, uploads/orders pages, and previews the
  exact public viewer before publishing.
- Separate **Bằng số** and **Bằng lưu trữ** views. Both roles can edit the
  human-readable certificate content. DATA_MANAGER's issued-certificate changes
  remain proposals until Admin approves and anchors the next version. Admin also
  retains issuance, reissue, revocation, and version approval.
- CURRENT publication still requires the existing publishable dossier state and
  active certificate. LEGACY publication requires an active record, complete
  public content, and eligible public media; verification status does not gate
  publication. Archive certificate publication does not issue or verify a
  digital certificate.
- Publish requires confirmation and a passing checklist. Hide removes an item
  from public discovery; archive is recoverable. Admin alone restores archived
  items and manages digital certificate corrections.
- Show **Xóa bản nháp** only for unpublished `DRAFT` public works. Deletion
  soft-deletes the public presentation record, records the actor/version in the
  audit log, and invalidates public caches. It does not delete the source
  nomination, submitter, evidence files, certificate, or scan archive. Published
  and other non-draft works continue to use hide/archive transitions.
- Responsive layout collapses lists and side checklists into accessible sections
  on narrow screens; keep upload, page ordering, and previews usable from 320px
  upward.

## Application and API design

- Keep `PublicWork` and the digital `Certificate` model unchanged in meaning.
  Add a distinct archival-certificate aggregate linked to `PublicWork`, with
  ordered scan-page relations and draft/published/archive state.
- Add narrow `certificate_archives.manage` and `certificate_content.edit`
  capabilities. Admin retains current `public_content.manage`; DATA_MANAGER gets
  only the work-content and certificate-content/archive capabilities. Keep
  issuance, correction approval/anchoring, and revocation checks Admin-only.
- Reuse the common public-work editor, publication, audit, slug-history, and
  cache-invalidation services. Each operation checks the narrow capability on
  the server. CMS, taxonomy writes, schedule, suspension, featured placement,
  source edits, and digital certificate services remain Admin-only.
- Add typed, paginated archive list/create/update endpoints, publish/hide/
  archive transitions, and a public-work detail response field for published
  archive summaries/pages. Allow both roles to update pre-issue certificate
  drafts. Split issued-certificate correction proposal from Admin approval/
  anchoring so DATA_MANAGER cannot activate a new chain version. Use optimistic
  version checks and standard 403, 404, 409, and validation responses.
- Archive upload endpoints validate file signature, size, page count, media
  status, and ownership. Public derivatives are generated only after the private
  source passes inspection and the archive record is published.
- Add one saved work-content draft per work with base work version, editor, and
  timestamps. Publish validates source readiness and draft version, applies the
  content atomically, records actor/time, preserves old slugs, and invalidates
  public caches.
- Keep historical source draft rows and issued certificate versions. Map saved
  LEGACY public drafts into the unified work-draft flow without deleting their
  original data. Do not repurpose `Certificate.pdf_media_id` for scan images.
- Allow DATA_MANAGER access to historical record read/edit and document
  upload/link operations only. Remove the obsolete record-submission permission
  and keep spreadsheet import unavailable to DATA_MANAGER. Reuse the existing
  `HistoricalDataManagerWorkspace` and detail forms instead of creating a second
  source-record API.
- The PDF renderer gets a human-readable certificate projection that excludes
  blockchain fields. Chain metadata remains in the signed/versioned metadata and
  web verification response, not the printed PDF.

## Approval-gated implementation plan

1. Confirm role boundaries, DATA_MANAGER's digital-certificate edit and
   correction-proposal scope, and the meaning of archive/delete in this
   proposal.
2. Add focused authorization and domain tests for Admin, DATA_MANAGER, pre-issue
   edits, correction proposals/approval, archive scans, and source isolation.
3. Add additive permission and archive-certificate migrations. Preserve all
   existing role assignments, historical drafts, scans, and digital versions.
4. Implement the archival-certificate aggregate, inspected image-page upload,
   public derivative, versioned metadata, audit trail, and public viewer.
5. Unify public-work draft, preview, and publish behavior; preserve source
   eligibility rules and migrate old LEGACY drafts safely.
6. Reuse the Admin work editor for DATA_MANAGER. Add certificate content and
   archive editors to both roles with role-specific controls; leave digital
   issuance and correction approval/anchoring Admin-only.
7. Remove network and transaction details from newly rendered certificate PDFs
   while keeping verification details on the website. Preserve existing issued
   PDF history.
8. Verify direct API denials, role UI flows, public scan privacy, digital
   certificate version integrity, and responsive behavior.

## Source-workspace correction

1. Restore the LEGACY record list/detail route inside DATA_MANAGER's workspace
   and add a distinct **Hồ sơ lịch sử** tab ahead of publication.
2. Give DATA_MANAGER source read/create/edit and evidence-document capabilities;
   do not require record submission or Admin review. Keep imports and CURRENT
   dossier source data outside this role.
3. Make the nominator/contact and historical award/document sections explicit in
   the UI. Keep scanned source evidence private; public content stays in the
   separate preview/publish workspace.
4. Update role/migration and UI coverage for the new boundary, then preview the
   DataManager page.

## Record-entry UX follow-up

- Capture nomination time in one field. Accept either a year or an exact
  `dd/mm/yyyy` date and map them to the existing `nominationYear` and
  `nominatedAt` API fields; do not add month-only precision or change the
  schema.
- Preserve unfinished form values when moving between record sections. Keep a
  visible save action on each editable section and retain the existing explicit
  save-before-publish boundary.
- Link an old award recipient to a person already recorded on that nomination.
  When no person is available, explain where to add one and let the operator
  move there without discarding award fields.
- Explain that creating a historical record stores private source data. To
  publish, the operator prepares and saves a separate public-content draft,
  reviews it, then explicitly publishes it.
- Use colors defined by the current theme in both light and dark mode. Avoid
  undefined CSS custom properties for buttons, selected tabs, errors, and
  section backgrounds.

### Follow-up implementation plan

1. Extend the existing date field and add focused tests for year-only and exact
   dates.
2. Preserve visited record sections, clarify award-person linking, and show the
   private-record-to-publication steps.
3. Correct broken theme-token use in the data-manager record flow and verify
   focused frontend tests, lint, typecheck, and browser appearance.

## Acceptance criteria

- DATA_MANAGER can create/edit/preview/publish/hide/archive public works from
  both source types and manage archival certificate metadata and scan pages.
- DATA_MANAGER can create/edit old LEGACY nomination records, choose from all
  active dossier types, enter submitter/nominator and contact details, attach
  supporting documents and old award metadata/scans, and save without review.
- Admin and DATA_MANAGER can edit, preview, publish, and hide public content for
  an active historical record. Readiness depends on public content, category,
  and selected public media, not a verification status.
- DATA_MANAGER lands on a clear historical-record intake overview and receives
  task guidance on all four work areas. Admin and DATA_MANAGER can delete only
  unpublished public-work drafts; source records and their evidence remain.
- A scan-only archive can be published without a PDF, blockchain transaction,
  synthetic certificate number, or ACTIVE digital status.
- Public visitors can open the published archive viewer and distinguish a
  historical scan from a digitally verifiable certificate.
- DATA_MANAGER can edit pre-issue digital certificate content and submit a
  reasoned correction proposal. It cannot approve/anchor a correction, issue,
  reissue, revoke, or alter proof state.
- DATA_MANAGER cannot submit records for review, import historical spreadsheets,
  edit CURRENT dossier source data, manage CMS/taxonomy, or issue/approve
  certificates through UI or API.
- Admin retains full public-work, archive-certificate, and digital-certificate
  management. Issued digital corrections remain versioned and reasoned.
- New digital certificate PDFs contain archival facts and a website lookup link,
  but no blockchain network/transaction details. The website retains technical
  verification information.
- Private scans remain private until reviewed; only approved public derivatives
  are exposed. Audit attribution, optimistic concurrency, source readiness, and
  cache invalidation remain enforced.
- No existing scan, historical draft, issued PDF, or certificate version is
  silently overwritten or deleted.
- Shared views support keyboard navigation and responsive layouts at 320px,
  768px, 1024px, and 1440px.

## Assumptions to confirm

- DATA_MANAGER can edit digital certificate content; post-issue changes remain
  pending until Admin approves and anchors a new version. Issuance/reissue/
  revocation stay Admin-only.
- “Thêm tác phẩm” creates public content from an existing LEGACY or CURRENT
  source; source-less public work is not introduced.
- Draft deletion hides only the unpublished public presentation through
  `deleted_at`; source facts and evidence remain stored. Published works are
  hidden or archived through their existing state transitions. A scan may be
  publicly displayed only after rights/privacy review; redacted scans can be
  used when needed.
- Old LEGACY nomination records may be created with incomplete historical facts.
  Unknown provenance stays blank; the record can be completed and published
  without an Admin review gate once its public-facing fields and media are
  ready.
