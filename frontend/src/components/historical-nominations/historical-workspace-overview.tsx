"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Clock3, FileCheck2, FilePlus2 } from "lucide-react";

import { historicalNominationApi } from "@/lib/api/client";

const tiles = [
  { key: "totalRecords", label: "Tổng hồ sơ" },
  { key: "draftCount", label: "Đang bổ sung" },
  { key: "publishedCount", label: "Đã công khai" },
] as const;

const actionLabels: Record<string, string> = {
  "historical_nomination.created": "đã tạo hồ sơ",
  "historical_nomination.updated": "đã cập nhật hồ sơ",
};

export function HistoricalWorkspaceOverview({
  onOpenRecords,
  onCreateRecord,
}: {
  onOpenRecords: () => void;
  onCreateRecord: () => void;
}) {
  const summary = useQuery({
    queryKey: ["historical-nomination-dashboard-summary"],
    queryFn: () => historicalNominationApi.dashboardSummary(),
  });

  return (
    <section className="space-y-6" aria-labelledby="historical-overview-title">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-[var(--theme-muted)]">
            Không gian làm việc
          </p>
          <h2
            className="mt-1 text-2xl font-semibold"
            id="historical-overview-title"
          >
            Tổng quan hồ sơ lịch sử
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-[var(--theme-muted)]">
            Theo dõi hồ sơ đang bổ sung và nội dung đã công khai.
          </p>
        </div>
        <button
          className="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary-700 px-4 text-sm font-semibold text-white hover:bg-primary-800"
          onClick={onCreateRecord}
          type="button"
        >
          <FilePlus2 aria-hidden className="h-4 w-4" /> Tạo hồ sơ
        </button>
      </div>

      {summary.isLoading ? (
        <div aria-busy="true" className="grid gap-3 sm:grid-cols-3">
          {tiles.map((tile) => (
            <div
              className="h-24 animate-pulse rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4"
              key={tile.key}
            />
          ))}
        </div>
      ) : summary.error ? (
        <p
          role="alert"
          className="rounded-md border border-[var(--theme-danger)] p-3 text-sm text-[var(--theme-danger)]"
        >
          {summary.error.message}
        </p>
      ) : (
        <dl className="grid gap-3 sm:grid-cols-3">
          {tiles.map((tile) => (
            <div
              className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4"
              key={tile.key}
            >
              <dt className="text-sm text-[var(--theme-muted)]">
                {tile.label}
              </dt>
              <dd className="mt-2 text-3xl font-semibold tabular-nums">
                {summary.data?.[tile.key] ?? 0}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <section
        className="overflow-hidden rounded-lg border border-[var(--theme-border)]"
        aria-labelledby="historical-recent-title"
      >
        <div className="flex items-center gap-2 border-b border-[var(--theme-border)] px-4 py-3">
          <Clock3 aria-hidden className="h-4 w-4 text-[var(--theme-muted)]" />
          <h3 className="font-semibold" id="historical-recent-title">
            Hoạt động gần đây
          </h3>
        </div>
        {summary.isLoading ? (
          <p aria-busy="true" className="p-4 text-sm text-[var(--theme-muted)]">
            Đang tải hoạt động…
          </p>
        ) : summary.data?.recentActivity.length ? (
          <ul className="divide-y divide-[var(--theme-border)]">
            {summary.data.recentActivity.map((activity, index) => (
              <li
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                key={`${activity.recordId}-${activity.occurredAt}-${index}`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {activity.title}
                  </p>
                  <p className="mt-1 text-xs text-[var(--theme-muted)]">
                    {activity.recordCode} ·{" "}
                    {actionLabels[activity.action] ?? "đã cập nhật"}
                  </p>
                </div>
                <time
                  className="shrink-0 text-xs text-[var(--theme-muted)]"
                  dateTime={activity.occurredAt}
                >
                  {new Intl.DateTimeFormat("vi-VN", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(activity.occurredAt))}
                </time>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex items-center gap-3 p-5 text-sm text-[var(--theme-muted)]">
            <FileCheck2 aria-hidden className="h-5 w-5 shrink-0" />
            Chưa có hoạt động. Tạo hồ sơ đầu tiên để bắt đầu số hóa.
          </div>
        )}
      </section>

      <button
        className="inline-flex items-center gap-2 text-sm font-medium text-[var(--theme-primary)]"
        onClick={onOpenRecords}
        type="button"
      >
        Mở danh sách hồ sơ <ArrowRight aria-hidden className="h-4 w-4" />
      </button>
    </section>
  );
}
