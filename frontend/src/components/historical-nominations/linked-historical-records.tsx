"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { historicalNominationApi } from "@/lib/api/client";
import { formatDateInput } from "@/lib/dates";
import { HistoricalCertificatePresentation } from "@/components/certificates/historical-certificate-presentation";

export function LinkedHistoricalRecords() {
  const [page, setPage] = useState(1);
  const records = useQuery({
    queryKey: ["my-historical-nominations", page],
    queryFn: () => historicalNominationApi.mine(page),
  });
  return (
    <section
      aria-label="Đề cử cũ đã liên kết"
      className="space-y-4 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-5"
    >
      <h2 className="text-xl font-semibold">Đề cử cũ đã liên kết</h2>
      <p className="text-sm text-[var(--theme-muted)]">
        Những đề cử trước khi có nền tảng, được nhân viên nhập và liên kết với
        tài khoản của bạn.
      </p>
      {records.isPending ? (
        <p role="status">Đang tải đề cử cũ…</p>
      ) : records.isError ? (
        <div role="alert">
          <p>Chưa tải được đề cử cũ.</p>
          <button
            type="button"
            className="mt-2 min-h-10 underline"
            onClick={() => void records.refetch()}
          >
            Thử lại
          </button>
        </div>
      ) : (
        <>
          {records.data.data.length === 0 ? (
            <p className="text-sm text-[var(--theme-muted)]">
              Chưa có đề cử cũ được liên kết. Nếu đã có đề cử trước đây, hãy
              liên hệ nhân viên và cung cấp email tài khoản đã đăng ký.
            </p>
          ) : null}
          {records.data.data.map((record) => (
            <article
              className="space-y-3 border-t border-[var(--theme-border)] pt-4"
              key={record.id}
            >
              <p className="break-all text-xs text-[var(--theme-muted)]">
                {record.code} · {record.nominationYear ?? "Chưa rõ năm"}
              </p>
              <h3 className="font-semibold">{record.title}</h3>
              {record.subjectName ? (
                <p className="text-sm">{record.subjectName}</p>
              ) : null}
              {record.awards.map((award) => (
                <details key={award.id} className="space-y-3">
                  <summary className="cursor-pointer py-2 font-medium">
                    Xem bằng: {award.awardName}
                  </summary>
                  <HistoricalCertificatePresentation
                    title={award.awardName}
                    subject={record.title}
                    number={award.certificateNumber}
                    issuedAt={formatDateInput(award.issuedAt)}
                    issuer={award.issuedBy}
                  />
                </details>
              ))}
              {record.awards.length === 0 ? (
                <p className="text-sm text-[var(--theme-muted)]">
                  Chưa có thông tin bằng xác lập cũ.
                </p>
              ) : null}
            </article>
          ))}
          {records.data.meta.total > 10 ? (
            <nav
              aria-label="Trang đề cử cũ"
              className="flex items-center gap-4"
            >
              <button
                type="button"
                className="min-h-10 disabled:opacity-50"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                Trang trước
              </button>
              <span>Trang {page}</span>
              <button
                type="button"
                className="min-h-10 disabled:opacity-50"
                disabled={page * 10 >= records.data.meta.total}
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
