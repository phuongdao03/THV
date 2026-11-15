"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, FilePlus2, LayoutDashboard, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  dossierApi,
  historicalNominationApi,
  publicWorkAdminApi,
} from "@/lib/api/client";
import { categoryLabels } from "@/lib/categories";

import { HistoricalWorkspaceOverview } from "./historical-workspace-overview";

type WorkspaceTab = "overview" | "records";

const publicationStatusLabels: Record<string, string> = {
  PRIVATE: "Chưa công khai",
  PENDING_PUBLICATION: "Chưa đăng",
  PUBLISHED: "Đã công khai",
  HIDDEN: "Đã ẩn",
};

export function HistoricalDataManagerWorkspace() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<WorkspaceTab>("overview");
  const [query, setQuery] = useState("");
  const [publicationStatus, setPublicationStatus] = useState("");
  const [year, setYear] = useState("");
  const [dossierTypeId, setDossierTypeId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const records = useQuery({
    queryKey: [
      "historical-nominations",
      query,
      publicationStatus,
      year,
      dossierTypeId,
    ],
    queryFn: () =>
      historicalNominationApi.list({
        query,
        pageSize: 100,
        publicationStatus: publicationStatus || undefined,
        year: year ? Number(year) : undefined,
        dossierTypeId: dossierTypeId || undefined,
      }),
  });
  const categories = useQuery({
    queryKey: ["historical-record-source-categories"],
    queryFn: publicWorkAdminApi.categories,
  });
  const dossierTypes = useQuery({
    queryKey: ["historical-record-dossier-types"],
    queryFn: dossierApi.listTypes,
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

  async function createRecord() {
    setBusy(true);
    setError(null);
    try {
      const created = await historicalNominationApi.create({});
      await queryClient.invalidateQueries({
        queryKey: ["historical-nominations"],
      });
      router.push(`/data-manager/records/${encodeURIComponent(created.id)}`);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Không tạo được hồ sơ.",
      );
    } finally {
      setBusy(false);
    }
  }

  function categoryName(record: (typeof sortedRecords)[number]) {
    if (record.dossierTypeId) {
      return dossierTypeNames.get(record.dossierTypeId) ?? "Loại hồ sơ cũ";
    }
    if (record.categoryId)
      return (
        labels.get(record.categoryId) ??
        record.legacyCategoryLabel ??
        "Danh mục chưa ánh xạ"
      );
    return record.legacyCategoryLabel ?? "Chưa phân loại";
  }

  return (
    <div className="space-y-6">
      <nav
        aria-label="Khu vực quản lý hồ sơ"
        className="flex gap-2 border-b border-[var(--theme-border)]"
        role="tablist"
      >
        {(
          [
            ["overview", "Tổng quan", LayoutDashboard],
            ["records", "Hồ sơ", Archive],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            aria-selected={tab === id}
            className="inline-flex min-h-11 items-center gap-2 border-b-2 border-transparent px-3 text-sm font-medium text-[var(--theme-muted)] aria-selected:border-primary-700 aria-selected:text-primary-700"
            key={id}
            onClick={() => setTab(id)}
            role="tab"
            type="button"
          >
            <Icon aria-hidden className="h-4 w-4" /> {label}
          </button>
        ))}
      </nav>

      {tab === "overview" ? (
        <HistoricalWorkspaceOverview
          onCreateRecord={() => void createRecord()}
          onOpenRecords={() => setTab("records")}
        />
      ) : (
        <section
          className="space-y-4"
          aria-labelledby="historical-records-heading"
        >
          <header className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm text-[var(--theme-muted)]">
                Tìm kiếm, lọc và mở từng hồ sơ để biên tập
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
              <FilePlus2 aria-hidden className="h-4 w-4" /> Tạo hồ sơ
            </button>
          </header>

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
                placeholder="Tên, tiêu đề hoặc mã hồ sơ"
                value={query}
              />
            </label>
            <select
              aria-label="Lọc trạng thái công khai"
              className="min-h-11 min-w-0 rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 text-sm"
              onChange={(event) => setPublicationStatus(event.target.value)}
              value={publicationStatus}
            >
              <option value="">Mọi trạng thái công khai</option>
              {Object.entries(publicationStatusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <input
              aria-label="Lọc theo năm"
              className="min-h-11 min-w-0 rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 text-sm"
              max="2200"
              min="1"
              onChange={(event) => setYear(event.target.value)}
              placeholder="Năm"
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

          {error ? (
            <p role="alert" className="text-sm text-[var(--theme-danger)]">
              {error}
            </p>
          ) : null}
          {records.isLoading ? (
            <div
              aria-busy="true"
              className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
            >
              {[0, 1, 2].map((item) => (
                <div
                  className="h-36 animate-pulse rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface-muted)]"
                  key={item}
                />
              ))}
            </div>
          ) : records.error ? (
            <p
              role="alert"
              className="rounded-md border border-[var(--theme-danger)] p-3 text-sm text-[var(--theme-danger)]"
            >
              {records.error.message}
            </p>
          ) : sortedRecords.length ? (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {sortedRecords.map((record) => (
                <li key={record.id}>
                  <Link
                    className="flex min-h-36 gap-3 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4 transition-colors hover:bg-[var(--theme-surface-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--theme-primary)]"
                    href={`/data-manager/records/${encodeURIComponent(record.id)}`}
                  >
                    <div
                      aria-hidden
                      className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-[var(--theme-surface-muted)] text-[var(--theme-muted)]"
                    >
                      <Archive className="h-6 w-6" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h3 className="min-w-0 flex-1 truncate font-semibold">
                          {record.title || "Hồ sơ chưa đặt tên"}
                        </h3>
                        <span className="rounded-full border border-[var(--theme-border)] px-2 py-0.5 text-xs">
                          {record.publicationStatus === "PUBLISHED"
                            ? "Đã công khai"
                            : (publicationStatusLabels[
                                record.publicationStatus
                              ] ?? "Chưa công khai")}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-sm text-[var(--theme-muted)]">
                        {record.subjectName || record.code}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-x-2 gap-y-1 text-xs text-[var(--theme-muted)]">
                        <span>{categoryName(record)}</span>
                        <span>·</span>
                        <span>{record.nominationYear ?? "Chưa rõ năm"}</span>
                        <span>·</span>
                        <span>{record.mediaCount} tệp</span>
                      </div>
                      <p className="mt-2 text-xs text-[var(--theme-muted)]">
                        Mã {record.code} · Cập nhật{" "}
                        {new Intl.DateTimeFormat("vi-VN", {
                          dateStyle: "medium",
                        }).format(new Date(record.updatedAt))}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-lg border border-dashed border-[var(--theme-border)] p-8 text-center">
              <p className="font-medium">Chưa có hồ sơ phù hợp</p>
              <p className="mt-1 text-sm text-[var(--theme-muted)]">
                Tạo hồ sơ mới; các trường có thể để trống ở bước này.
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
