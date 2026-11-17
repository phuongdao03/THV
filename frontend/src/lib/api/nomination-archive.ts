import type { ReviewData, ReviewSnapshot } from "./types";

export type ArchiveSource = "CURRENT" | "LEGACY";
export type ArchiveSection =
  | "certificate_scans"
  | "people"
  | "documents"
  | "versions"
  | "reviews"
  | "decisions"
  | "certificates"
  | "publication"
  | "history"
  | "supplements";
export interface ArchiveRecord {
  id: string;
  source: ArchiveSource;
  code: string;
  title: string;
  subject: string | null;
  ownerUserId: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  year: number | null;
  categoryId: string | null;
  categoryName: string | null;
  recordedAt: string;
  versionNo: number | null;
  businessStatus: string;
  publicationStatus: string | null;
  archiveStatus: string | null;
  documentCount: number;
  imageCount: number;
  videoCount: number;
  certificateCount: number;
  certificateReference: string | null;
  updatedAt: string;
}
export interface ArchiveEntry {
  id: string;
  title: string;
  status: string | null;
  occurredAt: string | null;
  actor: string | null;
  versionId: string | null;
  versionNo: number | null;
  mediaId: string | null;
  mimeType: string | null;
  bytes: number | null;
  checksum: string | null;
  facts: Record<string, unknown> & {
    report?: ReviewData | null;
    snapshot?: ReviewSnapshot;
  };
}
