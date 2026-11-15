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

const guides: Record<
  WorkspaceTab,
  { title: string; description: string; steps: readonly string[] }
> = {
  "historical-records": {
    title: "Bổ sung hồ sơ cũ",
    description:
      "Tạo hồ sơ nguồn trước, sau đó thêm người gửi, tài liệu và bằng scan. Nội dung công khai được biên tập riêng khi sẵn sàng.",
    steps: [
      "Tạo hồ sơ nguồn",
      "Bổ sung người gửi và tài liệu",
      "Biên tập, xem trước rồi công bố riêng",
    ],
  },
  "public-content": {
    title: "Biên tập nội dung công khai",
    description:
      "Chọn tác phẩm để sửa phần trình bày, kiểm tra bản xem trước và xuất bản. Thông tin hồ sơ gốc, người gửi và tài liệu nằm ở Hồ sơ lịch sử.",
    steps: [
      "Chọn tác phẩm",
      "Sửa tiêu đề, mô tả và tư liệu trình bày",
      "Xem trước rồi xuất bản khi đã sẵn sàng",
    ],
  },
  "digital-certificates": {
    title: "Quản lý nội dung bằng số",
    description:
      "Chỉnh thông tin lưu trữ trước khi phát hành; với bằng đã phát hành, gửi đề xuất có lý do để Admin xem xét. Trạng thái blockchain được tra cứu trên website.",
    steps: [
      "Chọn nội dung cần cập nhật",
      "Kiểm tra thông tin sẽ in trên bằng",
      "Gửi đề xuất nếu bằng đã phát hành",
    ],
  },
  "archival-certificates": {
    title: "Bổ sung bằng xác lập scan cũ",
    description:
      "Lưu thông tin đọc được trên bằng cũ, tải ảnh scan theo từng trang và xem trước trang công khai. Không cần blockchain hay bằng số PDF.",
    steps: [
      "Chọn tác phẩm liên quan",
      "Điền thông tin lưu trữ còn biết",
      "Tải ảnh scan và xem trước trước khi công khai",
    ],
  },
};

export function DataManagerContentWorkspace({
  initialTab = "historical-records",
}: {
  initialTab?: "historical-records" | "public-content";
}) {
  const [tab, setTab] = useState<WorkspaceTab>(initialTab);

  function selectTab(nextTab: WorkspaceTab) {
    setTab(nextTab);
    const url = new URL(window.location.href);
    if (nextTab === "historical-records" || nextTab === "public-content") {
      url.searchParams.set("area", nextTab);
    } else {
      url.searchParams.delete("area");
    }
    window.history.replaceState({}, "", url);
  }

  const GuideIcon = tabs.find(([id]) => id === tab)?.[2] ?? BookOpen;

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

      <section
        aria-labelledby="data-manager-task-guide-title"
        className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4 sm:p-5"
      >
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary-700">
            <GuideIcon aria-hidden="true" className="size-5" />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary-700">
              Bắt đầu tại đây
            </p>
            <h2
              className="mt-1 text-lg font-bold text-[var(--theme-text)]"
              id="data-manager-task-guide-title"
            >
              {guides[tab].title}
            </h2>
            <p className="mt-1 max-w-4xl text-sm leading-6 text-[var(--theme-muted)]">
              {guides[tab].description}
            </p>
          </div>
        </div>
        <ol className="mt-4 grid gap-2 sm:grid-cols-3">
          {guides[tab].steps.map((step, index) => (
            <li
              className="flex items-start gap-2 rounded-xl bg-primary-50/70 px-3 py-2 text-sm leading-5 text-[var(--theme-text)]"
              key={step}
            >
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-white text-xs font-bold text-primary-700">
                {index + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </section>

      {tab === "historical-records" ? (
        <div className="space-y-4">
          <p className="max-w-3xl text-sm leading-6 text-[var(--theme-muted)]">
            Hồ sơ lịch sử lưu người gửi, tài liệu chứng minh và thông tin bằng
            scan. Lưu hồ sơ tại đây; chỉ phần trình bày được biên tập và xuất
            bản ở tab Nội dung công bố.
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
