"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { nominationArchiveApi } from "@/lib/api/client";
import type {
  ArchiveEntry,
  ArchiveSection,
  ArchiveSource,
} from "@/lib/api/nomination-archive";
import type { ReviewEvidenceSnapshot } from "@/lib/api/types";
import { displayCnsDossierCode } from "@/lib/brand/identifiers";
import { EvidenceViewer } from "@/components/reviews/evidence-viewer";
import { HistoricalCertificatePresentation } from "@/components/certificates/historical-certificate-presentation";
import { ReviewReportDetails } from "./review-report-details";
import { archiveStatusLabel } from "./nomination-archive";
import { ArchiveFacts } from "./nomination-archive-facts";
import { DossierVersionDocuments } from "@/components/dossiers/dossier-version-documents";

const sections: Array<[ArchiveSection, string]> = [
  ["people", "Tổng quan & người liên quan"],
  ["documents", "Tài liệu hồ sơ"],
  ["versions", "Phiên bản đã lưu"],
  ["supplements", "Các lần bổ sung"],
  ["reviews", "Thẩm định"],
  ["decisions", "Quyết định"],
  ["certificates", "Bằng xác lập"],
  ["publication", "Nội dung công bố"],
  ["history", "Lịch sử hồ sơ"],
];
function documentEvidence(entry: ArchiveEntry): ReviewEvidenceSnapshot {
  return {
    id: entry.id,
    mediaAssetId: entry.mediaId ?? "",
    title: entry.title,
    evidenceType: "SOURCE",
    description: null,
    issuedAt: null,
    displayOrder: 0,
    isPublic: false,
    media: {
      mimeType: entry.mimeType ?? "application/octet-stream",
      bytes: entry.bytes ?? 0,
      sha256: entry.checksum ?? "",
    },
  };
}
function date(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function ArchiveScans({
  source,
  recordId,
}: {
  source: ArchiveSource;
  recordId: string;
}) {
  const [page, setPage] = useState(1);
  const scans = useQuery({
    queryKey: ["nomination-archive-scans", source, recordId, page],
    queryFn: () =>
      nominationArchiveApi.section(source, recordId, "certificate_scans", page),
  });
  return (
    <section
      className="space-y-3 border-t border-[var(--theme-border)] pt-5"
      aria-label="Bản scan bằng lưu trữ"
    >
      <h3 className="font-semibold">Bản scan và các phiên bản bằng lưu trữ</h3>
      {scans.isPending ? (
        <p role="status">Đang tải bản scan…</p>
      ) : scans.isError ? (
        <div role="alert">
          Không tải được bằng lưu trữ.{" "}
          <button
            className="underline"
            type="button"
            onClick={() => void scans.refetch()}
          >
            Thử lại
          </button>
        </div>
      ) : (
        <>
          {scans.data.data.length === 0 ? (
            <p className="text-sm text-[var(--theme-muted)]">
              Chưa có bản scan bằng lưu trữ gắn với nội dung công bố của hồ sơ.
            </p>
          ) : null}
          <EvidenceViewer
            contextLabel="Tài liệu lưu trong hồ sơ"
            evidences={scans.data.data
              .filter(
                (item) =>
                  item.mediaId && item.status !== "METADATA_WITHOUT_ASSET",
              )
              .map(documentEvidence)}
          />
          {scans.data.data.map((item) => (
            <article className="space-y-2 py-3" key={item.id}>
              <h4 className="text-sm font-semibold">{item.title}</h4>
              {item.status === "METADATA_WITHOUT_ASSET" ? (
                <p role="alert">
                  Có metadata bản scan nhưng thiếu bản ghi tệp. Cần kiểm tra lưu
                  trữ.
                </p>
              ) : null}
              <ArchiveFacts value={item.facts} />
            </article>
          ))}
          {scans.data.meta.total > 25 ? (
            <nav aria-label="Trang bản scan" className="flex gap-4">
              <button
                type="button"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                Trang trước
              </button>
              <span>{page}</span>
              <button
                type="button"
                disabled={page * 25 >= scans.data.meta.total}
                onClick={() => setPage(page + 1)}
              >
                Trang sau
              </button>
            </nav>
          ) : null}
        </>
      )}
    </section>
  );
}
export function NominationArchiveDetail({
  source,
  recordId,
}: {
  source: ArchiveSource;
  recordId: string;
}) {
  const [section, setSection] = useState<ArchiveSection>("people");
  const [page, setPage] = useState(1);
  const record = useQuery({
    queryKey: ["nomination-archive-record", source, recordId],
    queryFn: () => nominationArchiveApi.get(source, recordId),
  });
  const entries = useQuery({
    queryKey: ["nomination-archive-section", source, recordId, section, page],
    queryFn: () =>
      nominationArchiveApi.section(source, recordId, section, page),
    enabled: Boolean(record.data),
  });
  const available = sections.filter(
    ([key]) =>
      source === "CURRENT" ||
      !["reviews", "decisions", "supplements"].includes(key),
  );
  function selectSection(value: ArchiveSection) {
    setSection(value);
    setPage(1);
  }
  if (record.isPending) return <p role="status">Đang mở bộ hồ sơ…</p>;
  if (record.isError)
    return (
      <div role="alert">
        Không mở được hồ sơ hoặc bạn không có quyền đọc.{" "}
        <button
          type="button"
          className="underline"
          onClick={() => void record.refetch()}
        >
          Thử lại
        </button>
      </div>
    );
  return (
    <section
      className="mx-auto max-w-7xl space-y-5"
      aria-label="Bộ hồ sơ đề cử"
    >
      <Link
        className="inline-flex min-h-11 items-center text-sm text-[var(--theme-accent)]"
        href="/admin/nomination-records"
      >
        ← Kho hồ sơ đề cử
      </Link>
      <header className="space-y-2 border-b border-[var(--theme-border)] pb-5">
        <p className="text-xs uppercase text-[var(--theme-muted)]">
          {source === "CURRENT" ? "Hồ sơ mới" : "Hồ sơ lịch sử"} · Chế độ đọc hồ
          sơ nguồn
        </p>
        <h1 className="break-words text-2xl font-semibold">
          {record.data.title}
        </h1>
        <p className="break-all text-sm">
          {displayCnsDossierCode(record.data.code)} · Năm{" "}
          {record.data.year ?? "chưa ghi nhận"}
        </p>
        <p className="text-sm">
          Nghiệp vụ: {archiveStatusLabel(record.data.businessStatus)} · Công bố:{" "}
          {archiveStatusLabel(record.data.publicationStatus)}
          {record.data.archiveStatus
            ? ` · Lưu trữ: ${archiveStatusLabel(record.data.archiveStatus)}`
            : ""}
        </p>
        <p className="text-xs text-[var(--theme-muted)]">
          Cập nhật {date(record.data.updatedAt)}
        </p>
      </header>
      <label className="block text-sm lg:hidden">
        Chọn mục hồ sơ
        <select
          className="mt-2 min-h-11 w-full rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3"
          value={section}
          onChange={(event) =>
            selectSection(event.target.value as ArchiveSection)
          }
        >
          {available.map(([key, title]) => (
            <option value={key} key={key}>
              {title}
            </option>
          ))}
        </select>
      </label>
      <nav
        className="hidden flex-wrap gap-2 border-b border-[var(--theme-border)] pb-3 lg:flex"
        aria-label="Các mục bộ hồ sơ"
      >
        {available.map(([key, title]) => (
          <button
            type="button"
            key={key}
            aria-current={key === section ? "page" : undefined}
            className={`min-h-11 rounded-md px-3 text-sm ${key === section ? "bg-[var(--theme-accent)] font-semibold text-white" : "border border-[var(--theme-border)]"}`}
            onClick={() => selectSection(key)}
          >
            {title}
          </button>
        ))}
      </nav>
      <h2 className="text-xl font-semibold">
        {available.find(([key]) => key === section)?.[1]}
      </h2>
      {section === "certificates" ? (
        <ArchiveScans source={source} recordId={recordId} />
      ) : null}
      {entries.isPending ? (
        <p role="status">Đang tải mục hồ sơ…</p>
      ) : entries.isError ? (
        <div role="alert">
          Không tải được dữ liệu mục này.{" "}
          <button
            type="button"
            className="underline"
            onClick={() => void entries.refetch()}
          >
            Thử lại
          </button>
        </div>
      ) : entries.data ? (
        <>
          {entries.data.data.length === 0 ? (
            <p className="py-6 text-sm text-[var(--theme-muted)]">
              Chưa có bản ghi cho mục này. Đây không phải kết luận rằng dữ liệu
              ở các mục khác đã mất.
            </p>
          ) : null}
          {section === "documents" ? (
            <EvidenceViewer
              contextLabel="Tài liệu lưu trong hồ sơ"
              evidences={entries.data.data
                .filter(
                  (entry) =>
                    entry.mediaId && entry.status !== "METADATA_WITHOUT_ASSET",
                )
                .map(documentEvidence)}
            />
          ) : null}
          <div className="divide-y divide-[var(--theme-border)]">
            {entries.data.data.map((entry) => (
              <article key={entry.id} className="space-y-3 py-5">
                <h3 className="break-words font-semibold">{entry.title}</h3>
                <p className="text-sm text-[var(--theme-muted)]">
                  {entry.status === "METADATA_WITHOUT_ASSET"
                    ? "Có metadata nhưng thiếu bản ghi tệp. Cần kiểm tra liên kết lưu trữ."
                    : archiveStatusLabel(entry.status)}
                </p>
                {entry.occurredAt ? (
                  <p className="text-xs">{date(entry.occurredAt)}</p>
                ) : null}
                {entry.actor ? (
                  <p className="break-all text-xs">
                    Người thực hiện / tải lên: {entry.actor}
                  </p>
                ) : null}
                {entry.versionId ? (
                  <p className="break-all text-xs">
                    Phiên bản nguồn: {entry.versionId}
                  </p>
                ) : null}
                {entry.bytes != null ? (
                  <p className="text-xs">
                    Dung lượng: {entry.bytes.toLocaleString("vi-VN")} byte ·{" "}
                    {entry.mimeType}
                  </p>
                ) : null}
                {entry.checksum ? (
                  <details>
                    <summary className="cursor-pointer text-sm">
                      Xem mã đối chiếu
                    </summary>
                    <p className="mt-2 break-all font-mono text-xs">
                      {entry.checksum}
                    </p>
                  </details>
                ) : null}
                {section === "versions" ? (
                  <>
                    <details>
                      <summary className="min-h-11 cursor-pointer py-2 text-sm">
                        Xem thông tin đã lưu trong phiên bản
                      </summary>
                      <ArchiveFacts value={entry.facts.snapshot_json} />
                    </details>
                    <DossierVersionDocuments
                      snapshot={entry.facts.snapshot_json}
                    />
                  </>
                ) : null}
                {section === "reviews" &&
                entry.facts.report &&
                entry.facts.snapshot?.dossier ? (
                  <ReviewReportDetails
                    review={entry.facts.report}
                    snapshot={entry.facts.snapshot}
                  />
                ) : null}
                {section === "certificates" && source === "LEGACY" ? (
                  <details>
                    <summary className="cursor-pointer py-2 text-sm">
                      Xem bản trình bày số hóa
                    </summary>
                    <HistoricalCertificatePresentation
                      title={entry.title}
                      subject={record.data.subject}
                      number={
                        typeof entry.facts.certificate_number === "string"
                          ? entry.facts.certificate_number
                          : null
                      }
                      issuer={
                        typeof entry.facts.issued_by === "string"
                          ? entry.facts.issued_by
                          : null
                      }
                      issuedAt={
                        typeof entry.facts.issued_at === "string"
                          ? entry.facts.issued_at
                          : null
                      }
                    />
                  </details>
                ) : null}
                {section === "certificates" &&
                source === "CURRENT" &&
                entry.mediaId ? (
                  <EvidenceViewer
                    contextLabel="Tài liệu lưu trong hồ sơ"
                    // Certificate metadata hashes do not verify PDF file bytes.
                    evidences={[documentEvidence({ ...entry, checksum: null })]}
                  />
                ) : null}
                {section === "publication" ? (
                  <Link
                    className="inline-flex min-h-11 items-center text-sm text-[var(--theme-accent)] underline"
                    href={`/admin/content?${new URLSearchParams({ workId: entry.id, source, recordId })}`}
                  >
                    Mở trình biên tập công bố
                  </Link>
                ) : null}
                <ArchiveFacts value={entry.facts} />
              </article>
            ))}
          </div>
          {entries.data.meta.total > 25 ? (
            <nav
              className="flex items-center gap-4"
              aria-label="Trang dữ liệu hồ sơ"
            >
              <button
                className="min-h-11 disabled:opacity-50"
                type="button"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                Trang trước
              </button>
              <span>Trang {page}</span>
              <button
                className="min-h-11 disabled:opacity-50"
                type="button"
                disabled={page * 25 >= entries.data.meta.total}
                onClick={() => setPage(page + 1)}
              >
                Trang sau
              </button>
            </nav>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
