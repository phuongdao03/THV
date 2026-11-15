"use client";

import { useState } from "react";
import { Archive, BookOpen, Eye, FileCheck2 } from "lucide-react";

import { CertificateCorrectionList } from "@/components/admin/certificate-correction-list";
import { CertificateContentCorrection } from "@/components/admin/certificate-content-correction";
import { CertificateContentDrafts } from "@/components/admin/certificate-content-drafts";
import { CertificateArchiveWorkspace } from "@/components/certificates/certificate-archive-workspace";
import { HistoricalDataManagerWorkspace } from "@/components/historical-nominations/historical-data-manager-workspace";
import { PublicWorkEditor } from "@/components/admin/public-work-editor";

type WorkspaceTab =
  | "historical-records"
  | "public-content"
  | "digital-certificates"
  | "archival-certificates";

const tabs = [
  ["historical-records", "Hồ sơ lịch sử", BookOpen],
  ["public-content", "Nội dung công bố", Eye],
  ["digital-certificates", "Bằng số", FileCheck2],
  ["archival-certificates", "Bằng scan công khai", Archive],
] as const;

export function DataManagerContentWorkspace({
  initialTab = "public-content",
}: {
  initialTab?: "historical-records" | "public-content";
}) {
  const [tab, setTab] = useState<WorkspaceTab>(initialTab);

  function selectTab(nextTab: WorkspaceTab) {
    setTab(nextTab);
    const url = new URL(window.location.href);
    if (nextTab === "historical-records") url.searchParams.set("area", nextTab);
    else url.searchParams.delete("area");
    window.history.replaceState({}, "", url);
  }

  return (
    <div className="space-y-5">
      <nav
        aria-label="Quản lý nội dung"
        className="flex flex-wrap gap-2 border-b border-[var(--theme-border)]"
        role="tablist"
      >
        {tabs.map(([id, label, Icon]) => (
          <button
            aria-selected={tab === id}
            className="inline-flex min-h-11 items-center gap-2 border-b-2 border-transparent px-4 text-sm font-semibold text-[var(--theme-muted)] aria-selected:border-primary-700 aria-selected:text-primary-700"
            key={id}
            onClick={() => selectTab(id)}
            role="tab"
            type="button"
          >
            <Icon aria-hidden="true" className="size-4" /> {label}
          </button>
        ))}
      </nav>

      {tab === "historical-records" ? (
        <div className="space-y-4">
          <p className="max-w-3xl text-sm leading-6 text-[var(--theme-muted)]">
            Bổ sung và quản lý hồ sơ đề cử cũ, người gửi, tài liệu chứng minh,
            bằng xác lập và bản scan. Lưu hồ sơ trực tiếp; nội dung công khai được
            biên tập và xuất bản riêng khi sẵn sàng.
          </p>
          <HistoricalDataManagerWorkspace />
        </div>
      ) : null}

      {tab === "public-content" ? (
        <section aria-label="Nội dung công bố">
          <p className="mb-4 max-w-3xl text-sm leading-6 text-[var(--theme-muted)]">
            Biên tập, xem trước và đăng tải nội dung dành cho trang công khai.
            Khu vực này chỉ quản lý phần trình bày; hồ sơ nguồn và tài liệu lưu
            trữ được quản lý riêng trong Hồ sơ lịch sử.
          </p>
          <PublicWorkEditor managerMode />
        </section>
      ) : null}

      {tab === "digital-certificates" ? (
        <div className="space-y-8">
          <CertificateContentDrafts canConfirm={false} />
          <DataManagerIssuedCertificateCorrections />
        </div>
      ) : null}

      {tab === "archival-certificates" ? <CertificateArchiveWorkspace /> : null}
    </div>
  );
}

function DataManagerIssuedCertificateCorrections() {
  const [certificateId, setCertificateId] = useState<string | null>(null);
  return (
    <section
      className="space-y-4"
      aria-labelledby="issued-content-correction-title"
    >
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary-700">
          Bằng đã phát hành
        </p>
        <h2
          id="issued-content-correction-title"
          className="mt-2 text-2xl font-bold"
        >
          Đề xuất chỉnh sửa nội dung
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600">
          Gửi nội dung và lý do để Admin xem xét. Đề xuất chưa thay đổi bằng,
          trang xác minh hoặc PDF cho đến khi Admin duyệt.
        </p>
      </header>
      {certificateId ? (
        <div className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-4 sm:p-6">
          <button
            className="min-h-10 text-sm font-bold text-primary-700 underline"
            onClick={() => setCertificateId(null)}
            type="button"
          >
            ← Chọn bằng khác
          </button>
          <CertificateContentCorrection certificateId={certificateId} />
        </div>
      ) : (
        <CertificateCorrectionList onSelectCertificateId={setCertificateId} />
      )}
    </section>
  );
}
