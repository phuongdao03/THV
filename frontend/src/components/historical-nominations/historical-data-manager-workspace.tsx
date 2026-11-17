"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  FilePlus2,
  MoreHorizontal,
  Search,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { HistoricalAwardLibrary } from "@/components/historical-nominations/historical-award-library";
import {
  dossierApi,
  historicalNominationApi,
  publicWorkAdminApi,
} from "@/lib/api/client";
import type { HistoricalNomination } from "@/lib/api/historical-nomination-types";
import { categoryLabels } from "@/lib/categories";

const publicationStatusLabels: Record<string, string> = {
  PRIVATE: "Chưa công khai",
  PENDING_PUBLICATION: "Chưa đăng",
  PUBLISHED: "Đã công bố",
  HIDDEN: "Đã ẩn",
  ARCHIVED: "Đã lưu trữ",
};

const createRequestStorageKey = "data-manager.historical-create-request-id";

export function HistoricalDataManagerWorkspace() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"records" | "awards">("records");
  const [statusFilter, setStatusFilter] = useState("");
  const [year, setYear] = useState("");
  const [dossierTypeId, setDossierTypeId] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] =
    useState<HistoricalNomination | null>(null);
  const creatingRecord = useRef(false);
  const creationRequestId = useRef<string | null>(null);

  const records = useQuery({
    queryKey: [
      "historical-nominations",
      query,
      statusFilter,
      year,
      dossierTypeId,
    ],
    queryFn: () =>
      historicalNominationApi.list({
        query,
        pageSize: 100,
        status: statusFilter === "DRAFT" ? "DRAFT" : undefined,
        publicationStatus:
          statusFilter && statusFilter !== "DRAFT" ? statusFilter : undefined,
        year: year ? Number(year) : undefined,
        dossierTypeId: dossierTypeId || undefined,
      }),
    enabled: view === "records",
  });
  const categories = useQuery({
    queryKey: ["historical-record-source-categories"],
    queryFn: publicWorkAdminApi.categories,
    enabled: view === "records",
  });
  const dossierTypes = useQuery({
    queryKey: ["historical-record-dossier-types"],
    queryFn: dossierApi.listTypes,
    enabled: view === "records",
  });
  const labels = categoryLabels(categories.data ?? []);
  const dossierTypeNames = new Map(
    (dossierTypes.data ?? []).map((dossierType) => [
      dossierType.id,
      dossierType.name,
    ]),
  );
  const sortedRecords = [...(records.data ?? [])].sort(
    (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
  );

  function getCreationRequestId() {
    if (creationRequestId.current) return creationRequestId.current;
    try {
      const stored = window.sessionStorage.getItem(createRequestStorageKey);
      if (stored) {
        creationRequestId.current = stored;
        return stored;
      }
    } catch {
      // Continue with an in-memory key when browser storage is unavailable.
    }
    const requestId = window.crypto.randomUUID();
    creationRequestId.current = requestId;
    try {
      window.sessionStorage.setItem(createRequestStorageKey, requestId);
    } catch {
      // The API still receives the same key for retries within this page.
    }
    return requestId;
  }

  function clearCreationRequestId() {
    creationRequestId.current = null;
    try {
      window.sessionStorage.removeItem(createRequestStorageKey);
    } catch {
      // Storage may be unavailable in restricted browser contexts.
    }
  }

  async function createRecord() {
    if (creatingRecord.current) return;
    creatingRecord.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const created = await historicalNominationApi.create(
        {},
        getCreationRequestId(),
      );
      clearCreationRequestId();
      queryClient.setQueryData(["historical-nomination", created.id], created);
      await queryClient.invalidateQueries({
        queryKey: ["historical-nominations"],
      });
      router.push("/data-manager/records/" + encodeURIComponent(created.id));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Không tạo được hồ sơ.",
      );
    } finally {
      creatingRecord.current = false;
      setBusy(false);
    }
  }

  function categoryName(record: HistoricalNomination) {
    if (record.dossierTypeId) {
      return dossierTypeNames.get(record.dossierTypeId) ?? "Loại hồ sơ cũ";
    }
    if (record.categoryId) {
      return (
        labels.get(record.categoryId) ??
        record.legacyCategoryLabel ??
        "Danh mục chưa ánh xạ"
      );
    }
    return record.legacyCategoryLabel ?? "Chưa phân loại";
  }

  function statusLabel(record: HistoricalNomination) {
    if (record.archiveStatus === "ARCHIVED") return "Đã lưu trữ";
    if (record.publicationStatus === "PUBLISHED") return "Đã công bố";
    if (record.publicationStatus === "HIDDEN") return "Đã ẩn";
    if (
      record.verificationStatus === "DRAFT" &&
      record.publicationStatus !== "PUBLISHED"
    ) {
      return "Bản nháp";
    }
    return (
      publicationStatusLabels[record.publicationStatus] ?? "Chưa công khai"
    );
  }

  async function deleteDraft() {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    setError(null);
    try {
      await historicalNominationApi.deleteDraft(
        pendingDelete.id,
        pendingDelete.updatedAt,
      );
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["historical-nominations"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["historical-nomination-dashboard-summary"],
        }),
      ]);
      setPendingDelete(null);
      setNotice("Đã xóa bản nháp.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Không xóa được bản nháp.",
      );
    } finally {
      setDeleting(false);
    }
  }

  function deleteDraftUnavailableReason(record: HistoricalNomination) {
    if (record.archiveStatus === "ARCHIVED")
      return "Hồ sơ đã lưu trữ nên không thể xóa như bản nháp.";
    if (["PUBLISHED", "HIDDEN"].includes(record.publicationStatus))
      return "Hồ sơ đã công khai hoặc đang ẩn; chỉ bản nháp chưa công khai mới xóa được.";
    if (record.verificationStatus !== "DRAFT")
      return "Chỉ xóa được hồ sơ chưa gửi.";
    return "Chỉ xóa được bản nháp chưa công khai.";
  }

  const viewNavigation = (
    <nav
      aria-label="Tra cứu hồ sơ lịch sử"
      className="flex flex-wrap gap-2 border-b border-[var(--theme-border)] pb-3"
    >
      <button
        aria-pressed={view === "records"}
        className={
          view === "records"
            ? "min-h-10 rounded-md bg-primary-700 px-4 text-sm font-semibold text-white"
            : "min-h-10 rounded-md border border-[var(--theme-border)] px-4 text-sm font-semibold"
        }
        onClick={() => setView("records")}
        type="button"
      >
        Hồ sơ đề cử
      </button>
      <button
        aria-pressed={view === "awards"}
        className={
          view === "awards"
            ? "min-h-10 rounded-md bg-primary-700 px-4 text-sm font-semibold text-white"
            : "min-h-10 rounded-md border border-[var(--theme-border)] px-4 text-sm font-semibold"
        }
        onClick={() => setView("awards")}
        type="button"
      >
        Bằng xác lập cũ
      </button>
    </nav>
  );

  if (view === "awards") {
    return (
      <section
        className="space-y-5"
        aria-labelledby="historical-records-heading"
      >
        <header>
          <p className="text-sm text-[var(--theme-muted)]">
            Tra cứu các bằng đã ghi nhận trong hồ sơ đề cử lịch sử.
          </p>
          <h2
            className="mt-1 text-2xl font-semibold"
            id="historical-records-heading"
          >
            Bằng xác lập cũ
          </h2>
        </header>
        {viewNavigation}
        <p className="text-sm text-[var(--theme-muted)]">
          Bản scan nguồn vẫn là tư liệu riêng của hồ sơ, không tự chuyển sang
          kho scan công khai.
        </p>
        <HistoricalAwardLibrary
          onOpenRecord={(recordId) =>
            router.push("/data-manager/records/" + encodeURIComponent(recordId))
          }
        />
      </section>
    );
  }

  return (
    <section className="space-y-5" aria-labelledby="historical-records-heading">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-[var(--theme-muted)]">
            Tìm và tiếp tục hoàn thiện hồ sơ lịch sử.
          </p>
          <h2
            className="mt-1 text-2xl font-semibold"
            id="historical-records-heading"
          >
            Hồ sơ đề cử lịch sử
          </h2>
        </div>
        <button
          className="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary-700 px-4 text-sm font-semibold text-white hover:bg-primary-800 disabled:opacity-60"
          disabled={busy}
          onClick={() => void createRecord()}
          type="button"
        >
          <FilePlus2 aria-hidden className="h-4 w-4" />
          {busy ? "Đang tạo…" : "Thêm hồ sơ"}
        </button>
      </header>

      {viewNavigation}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label className="relative block sm:col-span-2 lg:col-span-1">
          <Search
            aria-hidden
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--theme-muted)]"
          />
          <input
            aria-label="Tìm hồ sơ"
            className="min-h-11 w-full rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] py-2 pl-9 pr-3 text-sm"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tên, mã THV hoặc mã HIST"
            value={query}
          />
        </label>
        <select
          aria-label="Lọc trạng thái"
          className="min-h-11 min-w-0 rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 text-sm"
          onChange={(event) => setStatusFilter(event.target.value)}
          value={statusFilter}
        >
          <option value="">Mọi trạng thái</option>
          <option value="DRAFT">Bản nháp</option>
          <option value="PRIVATE">Chưa công khai</option>
          <option value="PENDING_PUBLICATION">Chưa đăng</option>
          <option value="PUBLISHED">Đã công bố</option>
          <option value="HIDDEN">Đã ẩn</option>
        </select>
        <input
          aria-label="Lọc theo năm"
          className="min-h-11 min-w-0 rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 text-sm"
          max="2200"
          min="1"
          onChange={(event) => setYear(event.target.value)}
          placeholder="Năm đề cử"
          type="number"
          value={year}
        />
        <select
          aria-label="Lọc theo loại hồ sơ"
          className="min-h-11 min-w-0 rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 text-sm"
          onChange={(event) => setDossierTypeId(event.target.value)}
          value={dossierTypeId}
        >
          <option value="">Mọi loại hồ sơ</option>
          {dossierTypes.data?.map((dossierType) => (
            <option key={dossierType.id} value={dossierType.id}>
              {dossierType.name}
            </option>
          ))}
        </select>
      </div>

      {notice ? (
        <p className="text-sm text-emerald-800" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}
      {records.isLoading ? (
        <div
          aria-busy="true"
          aria-label="Đang tải hồ sơ"
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
        >
          {[0, 1, 2].map((item) => (
            <div
              className="h-32 animate-pulse rounded-lg border border-[var(--theme-border)] bg-[color-mix(in_srgb,var(--theme-surface)_94%,var(--theme-border))]"
              key={item}
            />
          ))}
        </div>
      ) : records.error ? (
        <p
          role="alert"
          className="rounded-md border border-red-700 p-3 text-sm text-red-700 dark:border-red-400 dark:text-red-300"
        >
          {records.error.message}
        </p>
      ) : sortedRecords.length ? (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {sortedRecords.map((record) => {
            const canDelete =
              record.verificationStatus === "DRAFT" &&
              ["PRIVATE", "PENDING_PUBLICATION"].includes(
                record.publicationStatus,
              ) &&
              record.archiveStatus === "ACTIVE";
            return (
              <li
                className="relative rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4 transition-colors hover:bg-[color-mix(in_srgb,var(--theme-surface)_94%,var(--theme-border))]"
                key={record.id}
              >
                <Link
                  className="block min-h-28 pr-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--theme-accent)]"
                  href={
                    "/data-manager/records/" + encodeURIComponent(record.id)
                  }
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="min-w-0 truncate font-semibold">
                      {record.title || "Hồ sơ chưa đặt tên"}
                    </h3>
                    <span className="shrink-0 rounded-full border border-[var(--theme-border)] px-2 py-0.5 text-xs">
                      {statusLabel(record)}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-sm text-[var(--theme-muted)]">
                    {record.code}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-x-2 gap-y-1 text-xs text-[var(--theme-muted)]">
                    <span>
                      {record.subjectName || "Chưa có đối tượng ghi nhận"}
                    </span>
                    <span aria-hidden>·</span>
                    <span>{categoryName(record)}</span>
                    <span aria-hidden>·</span>
                    <span>{record.nominationYear ?? "Chưa rõ năm"}</span>
                    <span aria-hidden>·</span>
                    <span>{record.photoVideoCount ?? 0} ảnh/video</span>
                    <span aria-hidden>·</span>
                    <span>{record.documentCount ?? 0} tài liệu</span>
                    <span aria-hidden>·</span>
                    <span>{record.awardCount ?? 0} bằng</span>
                  </div>
                  <p className="mt-2 text-xs text-[var(--theme-muted)]">
                    Cập nhật{" "}
                    {new Intl.DateTimeFormat("vi-VN", {
                      dateStyle: "medium",
                    }).format(new Date(record.updatedAt))}
                  </p>
                </Link>
                <details className="absolute right-3 top-3">
                  <summary
                    aria-label={
                      "Thao tác hồ sơ " + (record.title || record.code)
                    }
                    className="grid min-h-9 min-w-9 cursor-pointer list-none place-items-center rounded-md text-[var(--theme-muted)] hover:bg-[var(--theme-border)]"
                  >
                    <MoreHorizontal aria-hidden className="size-4" />
                  </summary>
                  <div className="absolute right-0 z-10 mt-1 min-w-44 rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] p-1 shadow-lg">
                    <Link
                      className="block min-h-10 rounded px-3 py-2 text-sm hover:bg-[color-mix(in_srgb,var(--theme-surface)_94%,var(--theme-border))]"
                      href={
                        "/data-manager/records/" + encodeURIComponent(record.id)
                      }
                    >
                      Tiếp tục chỉnh sửa
                    </Link>
                    {canDelete ? (
                      <button
                        className="flex min-h-10 w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-red-700 hover:bg-[color-mix(in_srgb,var(--theme-surface)_94%,var(--theme-border))] dark:text-red-300"
                        onClick={() => setPendingDelete(record)}
                        type="button"
                      >
                        <Trash2 aria-hidden className="size-4" />
                        Xóa bản nháp
                      </button>
                    ) : (
                      <p
                        className="px-3 py-2 text-xs text-[var(--theme-muted)]"
                        role="note"
                      >
                        {deleteDraftUnavailableReason(record)}
                      </p>
                    )}
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="rounded-lg border border-dashed border-[var(--theme-border)] p-7 text-center">
          <Archive
            aria-hidden
            className="mx-auto size-7 text-[var(--theme-muted)]"
          />
          <p className="mt-2 font-medium">Chưa có hồ sơ phù hợp</p>
          <p className="mt-1 text-sm text-[var(--theme-muted)]">
            Bạn có thể bắt đầu bằng một hồ sơ nháp mới.
          </p>
        </div>
      )}

      {pendingDelete ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <section
            aria-describedby="delete-historical-draft-description"
            aria-labelledby="delete-historical-draft-title"
            aria-modal="true"
            className="w-full max-w-md rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-5 shadow-xl"
            role="alertdialog"
          >
            <h2
              className="text-lg font-semibold"
              id="delete-historical-draft-title"
            >
              Xóa bản nháp?
            </h2>
            <p
              className="mt-2 text-sm text-[var(--theme-muted)]"
              id="delete-historical-draft-description"
            >
              Bạn có muốn xóa bản nháp này? Hồ sơ sẽ không còn xuất hiện trong
              danh sách làm việc.
            </p>
            {error ? (
              <p
                className="mt-3 text-sm text-red-700 dark:text-red-300"
                role="alert"
              >
                {error}
              </p>
            ) : null}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                className="min-h-10 rounded-md border border-[var(--theme-border)] px-3 text-sm"
                autoFocus
                disabled={deleting}
                onClick={() => setPendingDelete(null)}
                type="button"
              >
                Hủy
              </button>
              <button
                className="inline-flex min-h-10 items-center gap-2 rounded-md bg-red-700 px-3 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60 dark:bg-red-300 dark:text-red-950 dark:hover:bg-red-200"
                disabled={deleting}
                onClick={() => void deleteDraft()}
                type="button"
              >
                <Trash2 aria-hidden className="size-4" />
                {deleting ? "Đang xóa…" : "Xóa bản nháp"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
