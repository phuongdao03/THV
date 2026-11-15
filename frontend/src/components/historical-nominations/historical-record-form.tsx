"use client";

import type { FormEvent } from "react";

import type {
  HistoricalNomination,
  HistoricalNominationInput,
  HistoricalSourceKind,
  HistoricalSubjectType,
} from "@/lib/api/historical-nomination-types";

const sourceKinds: HistoricalSourceKind[] = [
  "ARCHIVE",
  "OFFICIAL_RECORD",
  "ORGANIZATION_RECORD",
  "PERSONAL_RECORD",
  "OTHER",
];

export function HistoricalRecordForm({
  record,
  busy,
  onSave,
  onCancel,
}: {
  record?: HistoricalNomination | null;
  busy: boolean;
  onSave: (input: HistoricalNominationInput) => void;
  onCancel: () => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    onSave({
      subjectType: values.get("subjectType") as HistoricalSubjectType,
      subjectName: String(values.get("subjectName") ?? "").trim(),
      title: String(values.get("title") ?? "").trim(),
      summary: String(values.get("summary") ?? "").trim() || null,
      description: String(values.get("description") ?? "").trim() || null,
      categoryId: record?.categoryId ?? null,
      nominationYear: values.get("nominationYear")
        ? Number(values.get("nominationYear"))
        : null,
      nominatedAt: null,
      historicalResult:
        String(values.get("historicalResult") ?? "").trim() || null,
      sourceKind: values.get("sourceKind") as HistoricalSourceKind,
      sourceLabel: String(values.get("sourceLabel") ?? "").trim() || null,
      sourceReference:
        String(values.get("sourceReference") ?? "").trim() || null,
      sourceRecordedAt: null,
      provenanceNotes:
        String(values.get("provenanceNotes") ?? "").trim() || null,
    });
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div>
        <h2 className="text-lg font-semibold">
          {record ? "Chỉnh sửa hồ sơ" : "Tạo hồ sơ lịch sử"}
        </h2>
        <p className="mt-1 text-sm text-[var(--theme-muted)]">
          Ghi nguồn tham chiếu để Admin có thể xác minh hồ sơ.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span>Đối tượng</span>
          <select
            className="w-full rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-2"
            defaultValue={record?.subjectType ?? "PERSON"}
            name="subjectType"
          >
            <option value="PERSON">Cá nhân</option>
            <option value="ORGANIZATION">Tổ chức</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span>Năm đề cử</span>
          <input
            className="w-full rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-2"
            defaultValue={record?.nominationYear ?? ""}
            max="2200"
            min="1"
            name="nominationYear"
            type="number"
          />
        </label>
        <label className="space-y-1 text-sm sm:col-span-2">
          <span>Tên đối tượng *</span>
          <input
            className="w-full rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-2"
            defaultValue={record?.subjectName ?? ""}
            maxLength={255}
            name="subjectName"
            required
          />
        </label>
        <label className="space-y-1 text-sm sm:col-span-2">
          <span>Tiêu đề hồ sơ *</span>
          <input
            className="w-full rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-2"
            defaultValue={record?.title ?? ""}
            maxLength={255}
            name="title"
            required
          />
        </label>
        <label className="space-y-1 text-sm sm:col-span-2">
          <span>Tóm tắt</span>
          <textarea
            className="min-h-20 w-full rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-2"
            defaultValue={record?.summary ?? ""}
            maxLength={10_000}
            name="summary"
          />
        </label>
        <label className="space-y-1 text-sm sm:col-span-2">
          <span>Mô tả / thành tích</span>
          <textarea
            className="min-h-28 w-full rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-2"
            defaultValue={record?.description ?? ""}
            maxLength={50_000}
            name="description"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span>Loại nguồn</span>
          <select
            className="w-full rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-2"
            defaultValue={record?.sourceKind ?? "ARCHIVE"}
            name="sourceKind"
          >
            {sourceKinds.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span>Nhãn nguồn *</span>
          <input
            className="w-full rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-2"
            defaultValue={record?.sourceLabel ?? ""}
            maxLength={255}
            name="sourceLabel"
            required
          />
        </label>
        <label className="space-y-1 text-sm sm:col-span-2">
          <span>Mã / liên kết tham chiếu *</span>
          <input
            className="w-full rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-2"
            defaultValue={record?.sourceReference ?? ""}
            maxLength={500}
            name="sourceReference"
            required
          />
        </label>
        <label className="space-y-1 text-sm sm:col-span-2">
          <span>Kết quả lịch sử</span>
          <textarea
            className="min-h-20 w-full rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-2"
            defaultValue={record?.historicalResult ?? ""}
            maxLength={10_000}
            name="historicalResult"
          />
        </label>
        <label className="space-y-1 text-sm sm:col-span-2">
          <span>Ghi chú nguồn gốc</span>
          <textarea
            className="min-h-20 w-full rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-2"
            defaultValue={record?.provenanceNotes ?? ""}
            maxLength={10_000}
            name="provenanceNotes"
          />
        </label>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <button
          className="rounded-md border border-[var(--theme-border)] px-4 py-2 text-sm"
          onClick={onCancel}
          type="button"
        >
          Hủy
        </button>
        <button
          className="rounded-md bg-[var(--theme-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          disabled={busy}
          type="submit"
        >
          {busy ? "Đang lưu…" : "Lưu hồ sơ"}
        </button>
      </div>
    </form>
  );
}
