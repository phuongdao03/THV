"use client";

import { CertificateCorrectionList } from "@/components/admin/certificate-correction-list";
import { CertificateContentCorrection } from "@/components/admin/certificate-content-correction";
import { CertificateContentDrafts } from "@/components/admin/certificate-content-drafts";
import { PublicWorkEditor } from "@/components/admin/public-work-editor";
import { CertificateArchiveWorkspace } from "@/components/certificates/certificate-archive-workspace";
import { HistoricalDataManagerWorkspace } from "@/components/historical-nominations/historical-data-manager-workspace";
import { useState } from "react";

export function DataManagerContentWorkspace({
  initialTab = "historical-records",
}: {
  initialTab?: "historical-records" | "public-content";
}) {
  if (initialTab === "historical-records") {
    return <HistoricalDataManagerWorkspace />;
  }

  return (
    <div className="space-y-6">
      <section aria-labelledby="public-content-heading" className="space-y-4">
        <header>
          <h2 className="text-2xl font-semibold" id="public-content-heading">
            Nội dung công bố
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--theme-muted)]">
            Biên tập, xem trước và công bố phần trình bày của tác phẩm. Hồ sơ
            nguồn và tài liệu lưu trữ vẫn nằm trong hồ sơ đề cử.
          </p>
        </header>
        <PublicWorkEditor managerMode />
      </section>

      <details className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)]">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
          Quản lý bằng số và scan lưu trữ
        </summary>
        <div className="space-y-6 border-t border-[var(--theme-border)] p-4">
          <section className="space-y-4" aria-label="Nội dung bằng số">
            <CertificateContentDrafts canConfirm={false} />
            <DataManagerIssuedCertificateCorrections />
          </section>
          <section aria-label="Bằng scan lưu trữ">
            <CertificateArchiveWorkspace />
          </section>
        </div>
      </details>
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
        <h2
          id="issued-content-correction-title"
          className="text-xl font-semibold"
        >
          Đề xuất chỉnh sửa bằng đã phát hành
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--theme-muted)]">
          Đề xuất chưa thay đổi bằng, trang xác minh hoặc PDF cho đến khi Admin
          duyệt.
        </p>
      </header>
      {certificateId ? (
        <div className="space-y-4 rounded-xl border border-[var(--theme-border)] p-4">
          <button
            className="min-h-10 text-sm font-semibold text-[var(--theme-accent)] underline"
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
