export type HistoricalSubjectType = "PERSON" | "ORGANIZATION";
export type HistoricalSourceKind =
  | "ARCHIVE"
  | "OFFICIAL_RECORD"
  | "ORGANIZATION_RECORD"
  | "PERSONAL_RECORD"
  | "OTHER";
export type HistoricalNominationStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "NEEDS_CORRECTION"
  | "VERIFIED"
  | "HELD"
  | "REJECTED";
export type HistoricalImportRowStatus =
  | "PENDING"
  | "VALID"
  | "IMPORTED"
  | "REJECTED"
  | "DUPLICATE";
export type HistoricalMediaKind =
  | "PHOTO"
  | "VIDEO"
  | "SCANNED_DOCUMENT"
  | "AWARD_SCAN"
  | "SUPPORTING_DOCUMENT"
  | "OTHER";
export type HistoricalRelatedPersonRole =
  | "NOMINEE"
  | "NOMINATOR"
  | "REPRESENTATIVE"
  | "CONTACT"
  | "WITNESS"
  | "OTHER";

export interface HistoricalNomination {
  id: string;
  code: string;
  subjectType: HistoricalSubjectType;
  subjectName: string | null;
  title: string;
  summary: string | null;
  description: string | null;
  dossierTypeId: string | null;
  categoryId: string | null;
  legacyCategoryLabel: string | null;
  nominationYear: number | null;
  nominatedAt: string | null;
  historicalResult: string | null;
  sourceKind: HistoricalSourceKind;
  sourceLabel: string | null;
  sourceReference: string | null;
  sourceRecordedAt: string | null;
  provenanceNotes: string | null;
  verificationStatus: HistoricalNominationStatus;
  archiveStatus: "ACTIVE" | "ARCHIVED";
  archiveReason: string | null;
  publicationStatus: string;
  missingFieldsJson: string[];
  submittedAt: string | null;
  verifiedAt: string | null;
  verificationReason: string | null;
  createdAt: string;
  updatedAt: string;
  mediaCount: number;
}

export type HistoricalNominationInput = Partial<
  Pick<
    HistoricalNomination,
    | "subjectType"
    | "subjectName"
    | "title"
    | "summary"
    | "description"
    | "dossierTypeId"
    | "categoryId"
    | "legacyCategoryLabel"
    | "nominationYear"
    | "nominatedAt"
    | "historicalResult"
    | "sourceKind"
    | "sourceLabel"
    | "sourceReference"
    | "sourceRecordedAt"
    | "provenanceNotes"
  >
>;

export interface HistoricalRelatedPerson {
  id: string;
  displayName: string;
  organizationName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  internalNotes: string | null;
  role: HistoricalRelatedPersonRole;
}

export interface HistoricalRelatedPersonInput {
  displayName: string;
  organizationName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  internalNotes?: string | null;
  role: HistoricalRelatedPersonRole;
}

export interface HistoricalAward {
  id: string;
  awardName: string;
  certificateNumber: string | null;
  issuedAt: string | null;
  issuedBy: string | null;
  verificationStatus:
    | "UNVERIFIED"
    | "NEEDS_EVIDENCE"
    | "VERIFIED"
    | "UNVERIFIABLE";
  recipientPersonId: string | null;
  provenanceNotes: string | null;
}

export interface HistoricalAwardInput {
  awardName: string;
  certificateNumber?: string | null;
  issuedAt?: string | null;
  issuedBy?: string | null;
  recipientPersonId?: string | null;
  provenanceNotes?: string | null;
}

export interface HistoricalMediaLink {
  id: string;
  mediaId: string;
  mediaKind: HistoricalMediaKind;
  accessScope: "PRIVATE" | "INTERNAL";
  displayOrder: number;
  awardId: string | null;
  publicCandidate?: boolean;
  filename?: string | null;
  mimeType?: string | null;
  bytes?: number | null;
  status?: string | null;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
  uploadedAt?: string | null;
}

export interface HistoricalMediaLibraryItem {
  id: string;
  mediaId: string;
  recordId: string;
  recordCode: string;
  recordTitle: string;
  mediaKind: HistoricalMediaKind;
  publicCandidate: boolean;
  filename: string;
  mimeType: string;
  bytes: number;
  status: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  attachedAt: string;
  awardId: string | null;
}

export interface HistoricalAwardLibraryItem {
  id: string;
  recordId: string;
  recordCode: string;
  subjectName: string | null;
  awardName: string;
  certificateNumber: string | null;
  issuedAt: string | null;
  issuedBy: string | null;
  verificationStatus:
    | "UNVERIFIED"
    | "NEEDS_EVIDENCE"
    | "VERIFIED"
    | "UNVERIFIABLE";
  recipientPersonId: string | null;
  provenanceNotes: string | null;
}

export interface HistoricalImportUpload {
  batchId: string;
  headers: string[];
  sampleRows: Record<string, string>[];
  totalRows: number;
}

export interface HistoricalImportRow {
  sourceRowNumber: number;
  status: HistoricalImportRowStatus;
  errorCode: string | null;
  payload: Record<string, string>;
}

export interface HistoricalImportPreview {
  batchId: string;
  headers: string[];
  rows: HistoricalImportRow[];
  totalRows: number;
  validCount: number;
  duplicateCount: number;
  rejectedCount: number;
}

export interface HistoricalImportResult {
  batchId: string;
  importedCount: number;
  rejectedCount: number;
  duplicateCount: number;
}

export interface HistoricalPublicContentApprovalInput {
  expectedUpdatedAt: string;
  slug: string;
  title: string;
  shortDescription: string;
  fullDescription?: string | null;
  authorDisplayName?: string | null;
  categoryId: string;
}

export interface HistoricalPublicContentApproval {
  recordId: string;
  publicWorkId: string;
  slug: string;
  publicWorkStatus: string;
  approvedAt: string;
}

export interface HistoricalWorkspaceSummary {
  totalRecords: number;
  draftCount: number;
  waitingReviewCount: number;
  needsCorrectionCount: number;
  verifiedCount: number;
  publishedCount: number;
  recentActivity: {
    recordId: string;
    recordCode: string;
    title: string;
    action: string;
    occurredAt: string;
  }[];
}

export type HistoricalPublicContentDraftStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "NEEDS_CORRECTION"
  | "APPROVED";

export interface HistoricalPublicContentDraft {
  id: string;
  nominationId: string;
  slug: string | null;
  title: string | null;
  shortDescription: string | null;
  fullDescription: string | null;
  authorDisplayName: string | null;
  categoryId: string | null;
  coverMediaId: string | null;
  featuredVideoMediaId: string | null;
  publicMediaIds: string[];
  status: HistoricalPublicContentDraftStatus;
  revision: number;
  updatedAt: string;
  submittedAt: string | null;
}

export interface HistoricalPublication {
  recordId: string;
  publicWorkId: string;
  slug: string;
  publicationStatus: string;
  version: number;
  publishedAt: string | null;
}

export interface HistoricalPublicContentVersion {
  id: string;
  nominationId: string;
  versionNo: number;
  eventType: string;
  snapshotJson: Record<string, unknown>;
  createdByUserId: string;
  createdAt: string;
}

export interface HistoricalRecordActivity {
  id: string;
  actorUserId: string | null;
  action: string;
  changedFields: string[];
  occurredAt: string;
}

export type HistoricalPublicContentDraftInput = Omit<
  HistoricalPublicContentDraft,
  "id" | "nominationId" | "status" | "revision" | "updatedAt" | "submittedAt"
> & { expectedUpdatedAt?: string | null };
