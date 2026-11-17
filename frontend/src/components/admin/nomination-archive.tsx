"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState, type FormEvent } from "react";

import { nominationArchiveApi, publicApi } from "@/lib/api/client";
import { displayCnsDossierCode } from "@/lib/brand/identifiers";
import type { ArchiveSource } from "@/lib/api/nomination-archive";
import { dossierStatusLabel } from "@/components/dossiers/dossier-status";
import type { DossierStatus } from "@/lib/api/types";

const field =
  "min-h-11 w-full rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 text-sm";
const statusLabels: Record<string, string> = {
  VERIFIED: "Đã xác minh",
  NEEDS_CORRECTION: "Cần bổ sung",
  PRIVATE: "Chưa công khai",
  NOT_PUBLISHED: "Chưa công bố",
  PENDING_PUBLICATION: "Chưa đăng",
  HIDDEN: "Đã ẩn",
  ACTIVE: "Đang quản lý",
  ARCHIVED: "Đã lưu trữ",
};
export function archiveStatusLabel(status: string | null) {
  return status
    ? (statusLabels[status] ??
        dossierStatusLabel(status as DossierStatus) ??
        status)
    : "Chưa có trạng thái riêng";
}
export function NominationArchive() {
  const [filters, setFilters] = useState<Record<string, string>>({
    page: "1",
    page_size: "25",
  });
  const categories = useQuery({
    queryKey: ["archive-categories"],
    queryFn: () => publicApi.categories(),
  });
  const records = useQuery({
    queryKey: ["nomination-archive", filters],
    queryFn: () => nominationArchiveApi.list(filters),
  });
  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setFilters({
      page: "1",
      page_size: "25",
      ...Object.fromEntries(
        [...form.entries()]
          .filter(([, value]) => String(value).trim())
          .map(([key, value]) => [key, String(value).trim()]),
      ),
    });
  }
  return (
    <section
      className="mx-auto max-w-7xl space-y-6"
      aria-label="Kho hồ sơ đề cử"
    >
      <header>
        <p className="text-xs font-semibold uppercase text-[var(--theme-accent)]">
          Kho hồ sơ nguồn
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Hồ sơ đề cử</h1>
        <p className="mt-2 text-sm text-[var(--theme-muted)]">
          Tra cứu hồ sơ mới và lịch sử, kể cả sau khi ra quyết định hoặc công
          bố. Tài liệu nội bộ chỉ hiển thị theo quyền.
        </p>
      </header>
      <form
        onSubmit={search}
        className="grid gap-3 rounded-lg border border-[var(--theme-border)] p-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <label className="text-sm sm:col-span-2">
          Tìm hồ sơ
          <input
            name="query"
            className={field}
            placeholder="Mã THV, tên, người liên quan hoặc email người nộp"
          />
        </label>
        <label className="text-sm">
          Nguồn hồ sơ
          <select name="source" className={field}>
            <option value="">Tất cả nguồn</option>
            <option value="CURRENT">Hồ sơ mới</option>
            <option value="LEGACY">Hồ sơ lịch sử</option>
          </select>
        </label>
        <label className="text-sm">
          Năm hồ sơ
          <input
            name="year"
            type="number"
            min={1}
            max={2200}
            className={field}
          />
        </label>
        <label className="text-sm">
          Danh mục
          <select name="category_id" className={field}>
            <option value="">Tất cả danh mục</option>
            {categories.data?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Trạng thái nghiệp vụ
          <select name="business_status" className={field}>
            <option value="">Tất cả trạng thái</option>
            {[
              "DRAFT",
              "SUBMITTED",
              "PRECHECK",
              "UNDER_REVIEW",
              "NEEDS_SUPPLEMENT",
              "COUNCIL_REVIEW",
              "APPROVED",
              "REJECTED",
              "CERTIFICATE_ISSUED",
              "PUBLISHED",
              "VERIFIED",
              "NEEDS_CORRECTION",
            ].map((status) => (
              <option value={status} key={status}>
                {archiveStatusLabel(status)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Công bố
          <select name="publication_status" className={field}>
            <option value="">Mọi trạng thái công bố</option>
            <option value="PUBLISHED">Đã công bố</option>
            <option value="PRIVATE">Chưa công khai · hồ sơ lịch sử</option>
            <option value="DRAFT">Bản nháp công bố</option>
            <option value="HIDDEN">Đã ẩn</option>
          </select>
        </label>
        <label className="text-sm">
          Lưu trữ
          <select name="archive_status" className={field}>
            <option value="">Tất cả, kể cả đã lưu trữ</option>
            <option value="ACTIVE">Đang quản lý · lịch sử</option>
            <option value="ARCHIVED">Đã lưu trữ · lịch sử</option>
          </select>
        </label>
        <button
          className="min-h-11 rounded-md bg-[var(--theme-accent)] px-4 text-sm font-semibold text-white"
          type="submit"
        >
          Tra cứu hồ sơ
        </button>
      </form>
      {records.isPending ? (
        <p role="status">Đang tải hồ sơ…</p>
      ) : records.isError ? (
        <div role="alert">
          Không tải được danh sách hồ sơ.{" "}
          <button
            type="button"
            className="underline"
            onClick={() => void records.refetch()}
          >
            Thử lại
          </button>
        </div>
      ) : (
        <>
          <p className="text-sm text-[var(--theme-muted)]">
            {records.data.meta.total} hồ sơ · kết quả bao gồm hồ sơ đã kết thúc
            xử lý.
          </p>
          <ul className="divide-y divide-[var(--theme-border)] border-y border-[var(--theme-border)]">
            {records.data.data.map((record) => (
              <li key={`${record.source}-${record.id}`} className="py-4">
                <div className="flex flex-wrap gap-2 text-xs text-[var(--theme-muted)]">
                  <span>
                    {record.source === "CURRENT"
                      ? "Hồ sơ mới"
                      : "Hồ sơ lịch sử"}
                  </span>
                  <span>{archiveStatusLabel(record.businessStatus)}</span>
                  {record.publicationStatus ? (
                    <span>
                      · {archiveStatusLabel(record.publicationStatus)}
                    </span>
                  ) : null}
                  {record.archiveStatus === "ARCHIVED" ? (
                    <span>· Đã lưu trữ</span>
                  ) : null}
                </div>
                <Link
                  className="mt-2 block text-lg font-semibold text-[var(--theme-accent)] underline-offset-4 hover:underline"
                  href={archiveRecordPath(record.source, record.id)}
                >
                  {record.title}
                </Link>
                <p className="mt-1 break-all text-sm">
                  {displayCnsDossierCode(record.code)} ·{" "}
                  {record.year ?? "Chưa rõ năm"}
                </p>
                <p className="mt-1 break-words text-sm text-[var(--theme-muted)]">
                  {record.source === "CURRENT" ? "Người nộp" : "Đối tượng"}:{" "}
                  {record.subject || "Chưa ghi nhận"}
                </p>
              </li>
            ))}
          </ul>
          {records.data.data.length === 0 ? (
            <p>Không có hồ sơ khớp bộ lọc. Thử thay đổi điều kiện tra cứu.</p>
          ) : null}
          <nav
            className="flex items-center gap-4"
            aria-label="Trang kết quả hồ sơ"
          >
            <button
              className="min-h-11 disabled:opacity-50"
              type="button"
              disabled={Number(filters.page) <= 1}
              onClick={() =>
                setFilters({
                  ...filters,
                  page: String(Number(filters.page) - 1),
                })
              }
            >
              Trang trước
            </button>
            <span>Trang {filters.page}</span>
            <button
              className="min-h-11 disabled:opacity-50"
              type="button"
              disabled={Number(filters.page) * 25 >= records.data.meta.total}
              onClick={() =>
                setFilters({
                  ...filters,
                  page: String(Number(filters.page) + 1),
                })
              }
            >
              Trang sau
            </button>
          </nav>
        </>
      )}
    </section>
  );
}
export function archiveRecordPath(source: ArchiveSource, id: string) {
  return `/admin/nomination-records/${source}/${encodeURIComponent(id)}`;
}
