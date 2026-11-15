"use client";

import { useState } from "react";

import { historicalNominationApi } from "@/lib/api/client";
import type {
  HistoricalImportPreview,
  HistoricalImportUpload,
} from "@/lib/api/historical-nomination-types";

const targets = [
  ["subject_name", "Tên đối tượng *"],
  ["title", "Tiêu đề hồ sơ *"],
  ["nomination_year", "Năm đề cử"],
  ["source_label", "Nhãn nguồn"],
  ["source_reference", "Mã tham chiếu"],
  ["source_kind", "Loại nguồn"],
  ["summary", "Tóm tắt"],
  ["description", "Mô tả"],
  ["historical_result", "Kết quả lịch sử"],
  ["provenance_notes", "Ghi chú nguồn gốc"],
] as const;

function guessHeader(headers: string[], target: string): string {
  const tokens: Record<string, string[]> = {
    subject_name: [
      "subject",
      "nominee",
      "name",
      "đối tượng",
      "người được đề cử",
    ],
    title: ["title", "work", "tiêu đề", "tác phẩm", "hồ sơ"],
    nomination_year: ["year", "năm"],
    source_label: ["source", "nguồn", "tổ chức lưu trữ"],
    source_reference: ["reference", "mã", "liên kết", "số hồ sơ"],
    source_kind: ["source kind", "loại nguồn"],
    summary: ["summary", "tóm tắt"],
    description: ["description", "mô tả"],
    historical_result: ["result", "kết quả"],
    provenance_notes: ["provenance", "ghi chú nguồn"],
  };
  return (
    headers.find((header) =>
      tokens[target]?.some((token) =>
        header.toLocaleLowerCase().includes(token),
      ),
    ) ?? ""
  );
}

export function HistoricalImportWorkspace({
  onImported,
}: {
  onImported: () => void;
}) {
  const [upload, setUpload] = useState<HistoricalImportUpload | null>(null);
  const [preview, setPreview] = useState<HistoricalImportPreview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function selectFile(file?: File) {
    if (!file) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    setPreview(null);
    try {
      const uploaded = await historicalNominationApi.uploadImport(
        file,
        crypto.randomUUID(),
      );
      setUpload(uploaded);
      setMapping(
        Object.fromEntries(
          targets
            .map(([target]) => [target, guessHeader(uploaded.headers, target)])
            .filter(([, header]) => Boolean(header)),
        ),
      );
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Không tải được tệp.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function makePreview() {
    if (!upload) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      setPreview(
        await historicalNominationApi.previewImport(upload.batchId, mapping),
      );
    } catch (previewError) {
      setError(
        previewError instanceof Error
          ? previewError.message
          : "Không kiểm tra được dữ liệu.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirmImport() {
    if (!upload || !preview) return;
    setBusy(true);
    setError(null);
    try {
      const result = await historicalNominationApi.confirmImport(
        upload.batchId,
      );
      setMessage(
        `Đã nhập ${result.importedCount} hồ sơ; ${result.duplicateCount} trùng và ${result.rejectedCount} dòng lỗi.`,
      );
      onImported();
    } catch (confirmError) {
      setError(
        confirmError instanceof Error
          ? confirmError.message
          : "Không nhập được dữ liệu.",
      );
    } finally {
      setBusy(false);
    }
  }

  const validRows = preview?.validCount ?? 0;

  return (
    <section className="space-y-5" aria-labelledby="history-import-title">
      <div>
        <h2 className="text-lg font-semibold" id="history-import-title">
          Nhập danh sách CSV hoặc XLSX
        </h2>
        <p className="mt-1 text-sm text-[var(--theme-muted)]">
          Tải tệp lên, ghép cột, xem lỗi và bản ghi trùng, rồi mới xác nhận
          nhập.
        </p>
      </div>
      <label className="block rounded-lg border border-dashed border-[var(--theme-border)] p-5 text-sm">
        <span className="mb-2 block font-medium">Chọn tệp .csv hoặc .xlsx</span>
        <input
          accept=".csv,.xlsx"
          className="block max-w-full text-sm"
          disabled={busy}
          onChange={(event) => void selectFile(event.currentTarget.files?.[0])}
          type="file"
        />
      </label>
      {upload ? (
        <div className="space-y-4 rounded-lg border border-[var(--theme-border)] p-4">
          <p className="text-sm">
            Đã đọc {upload.totalRows} dòng. Ghép ít nhất hai cột có dấu *.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {targets.map(([field, label]) => (
              <label className="space-y-1 text-sm" key={field}>
                <span>{label}</span>
                <select
                  className="w-full rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-2"
                  onChange={(event) =>
                    setMapping((current) => ({
                      ...current,
                      [field]: event.currentTarget.value,
                    }))
                  }
                  value={mapping[field] ?? ""}
                >
                  <option value="">Bỏ qua cột</option>
                  {upload.headers.map((header) => (
                    <option key={`${field}-${header}`} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <button
            className="rounded-md border border-[var(--theme-border)] px-4 py-2 text-sm disabled:opacity-60"
            disabled={busy || !mapping.subject_name || !mapping.title}
            onClick={() => void makePreview()}
            type="button"
          >
            {busy ? "Đang kiểm tra…" : "Xem trước dữ liệu"}
          </button>
        </div>
      ) : null}
      {preview ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">
              {validRows} hợp lệ · {preview.duplicateCount} trùng ·{" "}
              {preview.rejectedCount} lỗi
            </p>
            <button
              className="rounded-md bg-[var(--theme-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              disabled={busy || validRows === 0}
              onClick={() => void confirmImport()}
              type="button"
            >
              {busy ? "Đang nhập…" : `Nhập ${validRows} hồ sơ hợp lệ`}
            </button>
          </div>
          <div className="overflow-x-auto rounded-lg border border-[var(--theme-border)]">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="bg-[var(--theme-surface-muted)]">
                <tr>
                  <th className="p-3">Dòng</th>
                  <th className="p-3">Tên đối tượng</th>
                  <th className="p-3">Tiêu đề</th>
                  <th className="p-3">Trạng thái</th>
                  <th className="p-3">Chi tiết</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 25).map((row) => (
                  <tr
                    className="border-t border-[var(--theme-border)]"
                    key={row.sourceRowNumber}
                  >
                    <td className="p-3">{row.sourceRowNumber}</td>
                    <td className="p-3">{row.payload.subject_name ?? "—"}</td>
                    <td className="p-3">{row.payload.title ?? "—"}</td>
                    <td className="p-3">{row.status}</td>
                    <td className="p-3">{row.errorCode ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.totalRows > 25 ? (
            <p className="text-xs text-[var(--theme-muted)]">
              Đang hiển thị 25 dòng đầu trên tổng số {preview.totalRows}.
            </p>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <p className="text-sm text-[var(--theme-danger)]" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="text-sm text-[var(--theme-success)]" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
