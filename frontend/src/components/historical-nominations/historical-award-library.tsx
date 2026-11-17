"use client";

import { useQuery } from "@tanstack/react-query";
import { Award, Search } from "lucide-react";
import { useState } from "react";

import { historicalNominationApi } from "@/lib/api/client";

export function HistoricalAwardLibrary({
  onOpenRecord,
}: {
  onOpenRecord: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const awards = useQuery({
    queryKey: ["historical-awards-library", query],
    queryFn: () => historicalNominationApi.awardsLibrary({ query }),
  });

  return (
    <section
      className="space-y-5"
      aria-labelledby="historical-award-library-title"
    >
      <div>
        <p className="text-sm text-[var(--theme-muted)]">
          Tra cứu dữ liệu giải thưởng và bằng đã cấp
        </p>
        <h2
          className="mt-1 text-2xl font-semibold"
          id="historical-award-library-title"
        >
          Bằng xác lập lịch sử
        </h2>
      </div>
      <label className="relative block max-w-2xl">
        <Search
          aria-hidden
          className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--theme-muted)]"
        />
        <input
          aria-label="Tìm bằng xác lập"
          className="min-h-11 w-full rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] py-2 pl-9 pr-3 text-sm"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Số hiệu, tên bằng, người được cấp hoặc mã hồ sơ"
          value={query}
        />
      </label>
      {awards.isLoading ? (
        <p
          aria-busy="true"
          className="py-10 text-center text-sm text-[var(--theme-muted)]"
        >
          Đang tải danh sách…
        </p>
      ) : null}
      {awards.error ? (
        <p
          className="rounded-md border border-[var(--theme-danger)] p-3 text-sm text-[var(--theme-danger)]"
          role="alert"
        >
          {awards.error.message}
        </p>
      ) : null}
      {!awards.isLoading && !awards.error && awards.data?.data.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--theme-border)] px-5 py-12 text-center">
          <Award
            aria-hidden
            className="mx-auto h-8 w-8 text-[var(--theme-muted)]"
          />
          <p className="mt-3 font-medium">Chưa có bằng xác lập nào</p>
          <p className="mt-1 text-sm text-[var(--theme-muted)]">
            Thêm thông tin bằng trong hồ sơ đề cử lịch sử.
          </p>
        </div>
      ) : null}
      {awards.data?.data.length ? (
        <div className="overflow-x-auto rounded-lg border border-[var(--theme-border)]">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="bg-[var(--theme-surface-muted)] text-xs text-[var(--theme-muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">Bằng / giải thưởng</th>
                <th className="px-4 py-3 font-medium">Số hiệu</th>
                <th className="px-4 py-3 font-medium">Đối tượng hồ sơ</th>
                <th className="px-4 py-3 font-medium">Ngày cấp</th>
                <th className="px-4 py-3 font-medium">Hồ sơ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--theme-border)]">
              {awards.data.data.map((award) => (
                <tr key={award.id}>
                  <td className="px-4 py-3">
                    <span className="font-medium">{award.awardName}</span>
                    <span className="mt-1 block text-xs text-[var(--theme-muted)]">
                      {award.issuedBy ?? "Chưa rõ đơn vị cấp"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {award.certificateNumber ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    {award.subjectName ?? "Chưa có đối tượng ghi nhận"}
                  </td>
                  <td className="px-4 py-3">
                    {award.issuedAt
                      ? new Intl.DateTimeFormat("vi-VN", {
                          dateStyle: "medium",
                        }).format(new Date(award.issuedAt))
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      className="font-medium text-[var(--theme-accent)] underline-offset-2 hover:underline"
                      onClick={() => onOpenRecord(award.recordId)}
                      type="button"
                    >
                      {award.recordCode}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {awards.data?.meta ? (
        <p className="text-xs text-[var(--theme-muted)]">
          {awards.data.meta.total} bằng xác lập · đang hiển thị{" "}
          {awards.data.data.length}
        </p>
      ) : null}
    </section>
  );
}
