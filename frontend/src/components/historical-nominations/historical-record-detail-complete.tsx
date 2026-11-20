"use client";

import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import {
  ArrowDown,
  ArrowUp,
  FilePlus2,
  Image as ImageIcon,
  LoaderCircle,
  Plus,
  Video,
} from "lucide-react";
import { useState, type FormEvent } from "react";

import {
  dossierApi,
  historicalNominationApi,
  mediaApi,
  publicApi,
} from "@/lib/api/client";
import type {
  HistoricalAward,
  HistoricalMediaKind,
  HistoricalNomination,
  HistoricalPublicContentDraftInput,
  HistoricalRelatedPersonRole,
} from "@/lib/api/historical-nomination-types";
import { categoryLabels } from "@/lib/categories";
import { formatDateInput } from "@/lib/dates";
import { uploadMedia } from "@/lib/media/upload";
import { PublicWorkPresentation } from "@/components/public/public-work-detail";
import { Button } from "@/components/ui/button";
import type { PublicWorkDetail, PublicWorkDetailMedia } from "@/lib/api/types";
import { HistoricalCertificatePresentation } from "@/components/certificates/historical-certificate-presentation";

import { HistoricalDateField } from "./historical-date-field";
import { HistoricalAccountLinkControl } from "./historical-account-link-control";
import {
  historicalActivityLabel,
  historicalActivityDescription,
} from "./historical-activity-labels";

const sections = [
  "Thông tin",
  "Người gửi & liên quan",
  "Hình ảnh & tài liệu",
  "Bằng xác lập",
  "Nội dung công khai",
  "Lịch sử chỉnh sửa",
] as const;
type Section = (typeof sections)[number];
const roles: { value: HistoricalRelatedPersonRole; label: string }[] = [
  { value: "NOMINEE", label: "Người được đề cử" },
  { value: "NOMINATOR", label: "Người gửi / người đề cử" },
  { value: "REPRESENTATIVE", label: "Đại diện" },
  { value: "CONTACT", label: "Liên hệ" },
  { value: "WITNESS", label: "Người xác nhận" },
  { value: "OTHER", label: "Khác" },
];
const fieldClass =
  "w-full rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-2.5 text-sm";

