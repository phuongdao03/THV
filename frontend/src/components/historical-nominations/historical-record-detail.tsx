"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { historicalNominationApi, mediaApi } from "@/lib/api/client";
import type { HistoricalNomination } from "@/lib/api/historical-nomination-types";
import { uploadMedia } from "@/lib/media/upload";

const personRoles = [
  "NOMINEE",
  "NOMINATOR",
  "REPRESENTATIVE",
  "CONTACT",
  "WITNESS",
  "OTHER",
] as const;

export function HistoricalRecordDetail({
  record,
  canEdit,
  onEdit,
  onSubmit,
  submitting,
}: {
  record: HistoricalNomination;
  canEdit: boolean;
  onEdit: () => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  async function addPerson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError(null);
    try {
      await historicalNominationApi.addPerson(record.id, {
        displayName: String(data.get("displayName") ?? "").trim(),
        organizationName:
          String(data.get("organizationName") ?? "").trim() || null,
        email: String(data.get("email") ?? "").trim() || null,
        phone: String(data.get("phone") ?? "").trim() || null,
        role: String(
          data.get("role") ?? "OTHER",
        ) as (typeof personRoles)[number],
      });
      form.reset();
      await queryClient.invalidateQueries({
        queryKey: ["historical-nomination-people", record.id],
      });
    } catch (addError) {
      setError(
        addError instanceof Error
          ? addError.message
          : "Không lưu được người liên quan.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function addAward(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError(null);
    try {
      await historicalNominationApi.addAward(record.id, {
        awardName: String(data.get("awardName") ?? "").trim(),
        certificateNumber:
          String(data.get("certificateNumber") ?? "").trim() || null,
        issuedBy: String(data.get("issuedBy") ?? "").trim() || null,
        provenanceNotes:
          String(data.get("awardProvenance") ?? "").trim() || null,
      });
      form.reset();
      await queryClient.invalidateQueries({
        queryKey: ["historical-nomination-awards", record.id],
      });
    } catch (addError) {
      setError(
        addError instanceof Error
          ? addError.message
          : "Không lưu được giải thưởng.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function uploadDocument(file?: File) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const asset = await uploadMedia(file, "HISTORICAL_NOMINATION");
      await historicalNominationApi.linkMedia(record.id, {
        mediaId: asset.id,
        mediaKind: file.type.startsWith("image/")
          ? "PHOTO"
          : "SUPPORTING_DOCUMENT",
        displayOrder: media.data?.length ?? 0,
      });
      await queryClient.invalidateQueries({
        queryKey: ["historical-nomination-media", record.id],
      });
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Không tải được tài liệu.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function openDocument(mediaId: string) {
    const documentTab = window.open("about:blank", "_blank");
    if (!documentTab) {
      setError("Cho phép cửa sổ bật lên để mở tài liệu riêng tư.");
      return;
    }
    try {
      const delivery = await mediaApi.signedUrl(mediaId);
      documentTab.opener = null;
      documentTab.location.replace(delivery.url);
    } catch (openError) {
      documentTab.close();
      setError(
        openError instanceof Error
          ? openError.message
          : "Không mở được tài liệu.",
      );
    }
  }

  return (
    <section className="space-y-6" aria-labelledby="record-detail-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--theme-muted)]">
            {record.code} · {record.verificationStatus}
          </p>
          <h2 className="mt-1 text-xl font-semibold" id="record-detail-title">
            {record.title}
          </h2>
          <p className="mt-1 text-sm text-[var(--theme-muted)]">
            {record.subjectName} · {record.nominationYear ?? "Chưa rõ năm"}
          </p>
        </div>
        {canEdit ? (
          <div className="flex gap-2">
            <button
              className="rounded-md border border-[var(--theme-border)] px-3 py-2 text-sm"
              onClick={onEdit}
              type="button"
            >
              Chỉnh sửa
            </button>
            <button
              className="rounded-md bg-primary-700 px-3 py-2 text-sm font-medium text-white hover:bg-primary-800 disabled:opacity-60"
              disabled={submitting}
              onClick={onSubmit}
              type="button"
            >
              {submitting ? "Đang gửi…" : "Gửi Admin xác minh"}
            </button>
          </div>
        ) : null}
      </div>
      {record.verificationReason ? (
        <p className="rounded-md bg-[var(--theme-surface-muted)] p-3 text-sm">
          Ý kiến Admin: {record.verificationReason}
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Info
          label="Nguồn"
          value={`${record.sourceKind} · ${record.sourceLabel ?? "Chưa có nhãn"}`}
        />
        <Info
          label="Tham chiếu"
          value={record.sourceReference ?? "Chưa có mã tham chiếu"}
        />
        <Info label="Tóm tắt" value={record.summary ?? "Chưa có tóm tắt"} />
        <Info
          label="Ghi chú nguồn gốc"
          value={record.provenanceNotes ?? "Chưa có ghi chú"}
        />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="space-y-3">
          <h3 className="font-semibold">Người liên quan</h3>
          <ul className="space-y-2 text-sm">
            {people.data?.map((person) => (
              <li
                className="rounded-md border border-[var(--theme-border)] p-3"
                key={person.id}
              >
                <span className="font-medium">{person.displayName}</span> ·{" "}
                {person.role}
                <span className="block text-[var(--theme-muted)]">
                  {[person.organizationName, person.email, person.phone]
                    .filter(Boolean)
                    .join(" · ") || "Không có thông tin liên hệ"}
                </span>
              </li>
            ))}
          </ul>
          {canEdit ? (
            <form
              className="grid gap-2 rounded-md bg-[var(--theme-surface-muted)] p-3 sm:grid-cols-2"
              onSubmit={addPerson}
            >
              <label className="space-y-1 text-sm">
                <span>Tên *</span>
                <input
                  className="w-full rounded border px-2 py-2"
                  name="displayName"
                  required
                />
              </label>
              <label className="space-y-1 text-sm">
                <span>Vai trò *</span>
                <select className="w-full rounded border px-2 py-2" name="role">
                  {personRoles.map((role) => (
                    <option key={role}>{role}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span>Tổ chức</span>
                <input
                  className="w-full rounded border px-2 py-2"
                  name="organizationName"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span>Email</span>
                <input
                  className="w-full rounded border px-2 py-2"
                  name="email"
                  type="email"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span>Điện thoại</span>
                <input
                  className="w-full rounded border px-2 py-2"
                  name="phone"
                />
              </label>
              <button
                className="self-end rounded border px-3 py-2 text-sm disabled:opacity-60"
                disabled={busy}
              >
                Thêm người
              </button>
            </form>
          ) : null}
        </section>
        <section className="space-y-3">
          <h3 className="font-semibold">Giải thưởng / bằng xác lập cũ</h3>
          <ul className="space-y-2 text-sm">
            {awards.data?.map((award) => (
              <li
                className="rounded-md border border-[var(--theme-border)] p-3"
                key={award.id}
              >
                <span className="font-medium">{award.awardName}</span>
                <span className="block text-[var(--theme-muted)]">
                  {award.certificateNumber ?? "Không có số bằng"} ·{" "}
                  {award.issuedBy ?? "Chưa rõ đơn vị cấp"}
                </span>
              </li>
            ))}
          </ul>
          {canEdit ? (
            <form
              className="grid gap-2 rounded-md bg-[var(--theme-surface-muted)] p-3 sm:grid-cols-2"
              onSubmit={addAward}
            >
              <label className="space-y-1 text-sm sm:col-span-2">
                <span>Tên giải thưởng *</span>
                <input
                  className="w-full rounded border px-2 py-2"
                  name="awardName"
                  required
                />
              </label>
              <label className="space-y-1 text-sm">
                <span>Số bằng cũ</span>
                <input
                  className="w-full rounded border px-2 py-2"
                  name="certificateNumber"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span>Đơn vị cấp</span>
                <input
                  className="w-full rounded border px-2 py-2"
                  name="issuedBy"
                />
              </label>
              <label className="space-y-1 text-sm sm:col-span-2">
                <span>Nguồn xác nhận</span>
                <input
                  className="w-full rounded border px-2 py-2"
                  name="awardProvenance"
                />
              </label>
              <button
                className="rounded border px-3 py-2 text-sm disabled:opacity-60"
                disabled={busy}
              >
                Thêm giải thưởng
              </button>
            </form>
          ) : null}
        </section>
      </div>
      <section className="space-y-3">
        <h3 className="font-semibold">Tài liệu riêng tư</h3>
        <ul className="flex flex-wrap gap-2">
          {media.data?.map((item) => (
            <li key={item.id}>
              <button
                className="rounded-md border border-[var(--theme-border)] px-3 py-2 text-sm"
                onClick={() => void openDocument(item.mediaId)}
                type="button"
              >
                Mở {item.mediaKind.toLocaleLowerCase()} ·{" "}
                {item.mediaId.slice(0, 8)}
              </button>
            </li>
          ))}
        </ul>
        {canEdit ? (
          <label className="inline-flex cursor-pointer items-center rounded-md border border-[var(--theme-border)] px-3 py-2 text-sm">
            <span>
              {busy ? "Đang tải / lưu…" : "Tải ảnh hoặc tài liệu lên"}
            </span>
            <input
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.zip,.mp3,.m4a,.mp4,.ogg,.wav,.webm"
              className="sr-only"
              disabled={busy}
              onChange={(event) =>
                void uploadDocument(event.currentTarget.files?.[0])
              }
              type="file"
            />
          </label>
        ) : null}
      </section>
      {error ? (
        <p className="text-sm text-[var(--theme-danger)]" role="alert">
          {error}
        </p>
      ) : null}
    </section>
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
