"use client";

import { useQuery } from "@tanstack/react-query";
import type { FormEvent } from "react";

import { dossierApi } from "@/lib/api/client";
import type {
  HistoricalNomination,
  HistoricalNominationInput,
  HistoricalSourceKind,
  HistoricalSubjectType,
} from "@/lib/api/historical-nomination-types";
import { formatDateInput, parseDateInput } from "@/lib/dates";

const sourceKinds: { value: HistoricalSourceKind; label: string }[] = [
  { value: "ARCHIVE", label: "Lưu trữ" },
  { value: "OFFICIAL_RECORD", label: "Hồ sơ chính thức" },
  { value: "ORGANIZATION_RECORD", label: "Hồ sơ tổ chức" },
  { value: "PERSONAL_RECORD", label: "Tài liệu cá nhân" },
  { value: "OTHER", label: "Khác / chưa rõ" },
];

const fieldClass =
  "w-full rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-2.5 text-sm";

export function HistoricalRecordFormComplete({
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
  const dossierTypes = useQuery({
    queryKey: ["historical-record-dossier-types"],
    queryFn: dossierApi.listTypes,
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    for (const name of ["nominatedAt", "sourceRecordedAt"] as const) {
      const input = form.elements.namedItem(name);
      if (!(input instanceof HTMLInputElement)) continue;
      input.setCustomValidity("");
      if (input.value && !parseDateInput(input.value)) {
        input.setCustomValidity("Nhập ngày hợp lệ theo định dạng dd/mm/yyyy.");
        input.reportValidity();
        return;
      }
    }
    onSave({
      subjectType: values.get("subjectType") as HistoricalSubjectType,
      subjectName: String(values.get("subjectName") ?? "").trim(),
      title: String(values.get("title") ?? "").trim(),
      dossierTypeId: String(values.get("dossierTypeId") ?? "") || null,
      legacyCategoryLabel:
        String(values.get("legacyCategoryLabel") ?? "").trim() ||
        record?.legacyCategoryLabel ||
        null,
      nominationYear: values.get("nominationYear")
        ? Number(values.get("nominationYear"))
        : null,
      nominatedAt: parseDateInput(String(values.get("nominatedAt") ?? "")),
      summary: String(values.get("summary") ?? "").trim() || null,
      description: String(values.get("description") ?? "").trim() || null,
      historicalResult:
        String(values.get("historicalResult") ?? "").trim() || null,
      sourceKind: values.get("sourceKind") as HistoricalSourceKind,
      sourceLabel: String(values.get("sourceLabel") ?? "").trim() || null,
      sourceReference:
        String(values.get("sourceReference") ?? "").trim() || null,
      sourceRecordedAt: parseDateInput(
        String(values.get("sourceRecordedAt") ?? ""),
      ),
      provenanceNotes:
        String(values.get("provenanceNotes") ?? "").trim() || null,
    });
  }

  return (
    <form className="space-y-6" onSubmit={submit}>
      <header className="border-b border-[var(--theme-border)] pb-4">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--theme-muted)]">
          Hồ sơ nguồn · lưu riêng tư
        </p>
        <h2 className="mt-1 text-xl font-semibold">
          {record ? "Chỉnh sửa hồ sơ" : "Thêm hồ sơ đề cử lịch sử"}
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-[var(--theme-muted)]">
          Chỉ nhập thông tin đã có căn cứ. Trường chưa rõ có thể để trống khi
          lưu bản nháp.
        </p>
      </header>

      <section
        className="space-y-4"
        aria-labelledby="historical-form-record-title"
      >
        <div>
          <h3 className="font-semibold" id="historical-form-record-title">
            Thông tin đề cử
          </h3>
          <p className="mt-1 text-xs text-[var(--theme-muted)]">
            Tên đối tượng và tên hồ sơ là hai thông tin riêng.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5 text-sm">
            <span>Đối tượng</span>
            <select
              className={fieldClass}
              defaultValue={record?.subjectType ?? "PERSON"}
              name="subjectType"
            >
              <option value="PERSON">Cá nhân</option>
              <option value="ORGANIZATION">Tổ chức</option>
            </select>
          </label>
          <label className="space-y-1.5 text-sm">
            <span>Loại hồ sơ</span>
            <select
              className={fieldClass}
              defaultValue={record?.dossierTypeId ?? ""}
              name="dossierTypeId"
            >
              <option value="">Chưa chọn loại hồ sơ</option>
              {dossierTypes.data?.map((dossierType) => (
                <option key={dossierType.id} value={dossierType.id}>
                  {dossierType.name}
                </option>
              ))}
            </select>
            {dossierTypes.error ? (
              <span className="block text-xs text-[var(--theme-danger)]">
                Không tải được các loại hồ sơ.
              </span>
            ) : null}
          </label>
          <label className="space-y-1.5 text-sm sm:col-span-2">
            <span>
              Tên đối tượng / tác phẩm được đề cử <b aria-hidden="true">*</b>
            </span>
            <input
              autoComplete="off"
              className={fieldClass}
              defaultValue={record?.subjectName ?? ""}
              maxLength={255}
              name="subjectName"
            />
          </label>
          <label className="space-y-1.5 text-sm sm:col-span-2">
            <span>
              Tên hồ sơ đề cử <b aria-hidden="true">*</b>
            </span>
            <input
              className={fieldClass}
              defaultValue={record?.title ?? ""}
              maxLength={255}
              name="title"
            />
          </label>
          <label className="space-y-1.5 text-sm">
            <span>Năm đề cử</span>
            <input
              className={fieldClass}
              defaultValue={record?.nominationYear ?? ""}
              max="2200"
              min="1"
              name="nominationYear"
              type="number"
            />
          </label>
          <label className="space-y-1.5 text-sm">
            <span>Ngày đề cử</span>
            <input
              className={fieldClass}
              defaultValue={formatDateInput(record?.nominatedAt)}
              inputMode="numeric"
              name="nominatedAt"
              onInput={(event) => event.currentTarget.setCustomValidity("")}
              placeholder="dd/mm/yyyy"
              type="text"
            />
          </label>
          <label className="space-y-1.5 text-sm sm:col-span-2">
            <span>Tóm tắt</span>
            <textarea
              className={`${fieldClass} min-h-20`}
              defaultValue={record?.summary ?? ""}
              maxLength={10_000}
              name="summary"
            />
          </label>
          <label className="space-y-1.5 text-sm sm:col-span-2">
            <span>Mô tả chi tiết</span>
            <textarea
              className={`${fieldClass} min-h-32`}
              defaultValue={record?.description ?? ""}
              maxLength={50_000}
              name="description"
            />
          </label>
          <label className="space-y-1.5 text-sm sm:col-span-2">
            <span>Thành tích hoặc giá trị nổi bật</span>
            <textarea
              className={`${fieldClass} min-h-24`}
              defaultValue={record?.historicalResult ?? ""}
              maxLength={10_000}
              name="historicalResult"
            />
          </label>
        </div>
      </section>

      <section
        className="space-y-4 border-t border-[var(--theme-border)] pt-5"
        aria-labelledby="historical-form-source-title"
      >
        <div>
          <h3 className="font-semibold" id="historical-form-source-title">
            Nguồn lưu trữ
          </h3>
          <p className="mt-1 text-xs text-[var(--theme-muted)]">
            Ghi lại tham chiếu tìm được; không suy đoán nội dung còn thiếu.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5 text-sm">
            <span>Loại nguồn</span>
            <select
              className={fieldClass}
              defaultValue={record?.sourceKind ?? "ARCHIVE"}
              name="sourceKind"
            >
              {sourceKinds.map((kind) => (
                <option key={kind.value} value={kind.value}>
                  {kind.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5 text-sm">
            <span>Tên cơ quan / nguồn</span>
            <input
              className={fieldClass}
              defaultValue={record?.sourceLabel ?? ""}
              maxLength={255}
              name="sourceLabel"
            />
          </label>
          <label className="space-y-1.5 text-sm">
            <span>Mã hồ sơ cũ hoặc tham chiếu</span>
            <input
              className={fieldClass}
              defaultValue={record?.sourceReference ?? ""}
              maxLength={500}
              name="sourceReference"
            />
          </label>
          <label className="space-y-1.5 text-sm">
            <span>Ngày ghi nhận nguồn</span>
            <input
              className={fieldClass}
              defaultValue={formatDateInput(record?.sourceRecordedAt)}
              inputMode="numeric"
              name="sourceRecordedAt"
              onInput={(event) => event.currentTarget.setCustomValidity("")}
              placeholder="dd/mm/yyyy"
              type="text"
            />
          </label>
          <label className="space-y-1.5 text-sm sm:col-span-2">
            <span>Ghi chú nguồn nội bộ</span>
            <textarea
              className={`${fieldClass} min-h-20`}
              defaultValue={record?.provenanceNotes ?? ""}
              maxLength={10_000}
              name="provenanceNotes"
            />
          </label>
        </div>
      </section>

      <footer className="sticky bottom-0 -mx-4 flex flex-wrap justify-end gap-2 border-t border-[var(--theme-border)] bg-[var(--theme-surface)] px-4 py-3 sm:-mx-5 sm:px-5">
        <button
          className="min-h-11 rounded-md border border-[var(--theme-border)] px-4 text-sm"
          onClick={onCancel}
          type="button"
        >
          Hủy
        </button>
        <button
          className="min-h-11 rounded-md bg-primary-700 px-4 text-sm font-semibold text-white hover:bg-primary-800 disabled:opacity-60"
          disabled={busy}
          type="submit"
        >
          {busy ? "Đang lưu…" : "Lưu bản nháp"}
        </button>
      </footer>
    </form>
  );
}