function formatBytes(bytes: number | undefined | null) {
  if (bytes == null) return "Dung lượng chưa rõ";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function publicationStatusLabel(status: string) {
  const labels: Record<string, string> = {
    PRIVATE: "Chưa công khai",
    PENDING_PUBLICATION: "Chưa đăng",
    PUBLISHED: "Đã công khai",
    HIDDEN: "Đã ẩn",
  };
  return labels[status] ?? "Chưa công khai";
}

export function HistoricalRecordDetailComplete({
  record,
  canEdit,
  onEdit,
  onArchive,
  submitting,
}: {
  record: HistoricalNomination;
  canEdit: boolean;
  onEdit: () => void;
  onArchive: () => void;
  submitting: boolean;
}) {
  const queryClient = useQueryClient();
  const [section, setSection] = useState<Section>("Thông tin");
  const [visitedSections, setVisitedSections] = useState<Set<Section>>(
    () => new Set(["Thông tin"]),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingAwardId, setEditingAwardId] = useState<string | null>(null);
  const [awardFormOpen, setAwardFormOpen] = useState(false);
  const [awardFormRevision, setAwardFormRevision] = useState(0);
  const people = useQuery({
    queryKey: ["historical-nomination-people", record.id],
    queryFn: () => historicalNominationApi.listPeople(record.id),
  });
  const awards = useQuery({
    queryKey: ["historical-nomination-awards", record.id],
    queryFn: () => historicalNominationApi.listAwards(record.id),
  });
  const media = useQuery({
    queryKey: ["historical-nomination-media", record.id],
    queryFn: () => historicalNominationApi.listMedia(record.id),
  });
  const draft = useQuery({
    queryKey: ["historical-nomination-public-content-draft", record.id],
    queryFn: () => historicalNominationApi.publicContentDraft(record.id),
  });
  const publication = useQuery({
    queryKey: ["historical-nomination-publication", record.id],
    queryFn: () => historicalNominationApi.publication(record.id),
    enabled: section === "Nội dung công khai",
  });
  const dossierTypes = useQuery({
    queryKey: ["historical-record-dossier-types"],
    queryFn: dossierApi.listTypes,
  });
  const categories = useQuery({
    queryKey: ["historical-record-categories"],
    queryFn: () => publicApi.categories(),
  });
  const activity = useQuery({
    queryKey: ["historical-nomination-activity", record.id],
    queryFn: () => historicalNominationApi.recordActivity(record.id),
    enabled: section === "Lịch sử chỉnh sửa",
  });

  function selectSection(nextSection: Section) {
    setSection(nextSection);
    setVisitedSections((current) => {
      if (current.has(nextSection)) return current;
      return new Set(current).add(nextSection);
    });
  }

  function invalidateRecordVersion() {
    return queryClient.invalidateQueries({
      queryKey: ["historical-nomination", record.id],
    });
  }

  async function addPerson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setBusy(true);
    setError(null);
    try {
      await historicalNominationApi.addPerson(record.id, {
        displayName: String(values.get("displayName") ?? "").trim(),
        organizationName:
          String(values.get("organizationName") ?? "").trim() || null,
        email: String(values.get("email") ?? "").trim() || null,
        phone: String(values.get("phone") ?? "").trim() || null,
        address: String(values.get("address") ?? "").trim() || null,
        internalNotes: String(values.get("internalNotes") ?? "").trim() || null,
        role: String(
          values.get("role") ?? "OTHER",
        ) as HistoricalRelatedPersonRole,
      });
      form.reset();
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["historical-nomination-people", record.id],
        }),
        invalidateRecordVersion(),
      ]);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Không lưu được người liên quan.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveAward(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const input = {
      awardName:
        String(values.get("awardName") ?? "").trim() ||
        "Bằng xác lập chưa đặt tên",
      certificateNumber:
        String(values.get("certificateNumber") ?? "").trim() || null,
      issuedAt: String(values.get("issuedAt") ?? "") || null,
      issuedBy: String(values.get("issuedBy") ?? "").trim() || null,
      recipientPersonId: String(values.get("recipientPersonId") ?? "") || null,
      provenanceNotes: String(values.get("awardNotes") ?? "").trim() || null,
    };
    setBusy(true);
    setError(null);
    try {
      const editingAward = awards.data?.find(
        (award) => award.id === editingAwardId,
      );
      if (editingAward) {
        await historicalNominationApi.updateAward(
          record.id,
          editingAward.id,
          editingAward.updatedAt,
          input,
        );
      } else {
        await historicalNominationApi.addAward(record.id, input);
      }
      form.reset();
      setEditingAwardId(null);
      setAwardFormOpen(false);
      setAwardFormRevision((revision) => revision + 1);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["historical-nomination-awards", record.id],
        }),
        invalidateRecordVersion(),
      ]);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Không lưu được bằng xác lập.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function reuseFileForAward(awardId: string, mediaId: string) {
    const item = mediaLinks.find((link) => link.mediaId === mediaId);
    if (!item) return;
    setBusy(true);
    setError(null);
    try {
      await historicalNominationApi.linkMedia(record.id, {
        mediaId: item.mediaId,
        mediaKind: "AWARD_SCAN",
        awardId,
        displayOrder: item.displayOrder,
      });
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["historical-nomination-media", record.id],
        }),
        invalidateRecordVersion(),
      ]);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Không gắn được tài liệu đã có vào bằng.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function uploadFiles(
    files: File[],
    preferredKind?: HistoricalMediaKind,
    awardId?: string,
  ) {
    if (!files.length) return;
    setBusy(true);
    setError(null);
    const failures: string[] = [];
    for (const file of files) {
      try {
        const asset = await uploadMedia(file, "HISTORICAL_NOMINATION");
        const kind =
          preferredKind ??
          (file.type.startsWith("image/")
            ? "PHOTO"
            : file.type.startsWith("video/")
              ? "VIDEO"
              : file.type === "application/pdf"
                ? "SCANNED_DOCUMENT"
                : "SUPPORTING_DOCUMENT");
        await historicalNominationApi.linkMedia(record.id, {
          mediaId: asset.id,
          mediaKind: kind,
          awardId,
          displayOrder: media.data?.length ?? 0,
        });
      } catch (cause) {
        failures.push(
          `${file.name}: ${cause instanceof Error ? cause.message : "không tải được"}`,
        );
      }
    }
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["historical-nomination-media", record.id],
      }),
      queryClient.invalidateQueries({ queryKey: ["historical-media-library"] }),
      invalidateRecordVersion(),
    ]);
    if (failures.length) setError(failures.join(" · "));
    setBusy(false);
  }

  async function unlink(linkId: string) {
    setBusy(true);
    setError(null);
    try {
      await historicalNominationApi.unlinkMedia(record.id, linkId);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["historical-nomination-media", record.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["historical-media-library"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["historical-nomination-public-content-draft", record.id],
        }),
        invalidateRecordVersion(),
      ]);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Không gỡ được tài liệu khỏi hồ sơ.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function savePublicDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const selectedMediaIds = values.getAll("publicMedia").map(String);
    const input: HistoricalPublicContentDraftInput = {
      expectedUpdatedAt: draft.data?.updatedAt ?? null,
      slug: String(values.get("slug") ?? "").trim() || null,
      title: String(values.get("publicTitle") ?? "").trim() || null,
      shortDescription:
        String(values.get("shortDescription") ?? "").trim() || null,
      fullDescription:
        String(values.get("fullDescription") ?? "").trim() || null,
      authorDisplayName:
        String(values.get("authorDisplayName") ?? "").trim() || null,
      categoryId: String(values.get("publicCategoryId") ?? "") || null,
      coverMediaId:
        values.get("coverMode") === "AUTO"
          ? null
          : String(values.get("coverMediaId") ?? "") || null,
      featuredVideoMediaId:
        String(values.get("featuredVideoMediaId") ?? "") || null,
      publicMediaIds: selectedMediaIds,
    };
    setBusy(true);
    setError(null);
    try {
      await historicalNominationApi.savePublicContentDraft(record.id, input);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["historical-nomination-public-content-draft", record.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["historical-nomination", record.id],
        }),
      ]);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Không lưu được nội dung dự kiến.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function publishPublicDraft() {
    if (!draft.data || publication.isLoading) return;
    if (!window.confirm("Xuất bản nội dung này lên trang công khai?")) return;
    setBusy(true);
    setError(null);
    try {
      await historicalNominationApi.publish(
        record.id,
        draft.data.updatedAt,
        publication.data?.version ?? null,
      );
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["historical-nomination-publication", record.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["historical-nomination", record.id],
        }),
        queryClient.invalidateQueries({ queryKey: ["historical-nominations"] }),
      ]);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Không xuất bản được nội dung.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function hidePublicDraft() {
    const currentPublication = publication.data;
    if (!currentPublication) return;
    if (!window.confirm("Ẩn nội dung này khỏi trang công khai?")) return;
    setBusy(true);
    setError(null);
    try {
      await historicalNominationApi.hide(record.id, currentPublication.version);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["historical-nomination-publication", record.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["historical-nomination", record.id],
        }),
        queryClient.invalidateQueries({ queryKey: ["historical-nominations"] }),
      ]);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Không ẩn được nội dung.",
      );
    } finally {
      setBusy(false);
    }
  }

  const status = publicationStatusLabel(record.publicationStatus);
  const hasBasicInfo = Boolean(
    record.subjectName?.trim() &&
      record.title?.trim() &&
      record.title !== "Hồ sơ chưa đặt tên",
  );
  const hasPublicDraft = Boolean(draft.data?.title && draft.data?.slug);
  const sourceKindLabels: Record<string, string> = {
    ARCHIVE: "Lưu trữ",
    OFFICIAL_RECORD: "Hồ sơ chính thức",
    ORGANIZATION_RECORD: "Hồ sơ tổ chức",
    PERSONAL_RECORD: "Tài liệu cá nhân",
    OTHER: "Khác / chưa rõ",
  };
  const mediaLinks = media.data ?? [];
  const editingAward = awards.data?.find(
    (award) => award.id === editingAwardId,
  );
  const unassignedAwardScans = mediaLinks.filter((item) => {
    const mimeType = item.mimeType ?? "";
    return (
      item.awardId === null &&
      (mimeType.startsWith("image/") || mimeType === "application/pdf")
    );
  });

  return (
    <section
      className="space-y-5"
      aria-labelledby="historical-record-detail-title"
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--theme-border)] pb-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--theme-muted)]">
            {status}
          </p>
          <h2
            className="mt-1 truncate text-xl font-semibold"
            id="historical-record-detail-title"
          >
            {record.title || "Hồ sơ chưa đặt tên"}
          </h2>
          <p className="mt-1 text-sm text-[var(--theme-muted)]">
            Người / tổ chức được đề cử:{" "}
            {record.subjectName || "Chưa có đối tượng ghi nhận"} ·{" "}
            {record.nominationYear ?? "Chưa rõ năm"}
          </p>
          <p className="mt-2 break-all text-xs text-[var(--theme-muted)]">
            Mã hồ sơ: {record.code}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit ? (
            <button
              className="min-h-10 rounded-md border border-[var(--theme-border)] px-3 text-sm disabled:opacity-60"
              disabled={submitting}
              onClick={onEdit}
              type="button"
            >
              Chỉnh sửa hồ sơ
            </button>
          ) : null}
          {canEdit && record.publicationStatus !== "PUBLISHED" ? (
            <details className="relative">
              <summary className="cursor-pointer rounded-md border border-[var(--theme-border)] px-3 py-2 text-sm">
                Thao tác khác
              </summary>
              <div className="absolute right-0 z-20 mt-2 w-72 rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] p-3 shadow-lg">
                <p className="mb-2 text-xs text-[var(--theme-muted)]">
                  Đưa hồ sơ khỏi danh sách đang làm, vẫn giữ dữ liệu. Thao tác
                  này không phải lưu thay đổi hoặc ẩn bài trên website.
                </p>
                <button
                  className="min-h-10 rounded-md border border-[var(--theme-border)] px-3 text-sm disabled:opacity-60"
                  disabled={submitting}
                  onClick={onArchive}
                  type="button"
                >
                  Ngừng xử lý hồ sơ
                </button>
              </div>
            </details>
          ) : null}
        </div>
      </header>

      <p className="text-xs leading-5 text-[var(--theme-muted)]">
        Chọn “Chỉnh sửa hồ sơ” để cập nhật thông tin, sau đó “Lưu thay đổi”. Để
        chuẩn bị bài đăng trên website, dùng bước Nội dung &amp; xuất bản.
      </p>
      <section
        aria-label="Các bước hoàn thiện hồ sơ"
        className="overflow-hidden rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)]"
      >
        <div className="flex flex-col gap-4 border-b border-[var(--theme-border)] p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--theme-accent)]">
              {record.publicationStatus === "PUBLISHED"
                ? "Quản lý hồ sơ đã công khai"
                : "Hoàn thiện hồ sơ"}
            </p>
            <h3 className="mt-2 text-lg font-semibold">
              {!hasBasicInfo
                ? "Bắt đầu bằng tên hồ sơ và đối tượng được đề cử"
                : !hasPublicDraft
                  ? "Thông tin đã có. Tiếp theo, chuẩn bị nội dung công khai"
                  : "Bản nháp đã có. Xem lại trước khi xuất bản"}
            </h3>
            <p className="mt-2 text-sm leading-6 text-[var(--theme-muted)]">
              Lưu từng phần để tiếp tục sau. Bạn có thể bổ sung người liên quan,
              tư liệu và bằng cũ khi có thông tin.
            </p>
          </div>
          {canEdit ? (
            <button
              className="min-h-11 shrink-0 rounded-lg bg-primary-700 px-5 py-3 text-sm font-semibold text-white hover:bg-primary-800 disabled:opacity-60"
              disabled={submitting}
              onClick={
                !hasBasicInfo
                  ? onEdit
                  : () => selectSection("Nội dung công khai")
              }
              type="button"
            >
              {!hasBasicInfo
                ? "Bắt đầu nhập thông tin"
                : !hasPublicDraft
                  ? "Soạn nội dung công khai"
                  : "Xem lại bản nháp"}
            </button>
          ) : null}
        </div>
        <ol className="grid divide-y divide-[var(--theme-border)] lg:grid-cols-4 lg:divide-x lg:divide-y-0">
          {[
            {
              title: "Thông tin hồ sơ",
              done: hasBasicInfo,
              description: "Tên hồ sơ, đối tượng, thời gian và nguồn.",
              state: hasBasicInfo
                ? "Đã có tên và đối tượng"
                : "Cần nhập để bắt đầu",
              action: "Nhập / sửa thông tin",
              run: onEdit,
            },
            {
              title: "Người & tư liệu",
              done: Boolean(people.data?.length && media.data?.length),
              description: "Thêm người liên quan, ảnh và tài liệu nguồn.",
              state:
                people.isPending || media.isPending
                  ? "Đang tải…"
                  : `${people.data?.length ?? 0} người · ${media.data?.length ?? 0} tệp · Bổ sung khi có`,
              action: "Bổ sung tư liệu",
              run: () => selectSection("Hình ảnh & tài liệu"),
            },
            {
              title: "Bằng xác lập cũ",
              done: Boolean(awards.data?.length),
              description: "Nhập thông tin bằng, tải ảnh chụp hoặc bản scan.",
              state: awards.isPending
                ? "Đang tải…"
                : `${awards.data?.length ?? 0} bằng · Bỏ qua nếu không có`,
              action: "Thêm / xem bằng cũ",
              run: () => selectSection("Bằng xác lập"),
            },
            {
              title: "Nội dung & xuất bản",
              done: record.publicationStatus === "PUBLISHED",
              description:
                "Soạn bài, chọn tệp công khai và xem lại trước khi đăng.",
              state:
                record.publicationStatus === "PUBLISHED"
                  ? "Đang công khai"
                  : draft.isPending
                    ? "Đang tải…"
                    : hasPublicDraft
                      ? "Đã có bản nháp"
                      : "Chưa có nội dung công khai",
              action: "Soạn và xem trước",
              run: () => selectSection("Nội dung công khai"),
            },
          ].map((step, index) => (
            <li
              className={`flex flex-col items-start p-5 ${step.done ? "bg-emerald-700/5 dark:bg-emerald-300/10" : ""}`}
              key={step.title}
            >
              <span
                aria-label={step.done ? "Đã hoàn thành" : `Bước ${index + 1}`}
                className={`mb-3 grid h-7 w-7 place-items-center rounded-full border text-xs font-semibold ${step.done ? "border-emerald-700 bg-emerald-700 text-white dark:border-emerald-300 dark:bg-emerald-300 dark:text-emerald-950" : "border-[var(--theme-border)] text-[var(--theme-accent)]"}`}
              >
                {step.done ? "✓" : index + 1}
              </span>
              {step.done ? (
                <p className="mb-2 text-xs font-semibold text-emerald-800 dark:text-emerald-200">
                  Đã hoàn thành
                </p>
              ) : null}
              <h4 className="font-semibold">{step.title}</h4>
              <p className="mt-2 text-sm leading-6 text-[var(--theme-muted)]">
                {step.description}
              </p>
              <p className="mb-4 mt-3 text-xs text-[var(--theme-muted)]">
                {step.state}
              </p>
              {canEdit ? (
                <button
                  className="mt-auto min-h-10 text-sm font-semibold text-[var(--theme-accent)] underline-offset-4 hover:underline disabled:opacity-60"
                  disabled={submitting}
                  onClick={step.run}
                  type="button"
                >
                  {step.action} →
                </button>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      <label className="block sm:hidden">
        <span className="sr-only">Chọn mục hồ sơ</span>
        <select
          aria-label="Chọn mục hồ sơ"
          className={`${fieldClass} min-h-11`}
          onChange={(event) =>
            selectSection(event.currentTarget.value as Section)
          }
          value={section}
        >
          {sections.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>

      <nav
        aria-label="Các phần trong hồ sơ"
        className="hidden flex-wrap gap-1 border-b border-[var(--theme-border)] pb-2 sm:flex"
        role="tablist"
      >
        {sections.map((item) => (
          <button
            aria-selected={section === item}
            className="min-h-10 shrink-0 rounded-md px-3 text-sm text-[var(--theme-muted)] hover:bg-[color-mix(in_srgb,var(--theme-surface)_94%,var(--theme-border))] aria-selected:bg-[color-mix(in_srgb,var(--theme-surface)_94%,var(--theme-border))] aria-selected:font-semibold aria-selected:text-[var(--theme-text)]"
            key={item}
            onClick={() => selectSection(item)}
            role="tab"
            type="button"
          >
            {item}
          </button>
        ))}
      </nav>

      {visitedSections.has("Thông tin") ? (
        <div
          hidden={section !== "Thông tin"}
          className="grid gap-3 sm:grid-cols-2"
        >
          <Info
            label="Đối tượng"
            value={record.subjectType === "PERSON" ? "Cá nhân" : "Tổ chức"}
          />
          <Info
            label="Loại hồ sơ"
            value={
              dossierTypes.data?.find(
                (dossierType) => dossierType.id === record.dossierTypeId,
              )?.name ?? "Chưa chọn loại hồ sơ"
            }
          />
          <Info
            label="Ngày đề cử"
            value={
              record.nominatedAt
                ? formatDateInput(record.nominatedAt)
                : record.nominationYear
                  ? String(record.nominationYear)
                  : "Chưa ghi nhận"
            }
          />
          <Info
            label="Tài liệu dùng để nhập hồ sơ"
            value={`${sourceKindLabels[record.sourceKind] ?? "Khác / chưa rõ"} · ${record.sourceLabel ?? "Chưa ghi nhận"}`}
          />
          <Info
            label="Mã hồ sơ cũ / tham chiếu"
            value={record.sourceReference ?? "Chưa ghi nhận"}
          />
          <Info label="Tóm tắt" value={record.summary ?? "Chưa có tóm tắt"} />
          <Info
            label="Thành tích / giá trị"
            value={record.historicalResult ?? "Chưa ghi nhận"}
          />
          <Info
            label="Ghi chú nguồn nội bộ"
            value={record.provenanceNotes ?? "Chưa có ghi chú"}
          />
          <Info
            label="Lưu gần nhất"
            value={new Intl.DateTimeFormat("vi-VN", {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(record.updatedAt))}
          />
        </div>
      ) : null}

      {visitedSections.has("Người gửi & liên quan") ? (
        <div hidden={section !== "Người gửi & liên quan"} className="space-y-4">
          <ul className="divide-y divide-[var(--theme-border)] rounded-lg border border-[var(--theme-border)]">
            {people.data?.map((person) => (
              <li
                className="grid gap-2 p-4 sm:grid-cols-[1fr_1fr]"
                key={person.id}
              >
                <div>
                  <p className="font-medium">{person.displayName}</p>
                  <p className="mt-1 text-xs text-[var(--theme-muted)]">
                    {roles.find((role) => role.value === person.role)?.label ??
                      person.role}{" "}
                    · {person.organizationName ?? "Cá nhân"}
                  </p>
                </div>
                <div className="break-words text-sm text-[var(--theme-muted)]">
                  {[person.phone, person.email, person.address]
                    .filter(Boolean)
                    .join(" · ") || "Chưa có thông tin liên hệ"}
                </div>
                {person.internalNotes ? (
                  <p className="text-sm sm:col-span-2">
                    Ghi chú nội bộ: {person.internalNotes}
                  </p>
                ) : null}
                {canEdit &&
                ["NOMINEE", "REPRESENTATIVE"].includes(person.role) ? (
                  <div className="sm:col-span-2">
                    <HistoricalAccountLinkControl
                      recordId={record.id}
                      personId={person.id}
                      linkedUserId={person.linkedUserId}
                      onLinked={() => {
                        void queryClient.invalidateQueries({
                          queryKey: ["historical-nomination-people", record.id],
                        });
                        void queryClient.invalidateQueries({
                          queryKey: [
                            "historical-nomination-activity",
                            record.id,
                          ],
                        });
                        void invalidateRecordVersion();
                      }}
                    />
                  </div>
                ) : null}
              </li>
            ))}
            {people.data?.length === 0 ? (
              <li className="p-4 text-sm text-[var(--theme-muted)]">
                Chưa có người liên quan.
              </li>
            ) : null}
          </ul>
          {canEdit ? (
            <form
              className="grid gap-3 rounded-lg bg-[color-mix(in_srgb,var(--theme-surface)_94%,var(--theme-border))] p-4 sm:grid-cols-2"
              onSubmit={addPerson}
            >
              <h3 className="font-semibold sm:col-span-2">
                Thêm người gửi / người liên quan
              </h3>
              <label className="space-y-1 text-sm">
                <span>Họ tên / tên tổ chức *</span>
                <input
                  className={fieldClass}
                  maxLength={255}
                  name="displayName"
                  required
                />
              </label>
              <label className="space-y-1 text-sm">
                <span>Vai trò</span>
                <select
                  className={fieldClass}
                  defaultValue="NOMINATOR"
                  name="role"
                >
                  {roles.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span>Đơn vị</span>
                <input
                  className={fieldClass}
                  maxLength={255}
                  name="organizationName"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span>Số điện thoại</span>
                <input
                  className={fieldClass}
                  maxLength={64}
                  name="phone"
                  type="tel"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span>Email</span>
                <input
                  className={fieldClass}
                  maxLength={320}
                  name="email"
                  type="email"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span>Địa chỉ liên hệ</span>
                <input className={fieldClass} maxLength={1000} name="address" />
              </label>
              <label className="space-y-1 text-sm sm:col-span-2">
                <span>Ghi chú nội bộ (không công khai)</span>
                <textarea
                  className={`${fieldClass} min-h-16`}
                  maxLength={10_000}
                  name="internalNotes"
                />
              </label>
              <button
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[var(--theme-border)] px-3 text-sm font-medium disabled:opacity-60 sm:col-span-2 sm:justify-self-end"
                disabled={busy}
              >
                <Plus aria-hidden className="h-4 w-4" /> Thêm người gửi / người
                liên quan
              </button>
            </form>
          ) : null}
        </div>
      ) : null}

      {visitedSections.has("Hình ảnh & tài liệu") ? (
        <div hidden={section !== "Hình ảnh & tài liệu"} className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="font-semibold">Tài liệu nguồn và hồ sơ đề cử</h3>
              <p className="mt-1 text-sm text-[var(--theme-muted)]">
                Tải thư đề cử, giấy tờ đối chiếu, ảnh và tài liệu liên quan đến
                hồ sơ cũ. Tệp gốc được lưu riêng; chỉ tệp được chọn mới công
                khai.
              </p>
            </div>
            {canEdit ? (
              <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md bg-primary-700 px-4 text-sm font-semibold text-white hover:bg-primary-800">
                <FilePlus2 aria-hidden className="h-4 w-4" />
                {busy ? "Đang tải…" : "Tải nhiều tệp lên"}
                <input
                  accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,application/pdf,.doc,.docx,.xls,.xlsx,.zip,.mp3,.m4a,.ogg,.wav"
                  className="sr-only"
                  disabled={busy}
                  multiple
                  onChange={(event) => {
                    const files = Array.from(event.currentTarget.files ?? []);
                    event.currentTarget.value = "";
                    void uploadFiles(files);
                  }}
                  type="file"
                />
              </label>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {mediaLinks.map((item) => (
              <HistoricalMediaEntry
                canEdit={canEdit}
                item={item}
                key={item.id}
                busy={busy}
                onUnlink={() => void unlink(item.id)}
              />
            ))}
            {mediaLinks.length === 0 ? (
              <p className="rounded-lg border border-dashed border-[var(--theme-border)] p-8 text-center text-sm text-[var(--theme-muted)] sm:col-span-2 xl:col-span-3">
                Chưa có tài liệu. Tải nhiều ảnh, video, bản scan hoặc PDF từ nút
                phía trên.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {visitedSections.has("Bằng xác lập") ? (
        <div hidden={section !== "Bằng xác lập"} className="space-y-4">
          <div>
            <h3 className="font-semibold">Bằng xác lập đã cấp</h3>
            <p className="mt-1 text-sm text-[var(--theme-muted)]">
              Ghi lại những gì đọc được từ bằng cũ. Có thể lưu thiếu số hiệu
              hoặc ngày cấp; bản xem trước không phát hành chứng nhận hay giao
              dịch blockchain.
            </p>
          </div>
          <ul className="divide-y divide-[var(--theme-border)] rounded-lg border border-[var(--theme-border)]">
            {awards.data?.map((award) => (
              <li className="space-y-4 p-4" key={award.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{award.awardName}</p>
                    <p className="mt-1 break-words text-sm text-[var(--theme-muted)]">
                      {award.certificateNumber ?? "Chưa có số hiệu"} ·{" "}
                      {award.issuedBy ?? "Chưa rõ đơn vị cấp"} ·{" "}
                      {award.issuedAt
                        ? formatDateInput(award.issuedAt)
                        : "Chưa rõ ngày cấp"}
                    </p>
                    <p className="mt-1 text-xs text-[var(--theme-muted)]">
                      Người nhận:{" "}
                      {people.data?.find(
                        (person) => person.id === award.recipientPersonId,
                      )?.displayName ?? "Chưa liên kết"}
                    </p>
                  </div>
                  {canEdit ? (
                    <button
                      className="min-h-10 rounded-md border border-[var(--theme-border)] px-3 text-sm"
                      disabled={busy}
                      onClick={() => {
                        setEditingAwardId(award.id);
                        setAwardFormOpen(true);
                      }}
                      type="button"
                    >
                      Sửa thông tin
                    </button>
                  ) : null}
                </div>
                <details className="overflow-hidden rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)]">
                  <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
                    Xem bản trình bày số hóa
                  </summary>
                  <HistoricalAwardPresentation
                    award={award}
                    recipientName={
                      people.data?.find(
                        (person) => person.id === award.recipientPersonId,
                      )?.displayName ?? null
                    }
                    subjectName={record.subjectName}
                  />
                </details>
                <div className="grid gap-2 sm:grid-cols-2">
                  {mediaLinks.filter((item) => item.awardId === award.id)
                    .length ? (
                    <h4 className="text-sm font-semibold sm:col-span-2">
                      Bản gốc / scan đính kèm
                    </h4>
                  ) : null}
                  {mediaLinks
                    .filter((item) => item.awardId === award.id)
                    .map((item) => (
                      <HistoricalMediaEntry
                        busy={busy}
                        canEdit={canEdit}
                        item={item}
                        key={item.id}
                        onUnlink={() => void unlink(item.id)}
                      />
                    ))}
                </div>
                {canEdit ? (
                  <div className="flex flex-wrap gap-2">
                    <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-[var(--theme-border)] px-3 text-sm">
                      Tải scan cho bằng này
                      <input
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        className="sr-only"
                        disabled={busy}
                        multiple
                        onChange={(event) => {
                          const files = Array.from(
                            event.currentTarget.files ?? [],
                          );
                          event.currentTarget.value = "";
                          void uploadFiles(files, "AWARD_SCAN", award.id);
                        }}
                        type="file"
                      />
                    </label>
                    {unassignedAwardScans.length > 0 ? (
                      <label className="space-y-1 text-sm">
                        <span className="sr-only">Tệp đã có trong hồ sơ</span>
                        <select
                          aria-label={`Gắn tệp đã có vào ${award.awardName}`}
                          className={`${fieldClass} min-h-10 py-2`}
                          disabled={busy}
                          defaultValue=""
                          onChange={(event) => {
                            const mediaId = event.currentTarget.value;
                            event.currentTarget.value = "";
                            if (mediaId)
                              void reuseFileForAward(award.id, mediaId);
                          }}
                        >
                          <option value="">Gắn tệp đã có trong hồ sơ…</option>
                          {unassignedAwardScans.map((item) => (
                            <option key={item.mediaId} value={item.mediaId}>
                              {item.filename ?? "Tài liệu trong hồ sơ"}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
            {awards.data?.length === 0 ? (
              <li className="p-4 text-sm text-[var(--theme-muted)]">
                Chưa nhập bằng xác lập.
              </li>
            ) : null}
          </ul>
          {canEdit ? (
            <div className="space-y-3">
              {!awardFormOpen ? (
                <button
                  className="inline-flex min-h-10 items-center gap-2 rounded-md bg-primary-700 px-3 text-sm font-semibold text-white"
                  onClick={() => {
                    setEditingAwardId(null);
                    setAwardFormRevision((revision) => revision + 1);
                    setAwardFormOpen(true);
                  }}
                  type="button"
                >
                  <Plus aria-hidden className="h-4 w-4" />
                  Thêm bằng cũ
                </button>
              ) : null}
              {awardFormOpen ? (
                <form
                  className="grid gap-3 rounded-lg bg-[color-mix(in_srgb,var(--theme-surface)_94%,var(--theme-border))] p-4 sm:grid-cols-2"
                  key={`${editingAward?.id ?? "new-award"}-${awardFormRevision}`}
                  onSubmit={saveAward}
                >
                  <h3 className="font-semibold sm:col-span-2">
                    {editingAward ? "Sửa thông tin bằng cũ" : "Thêm bằng cũ"}
                  </h3>
                  <label className="space-y-1 text-sm sm:col-span-2">
                    <span>Tên bằng xác lập / giải thưởng</span>
                    <input
                      className={fieldClass}
                      defaultValue={editingAward?.awardName ?? ""}
                      maxLength={255}
                      name="awardName"
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span>Số hiệu bằng</span>
                    <input
                      className={fieldClass}
                      defaultValue={editingAward?.certificateNumber ?? ""}
                      maxLength={128}
                      name="certificateNumber"
                    />
                  </label>
                  <HistoricalDateField
                    initialDate={editingAward?.issuedAt}
                    label="Ngày cấp (nếu biết đầy đủ)"
                    name="issuedAt"
                  />
                  <label className="space-y-1 text-sm">
                    <span>Đơn vị cấp</span>
                    <input
                      className={fieldClass}
                      defaultValue={editingAward?.issuedBy ?? ""}
                      maxLength={255}
                      name="issuedBy"
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span>Người nhận ghi trên bằng</span>
                    <select
                      aria-describedby={`award-recipient-help-${record.id}`}
                      className={fieldClass}
                      defaultValue={editingAward?.recipientPersonId ?? ""}
                      id={`award-recipient-${record.id}`}
                      name="recipientPersonId"
                    >
                      <option value="">Chưa liên kết người nhận</option>
                      {people.data?.map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.displayName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="text-xs text-[var(--theme-muted)] sm:col-span-2">
                    <p id={`award-recipient-help-${record.id}`}>
                      {people.isLoading
                        ? "Đang tải danh sách người liên quan…"
                        : people.data?.length
                          ? "Chọn tên đã thêm ở tab Người gửi & liên quan."
                          : "Chưa có người để liên kết. Thêm người ở tab “Người gửi & liên quan”, rồi quay lại chọn tên."}
                    </p>
                    {people.data?.length === 0 ? (
                      <button
                        className="mt-1 font-medium text-[var(--theme-accent)] underline underline-offset-2"
                        onClick={() => selectSection("Người gửi & liên quan")}
                        type="button"
                      >
                        Thêm người để liên kết
                      </button>
                    ) : null}
                  </div>
                  <label className="space-y-1 text-sm sm:col-span-2">
                    <span>Nguồn đối chiếu / ghi chú</span>
                    <textarea
                      className={`${fieldClass} min-h-16`}
                      defaultValue={editingAward?.provenanceNotes ?? ""}
                      maxLength={10_000}
                      name="awardNotes"
                    />
                  </label>
                  <button
                    className="min-h-10 rounded-md border border-[var(--theme-border)] px-3 text-sm"
                    disabled={busy}
                    onClick={() => {
                      setEditingAwardId(null);
                      setAwardFormOpen(false);
                      setAwardFormRevision((revision) => revision + 1);
                    }}
                    type="button"
                  >
                    Hủy
                  </button>
                  <button
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[var(--theme-border)] px-3 text-sm font-medium disabled:opacity-60 sm:col-span-2 sm:justify-self-end"
                    disabled={busy}
                  >
                    <Plus aria-hidden className="h-4 w-4" />
                    {busy
                      ? "Đang lưu…"
                      : editingAward
                        ? "Lưu thay đổi"
                        : "Lưu bằng cũ"}
                  </button>
                </form>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {visitedSections.has("Nội dung công khai") ? (
        <div hidden={section !== "Nội dung công khai"}>
          <PublicContentSection
            canEdit={canEdit}
            busy={busy}
            categories={categories.data ?? []}
            draft={draft.data ?? null}
            draftLoading={draft.isLoading}
            media={mediaLinks}
            publication={publication.data ?? null}
            publicationLoading={publication.isLoading}
            onHide={hidePublicDraft}
            onPublish={publishPublicDraft}
            onSave={(event) => void savePublicDraft(event)}
            onUploadCover={async (file) => {
              const asset = await uploadMedia(file, "PUBLIC_COVER");
              try {
                await historicalNominationApi.linkMedia(record.id, {
                  mediaId: asset.id,
                  mediaKind: "PHOTO",
                  displayOrder: mediaLinks.length,
                });
              } catch (error) {
                await mediaApi.deleteAsset(asset.id).catch(() => undefined);
                throw error;
              }
              await queryClient.invalidateQueries({
                queryKey: ["historical-nomination-media", record.id],
              });
              return asset.id;
            }}
          />
        </div>
      ) : null}

      {visitedSections.has("Lịch sử chỉnh sửa") ? (
        <div hidden={section !== "Lịch sử chỉnh sửa"} className="space-y-6">
          <section
            className="space-y-3"
            aria-labelledby="historical-activity-heading"
          >
            <h3 className="font-semibold" id="historical-activity-heading">
              Hoạt động hồ sơ
            </h3>
            {activity.isLoading ? (
              <p aria-busy="true" className="text-sm text-[var(--theme-muted)]">
                Đang tải lịch sử…
              </p>
            ) : null}
            {activity.error ? (
              <p
                role="alert"
                className="text-sm text-red-700 dark:text-red-300"
              >
                {activity.error.message}
              </p>
            ) : null}
            {activity.data?.length ? (
              <ul className="divide-y divide-[var(--theme-border)] rounded-lg border border-[var(--theme-border)]">
                {activity.data.map((item) => (
                  <li
                    className="flex flex-wrap items-start justify-between gap-3 p-3"
                    key={item.id}
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {historicalActivityLabel(item.action)}
                      </p>
                      <p className="mt-1 text-xs text-[var(--theme-muted)]">
                        {historicalActivityDescription(item.changedFields)}
                      </p>
                    </div>
                    <time
                      className="text-xs text-[var(--theme-muted)]"
                      dateTime={item.occurredAt}
                    >
                      {new Intl.DateTimeFormat("vi-VN", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(item.occurredAt))}
                    </time>
                  </li>
                ))}
              </ul>
            ) : !activity.isLoading ? (
              <p className="text-sm text-[var(--theme-muted)]">
                Chưa có hoạt động được ghi nhận.
              </p>
            ) : null}
          </section>
        </div>
      ) : null}

      {error ? (
        <p
          className="rounded-md border border-red-700 p-3 text-sm text-red-700 dark:border-red-400 dark:text-red-300"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}

function HistoricalMediaEntry({
  item,
  canEdit,
  busy,
  onUnlink,
}: {
  item: NonNullable<
    Awaited<ReturnType<typeof historicalNominationApi.listMedia>>
  >[number];
  canEdit: boolean;
  busy: boolean;
  onUnlink: () => void;
}) {
  const delivery = useQuery({
    queryKey: ["historical-media-preview", item.mediaId],
    queryFn: async () => {
      const signed = await mediaApi.signedUrl(item.mediaId);
      return signed.url.startsWith("/api/v1/media/")
        ? `${signed.url}?inline=true`
        : signed.url;
    },
    enabled:
      item.status === "ACTIVE" &&
      Boolean(
        item.mimeType?.startsWith("image/") ||
          item.mimeType?.startsWith("video/"),
      ),
    retry: false,
  });
  const isImage = item.mimeType?.startsWith("image/");
  const isVideo = item.mimeType?.startsWith("video/");

  async function openPreview() {
    const tab = window.open("about:blank", "_blank");
    if (!tab) return;
    try {
      const signed = await mediaApi.signedUrl(item.mediaId);
      tab.opener = null;
      tab.location.replace(
        signed.url.startsWith("/api/v1/media/")
          ? `${signed.url}?inline=true`
          : signed.url,
      );
    } catch {
      tab.close();
    }
  }

  return (
    <article className="overflow-hidden rounded-lg border border-[var(--theme-border)]">
      <div className="flex aspect-[16/9] items-center justify-center overflow-hidden bg-[color-mix(in_srgb,var(--theme-surface)_94%,var(--theme-border))]">
        {delivery.data && isImage ? (
          <Image
            alt={item.filename ?? "Ảnh tư liệu"}
            className="h-full w-full object-cover"
            height={360}
            loading="lazy"
            unoptimized
            width={640}
            src={delivery.data}
          />
        ) : null}
        {delivery.data && isVideo ? (
          <video
            className="h-full w-full object-contain"
            controls
            preload="metadata"
            src={delivery.data}
          />
        ) : null}
        {!isImage && !isVideo ? (
          <FileDocumentIcon mimeType={item.mimeType ?? ""} />
        ) : null}
        {(isImage || isVideo) && !delivery.data ? (
          <LoaderCircle
            aria-label="Đang tải bản xem trước"
            className="h-6 w-6 animate-spin text-[var(--theme-muted)]"
          />
        ) : null}
      </div>
      <div className="space-y-2 p-3">
        <p
          className="truncate text-sm font-medium"
          title={item.filename ?? item.mediaId}
        >
          {item.filename ?? "Tài liệu lịch sử"}
        </p>
        <p className="text-xs text-[var(--theme-muted)]">
          {item.mediaKind === "PHOTO"
            ? "Hình ảnh"
            : item.mediaKind === "VIDEO"
              ? "Video"
              : item.mediaKind === "AWARD_SCAN"
                ? "Bản scan bằng"
                : item.mediaKind === "SCANNED_DOCUMENT"
                  ? "Bản scan"
                  : "Minh chứng"}{" "}
          · {formatBytes(item.bytes)} ·{" "}
          {item.status === "ACTIVE" ? "Sẵn sàng" : "Đang xử lý"}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            className="min-h-9 rounded-md border border-[var(--theme-border)] px-3 text-xs font-medium"
            onClick={() => void openPreview()}
            type="button"
          >
            Xem trước
          </button>
          {canEdit ? (
            <button
              className="min-h-9 rounded-md px-3 text-xs text-red-700 disabled:opacity-50 dark:text-red-300"
              disabled={busy}
              onClick={onUnlink}
              type="button"
            >
              Gỡ khỏi hồ sơ
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function FileDocumentIcon({ mimeType }: { mimeType: string }) {
  return mimeType.startsWith("video/") ? (
    <Video aria-hidden className="h-8 w-8 text-[var(--theme-muted)]" />
  ) : mimeType.startsWith("image/") ? (
    <ImageIcon aria-hidden className="h-8 w-8 text-[var(--theme-muted)]" />
  ) : (
    <FilePlus2 aria-hidden className="h-8 w-8 text-[var(--theme-muted)]" />
  );
}

function PublicContentSection({
  canEdit,
  busy,
  categories,
  draft,
  draftLoading,
  media,
  publication,
  publicationLoading,
  onHide,
  onPublish,
  onSave,
  onUploadCover,
}: {
  canEdit: boolean;
  busy: boolean;
  categories: Awaited<ReturnType<typeof publicApi.categories>>;
  draft: Awaited<ReturnType<typeof historicalNominationApi.publicContentDraft>>;
  draftLoading: boolean;
  media: Awaited<ReturnType<typeof historicalNominationApi.listMedia>>;
  publication: Awaited<ReturnType<typeof historicalNominationApi.publication>>;
  publicationLoading: boolean;
  onHide: () => void;
  onPublish: () => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onUploadCover: (file: File) => Promise<string>;
}) {
  if (draftLoading)
    return (
      <p aria-busy="true" className="text-sm text-[var(--theme-muted)]">
        Đang tải nội dung dự kiến…
      </p>
    );
  return (
    <PublicContentDraftEditor
      key={`${draft?.id ?? "new"}-${draft?.revision ?? 0}`}
      canEdit={canEdit}
      busy={busy}
      categories={categories}
      draft={draft}
      media={media}
      publication={publication}
      publicationLoading={publicationLoading}
      onHide={onHide}
      onPublish={onPublish}
      onSave={onSave}
      onUploadCover={onUploadCover}
    />
  );
}

function PublicContentDraftEditor({
  canEdit,
  busy,
  categories,
  draft,
  media,
  publication,
  publicationLoading,
  onHide,
  onPublish,
  onSave,
  onUploadCover,
}: Omit<Parameters<typeof PublicContentSection>[0], "draftLoading">) {
  const categoryNames = categoryLabels(categories);
  const missingPublicationFields = [
    !draft?.title?.trim() && "Tiêu đề công khai",
    !draft?.slug?.trim() && "Đường dẫn dự kiến",
    !draft?.shortDescription?.trim() && "Mô tả ngắn",
    !draft?.categoryId && "Danh mục",
  ].filter(Boolean);
  const availableMedia = media.filter(
    (item) =>
      item.uploadPurpose !== "PUBLIC_COVER" &&
      ["PHOTO", "VIDEO", "AWARD_SCAN"].includes(item.mediaKind),
  );
  const [selectedMediaIds, setSelectedMediaIds] = useState<string[]>(() => {
    const availableIds = new Set(availableMedia.map((item) => item.mediaId));
    return (draft?.publicMediaIds ?? []).filter((id) => availableIds.has(id));
  });
  const photos = media.filter(
    (item) =>
      item.mediaKind === "PHOTO" &&
      item.mimeType?.startsWith("image/") &&
      (item.status == null || item.status === "ACTIVE"),
  );
  const initialCover = photos.find(
    (item) => item.mediaId === draft?.coverMediaId,
  );
  const [chosenMode, setCoverMode] = useState<"AUTO" | "EXISTING" | "CUSTOM">();
  const coverMode =
    chosenMode ??
    (initialCover
      ? initialCover.uploadPurpose === "PUBLIC_COVER"
        ? "CUSTOM"
        : "EXISTING"
      : "AUTO");
  const [chosenCoverId, setCoverId] = useState<string>();
  const coverId = chosenCoverId ?? initialCover?.mediaId ?? "";
  const [coverUpload, setCoverUpload] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState(draft?.title ?? "");
  const [previewCategory, setPreviewCategory] = useState(
    draft?.categoryId ?? "",
  );
  const [previewSummary, setPreviewSummary] = useState(
    draft?.shortDescription ?? "",
  );
  const [previewDescription, setPreviewDescription] = useState(
    draft?.fullDescription ?? "",
  );
  const [previewAuthor, setPreviewAuthor] = useState(
    draft?.authorDisplayName ?? "",
  );
  const [previewVideo, setPreviewVideo] = useState(
    draft?.featuredVideoMediaId ?? "",
  );
  const [previewMobile, setPreviewMobile] = useState(false);
  const previewCoverId = coverMode === "AUTO" ? "" : coverId;
  const presentationIds = [
    ...new Set([previewCoverId, previewVideo, ...selectedMediaIds]),
  ];
  const previewItems = presentationIds.flatMap((id) => {
    const item = media.find((candidate) => candidate.mediaId === id);
    return item &&
      item.accessScope !== "INTERNAL" &&
      (item.mimeType?.startsWith("image/") ||
        item.mimeType?.startsWith("video/"))
      ? [item]
      : [];
  });
  const deliveries = useQueries({
    queries: previewItems.map((item) => ({
      queryKey: ["historical-publication-preview", item.mediaId],
      queryFn: async () => {
        const { url } = await mediaApi.signedUrl(item.mediaId);
        if (!url.startsWith("/api/v1/media/")) return url;
        return url + (url.includes("?") ? "&" : "?") + "inline=true";
      },
      retry: false,
    })),
  });
  const previewMedia: PublicWorkDetailMedia[] = previewItems.flatMap(
    (item, index) => {
      const url = deliveries[index]?.data;
      if (!url) return [];
      return [
        {
          id: item.mediaId,
          kind: item.mimeType?.startsWith("video/") ? "VIDEO" : "IMAGE",
          sortOrder: index,
          caption: null,
          altText: null,
          url,
          mimeType: item.mimeType ?? null,
          width: item.width ?? null,
          height: item.height ?? null,
          durationMs: item.durationMs ?? null,
          isThumbnail: item.mediaId === previewCoverId,
          posterUrl: null,
          controlsPreset: "FULL",
          fitMode: "CONTAIN",
          autoplay: false,
          loop: false,
          muted: false,
        },
      ];
    },
  );
  const preview: PublicWorkDetail = {
    id: draft?.id ?? "publication-preview",
    slug: draft?.slug ?? "",
    canonicalSlug: draft?.slug ?? "",
    title: previewTitle.trim() || "Tiêu đề công khai",
    categoryName: categoryNames.get(previewCategory) ?? "Danh mục",
    categorySlug:
      categories.find((category) => category.id === previewCategory)?.slug ??
      "",
    shortDescription: previewSummary.trim(),
    fullDescription: previewDescription.trim() || null,
    authorDisplayName: previewAuthor.trim() || null,
    organizationDisplayName: null,
    tags: [],
    publishedAt: "",
    visibility: "PRIVATE",
    certificate: null,
    proof: null,
    media: previewMedia,
    relatedWorks: [],
    redirected: false,
    isHistorical: true,
  };
  const videos = media.filter((item) => item.mediaKind === "VIDEO");

  function toggleMedia(mediaId: string, checked: boolean) {
    setSelectedMediaIds((current) => {
      if (!checked) return current.filter((id) => id !== mediaId);
      return current.includes(mediaId) ? current : [...current, mediaId];
    });
  }

  function moveMedia(mediaId: string, offset: -1 | 1) {
    setSelectedMediaIds((current) => {
      const index = current.indexOf(mediaId);
      const nextIndex = index + offset;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }
      const next = [...current];
      const currentId = next[index];
      const targetId = next[nextIndex];
      if (currentId === undefined || targetId === undefined) return current;
      next[index] = targetId;
      next[nextIndex] = currentId;
      return next;
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-semibold">Nội dung dự kiến công bố</h3>
        <p className="mt-1 max-w-3xl text-sm text-[var(--theme-muted)]">
          Lưu nội dung riêng trước. Chỉ thao tác Công bố mới áp dụng thay đổi
          lên trang công khai.
        </p>
      </div>
      {canEdit ? (
        <form
          className="space-y-5"
          key={`${draft?.id ?? "new"}-${draft?.revision ?? 0}`}
          onSubmit={onSave}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm">
              <span>Đường dẫn dự kiến</span>
              <input
                className={fieldClass}
                defaultValue={draft?.slug ?? ""}
                maxLength={180}
                name="slug"
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                title="Dùng chữ thường không dấu, số và dấu gạch ngang; ví dụ nghe-nhan-nguyen-an"
                placeholder="nghe-nhan-nguyen-an"
              />
            </label>
            <label className="space-y-1.5 text-sm">
              <span>Danh mục</span>
              <select
                className={fieldClass}
                defaultValue={draft?.categoryId ?? ""}
                name="publicCategoryId"
                onChange={(event) => setPreviewCategory(event.target.value)}
              >
                <option value="">Chọn danh mục</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {categoryNames.get(category.id) ?? category.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5 text-sm sm:col-span-2">
              <span>Tiêu đề công khai</span>
              <input
                className={fieldClass}
                defaultValue={draft?.title ?? ""}
                maxLength={255}
                name="publicTitle"
                onChange={(event) => setPreviewTitle(event.target.value)}
                placeholder="Tên hiển thị trên Danh sách đề cử"
              />
            </label>
            <label className="space-y-1.5 text-sm sm:col-span-2">
              <span>Mô tả ngắn</span>
              <textarea
                className={`${fieldClass} min-h-20`}
                defaultValue={draft?.shortDescription ?? ""}
                maxLength={500}
                name="shortDescription"
                onChange={(event) => setPreviewSummary(event.target.value)}
              />
            </label>
            <label className="space-y-1.5 text-sm sm:col-span-2">
              <span>Nội dung chi tiết</span>
              <textarea
                className={`${fieldClass} min-h-36`}
                defaultValue={draft?.fullDescription ?? ""}
                maxLength={50_000}
                name="fullDescription"
                onChange={(event) => setPreviewDescription(event.target.value)}
              />
            </label>
            <label className="space-y-1.5 text-sm sm:col-span-2">
              <span>Tên tác giả / người biên tập hiển thị</span>
              <input
                className={fieldClass}
                defaultValue={draft?.authorDisplayName ?? ""}
                maxLength={255}
                name="authorDisplayName"
                onChange={(event) => setPreviewAuthor(event.target.value)}
              />
            </label>
          </div>
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <fieldset
              className="min-w-0 space-y-3 text-sm"
              disabled={coverUpload}
            >
              <legend className="font-semibold">Hình đại diện công khai</legend>
              {(
                [
                  ["AUTO", "Tạo ảnh đại diện tự động"],
                  ["EXISTING", "Chọn ảnh có sẵn"],
                  ["CUSTOM", "Tải ảnh riêng để công bố"],
                ] as const
              ).map(([mode, label]) => (
                <label
                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-[var(--theme-border)] px-3 py-2 has-checked:border-[var(--theme-accent)] has-checked:bg-[var(--theme-surface)]"
                  key={mode}
                >
                  <input
                    checked={coverMode === mode}
                    name="coverMode"
                    onChange={() => {
                      setCoverMode(mode);
                      setCoverId("");
                      setCoverError(null);
                    }}
                    type="radio"
                    value={mode}
                  />
                  {label}
                </label>
              ))}
              {coverMode === "EXISTING" ? (
                <label className="block space-y-1">
                  <span>Ảnh bạn cho phép dùng công khai</span>
                  <select
                    className={fieldClass}
                    value={coverId}
                    onChange={(event) => setCoverId(event.target.value)}
                    required
                  >
                    <option value="">Chọn ảnh</option>
                    {photos
                      .filter((item) => item.uploadPurpose !== "PUBLIC_COVER")
                      .map((item) => (
                        <option key={item.mediaId} value={item.mediaId}>
                          {item.filename ?? item.mediaId.slice(0, 8)}
                        </option>
                      ))}
                  </select>
                  {!photos.some(
                    (item) => item.uploadPurpose !== "PUBLIC_COVER",
                  ) ? (
                    <p>
                      Hồ sơ chưa có ảnh phù hợp. Bạn có thể chọn tạo ảnh tự
                      động.
                    </p>
                  ) : null}
                </label>
              ) : null}
              {coverMode === "CUSTOM" ? (
                <div className="space-y-2">
                  {photos.some(
                    (item) => item.uploadPurpose === "PUBLIC_COVER",
                  ) ? (
                    <label className="block space-y-1">
                      <span>Ảnh công bố đã tải</span>
                      <select
                        className={fieldClass}
                        value={coverId}
                        onChange={(event) => setCoverId(event.target.value)}
                      >
                        <option value="">Chọn ảnh</option>
                        {photos
                          .filter(
                            (item) => item.uploadPurpose === "PUBLIC_COVER",
                          )
                          .map((item) => (
                            <option key={item.mediaId} value={item.mediaId}>
                              {item.filename ?? item.mediaId}
                            </option>
                          ))}
                      </select>
                    </label>
                  ) : null}
                  <label className="flex cursor-pointer flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-[var(--theme-border)] bg-[var(--theme-surface)] p-4 focus-within:outline-2 focus-within:outline-offset-2">
                    <span className="min-w-0">
                      <span className="block font-semibold">Ảnh bìa riêng</span>
                      <span className="mt-1 block text-xs text-[var(--theme-muted)]">
                        {coverUpload
                          ? "Đang kiểm tra ảnh…"
                          : (photos.find((item) => item.mediaId === coverId)
                              ?.filename ??
                            "JPEG, PNG hoặc WebP · tối đa 5 MB")}
                      </span>
                    </span>
                    <span className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--theme-border)] px-4 font-semibold text-[var(--theme-accent)]">
                      {coverUpload ? (
                        <LoaderCircle
                          aria-hidden
                          className="size-4 animate-spin"
                        />
                      ) : (
                        <ImageIcon aria-hidden className="size-4" />
                      )}
                      {coverId ? "Đổi ảnh" : "Chọn ảnh"}
                    </span>
                    <input
                      aria-label="Chọn ảnh JPEG, PNG hoặc WebP"
                      accept="image/jpeg,image/png,image/webp"
                      className="sr-only"
                      type="file"
                      onChange={async (event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        setCoverError(null);
                        setCoverUpload(true);
                        try {
                          setCoverId(await onUploadCover(file));
                        } catch {
                          setCoverError(
                            "Không tải được ảnh bìa. Hãy thử lại hoặc chọn tạo ảnh tự động.",
                          );
                        } finally {
                          setCoverUpload(false);
                        }
                      }}
                    />
                  </label>
                </div>
              ) : null}
              {coverError ? <p role="alert">{coverError}</p> : null}
              <input name="coverMediaId" type="hidden" value={coverId} />
            </fieldset>
            <label className="space-y-1.5 text-sm">
              <span>Video nổi bật</span>
              <select
                className={fieldClass}
                defaultValue={draft?.featuredVideoMediaId ?? ""}
                name="featuredVideoMediaId"
                onChange={(event) => setPreviewVideo(event.target.value)}
              >
                <option value="">Không chọn video</option>
                {videos.map((item) => (
                  <option key={item.mediaId} value={item.mediaId}>
                    {item.filename ?? item.mediaId.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">
              Media đề xuất hiển thị công khai
            </legend>
            <p className="text-xs text-[var(--theme-muted)]">
              Chọn tệp phù hợp và sắp xếp thứ tự gallery. Tệp gốc vẫn riêng tư;
              bản scan bằng chỉ hiển thị công khai nếu bạn chủ động chọn và xuất
              bản nội dung này.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {selectedMediaIds.map((mediaId) => (
                <input
                  key={mediaId}
                  name="publicMedia"
                  type="hidden"
                  value={mediaId}
                />
              ))}
              {availableMedia.map((item) => {
                const order = selectedMediaIds.indexOf(item.mediaId);
                return (
                  <div
                    className="rounded-md border border-[var(--theme-border)] p-3"
                    key={item.mediaId}
                  >
                    <label className="flex min-h-11 items-center gap-3 text-sm">
                      <input
                        checked={order >= 0}
                        onChange={(event) =>
                          toggleMedia(item.mediaId, event.currentTarget.checked)
                        }
                        type="checkbox"
                      />
                      <span className="min-w-0">
                        <span className="block truncate">
                          {item.filename ?? "Tài liệu lịch sử"}
                        </span>
                        <span className="block text-xs text-[var(--theme-muted)]">
                          {item.mediaKind === "PHOTO"
                            ? "Ảnh"
                            : item.mediaKind === "VIDEO"
                              ? "Video"
                              : item.mediaKind === "AWARD_SCAN"
                                ? "Bản scan bằng cũ · công khai nếu chọn và xuất bản"
                                : "Tài liệu"}
                        </span>
                      </span>
                    </label>
                    {order >= 0 ? (
                      <div className="mt-2 flex items-center justify-between gap-2 border-t border-[var(--theme-border)] pt-2 text-xs text-[var(--theme-muted)]">
                        <span>Vị trí gallery {order + 1}</span>
                        <div className="flex gap-1">
                          <button
                            aria-label={`Đưa ${item.filename ?? "tài liệu"} lên trước`}
                            className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-md border border-[var(--theme-border)] disabled:opacity-40"
                            disabled={order === 0}
                            onClick={() => moveMedia(item.mediaId, -1)}
                            type="button"
                          >
                            <ArrowUp aria-hidden className="h-4 w-4" />
                          </button>
                          <button
                            aria-label={`Đưa ${item.filename ?? "tài liệu"} xuống sau`}
                            className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-md border border-[var(--theme-border)] disabled:opacity-40"
                            disabled={order === selectedMediaIds.length - 1}
                            onClick={() => moveMedia(item.mediaId, 1)}
                            type="button"
                          >
                            <ArrowDown aria-hidden className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </fieldset>
          <div className="flex flex-col gap-3 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-xs text-[var(--theme-muted)]">
              {draft
                ? `Bản ${draft.revision} · Bản nháp`
                : "Chưa có bản nháp nội dung"}
            </span>
            <Button
              type="submit"
              className="w-full sm:w-56"
              disabled={
                busy || coverUpload || (coverMode !== "AUTO" && !coverId)
              }
            >
              {busy ? "Đang lưu…" : "Lưu nội dung dự kiến"}
            </Button>
          </div>
        </form>
      ) : (
        <div className="rounded-lg border border-[var(--theme-border)] p-4">
          <p className="text-sm font-medium">
            {draft?.title ?? "Chưa có nội dung dự kiến"}
          </p>
          <p className="mt-2 text-sm text-[var(--theme-muted)]">
            {draft?.shortDescription ??
              "Nội dung công khai chưa được biên tập."}
          </p>
          <p className="mt-3 text-xs text-[var(--theme-muted)]">
            Trạng thái: {draft?.status ?? "Chưa tạo"} · bản{" "}
            {draft?.revision ?? 0}
          </p>
        </div>
      )}
      <section
        aria-labelledby="publication-cover-preview"
        className="min-w-0 overflow-hidden rounded-lg border border-[var(--theme-border)]"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--theme-border)] bg-[var(--theme-surface)] p-4">
          <h4 className="text-sm font-semibold" id="publication-cover-preview">
            Xem trước trang công khai
          </h4>
          <div className="flex flex-wrap gap-2">
            <Button
              aria-pressed={!previewMobile}
              variant={!previewMobile ? "default" : "outline"}
              onClick={() => setPreviewMobile(false)}
            >
              Máy tính
            </Button>
            <Button
              aria-pressed={previewMobile}
              variant={previewMobile ? "default" : "outline"}
              onClick={() => setPreviewMobile(true)}
            >
              Điện thoại
            </Button>
          </div>
        </div>
        <div className="bg-[var(--theme-elevated)] p-2 sm:p-4">
          <div
            className={`mx-auto w-full min-w-0 overflow-hidden rounded-lg border border-[var(--theme-border)] ${previewMobile ? "max-w-[24rem]" : ""}`}
          >
            <PublicWorkPresentation
              key={`${previewCoverId}:${previewVideo}`}
              preview
              detail={preview}
            />
          </div>
        </div>
      </section>
      {canEdit ? (
        <div className="flex flex-col gap-3 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 text-sm">
            <p className="font-semibold">
              {publication?.publicationStatus === "PUBLISHED"
                ? "Đang hiển thị công khai"
                : publication?.publicationStatus === "HIDDEN"
                  ? "Đang ẩn khỏi trang công khai"
                  : "Chưa xuất bản"}
            </p>
            <p className="mt-1 text-[var(--theme-muted)]">
              {!missingPublicationFields.length
                ? "Nội dung đã có thông tin bắt buộc để xuất bản."
                : `Cần bổ sung và lưu: ${missingPublicationFields.join(", ")}.`}
            </p>
          </div>
          {publication?.publicationStatus === "PUBLISHED" ? (
            <Button
              variant="outline"
              className="w-full sm:w-56 sm:shrink-0"
              disabled={busy || publicationLoading}
              onClick={onHide}
              type="button"
            >
              Ẩn khỏi trang công khai
            </Button>
          ) : (
            <Button
              className="w-full sm:w-56 sm:shrink-0"
              disabled={
                busy ||
                coverUpload ||
                publicationLoading ||
                missingPublicationFields.length > 0
              }
              onClick={onPublish}
              type="button"
            >
              {busy ? "Đang xuất bản…" : "Xuất bản"}
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--theme-border)] p-3">
      <p className="text-xs text-[var(--theme-muted)]">{label}</p>
      <p className="mt-1 break-words text-sm">{value}</p>
    </div>
  );
}

function HistoricalAwardPresentation({
  award,
  recipientName,
  subjectName,
}: {
  award: HistoricalAward;
  recipientName: string | null;
  subjectName: string | null;
}) {
  return (
    <div className="border-t border-[var(--theme-border)] p-4 sm:p-6">
      <HistoricalCertificatePresentation
        title={award.awardName}
        subject={subjectName}
        recipient={recipientName}
        number={award.certificateNumber}
        issuedAt={award.issuedAt ? formatDateInput(award.issuedAt) : null}
        issuer={award.issuedBy}
      />
    </div>
  );
}
