"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { ApiError, dossierApi } from "@/lib/api/client";
import type { DossierClaim, DossierEvidence } from "@/lib/api/types";

const EMPTY: DossierClaim[] = [];

export function DossierClaimsEditor({
  dossierId,
  initialClaims = EMPTY,
  initialRevision = 0,
  criteria,
  evidences,
  readOnly,
  onSaved,
  onUnsavedChange,
}: {
  dossierId: string;
  initialClaims?: DossierClaim[];
  initialRevision?: number;
  criteria: Array<{ key: string; label: string }>;
  evidences: DossierEvidence[];
  readOnly: boolean;
  onSaved: () => void;
  onUnsavedChange: (dirty: boolean) => void;
}) {
  const [claims, setClaims] = useState(initialClaims);
  const [revision, setRevision] = useState(initialRevision);
  const [baseline, setBaseline] = useState(JSON.stringify(initialClaims));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [claimToRemove, setClaimToRemove] = useState<string | null>(null);
  const effectiveReadOnly = readOnly || criteria.length === 0;
  const dirty = !effectiveReadOnly && JSON.stringify(claims) !== baseline;
  useEffect(
    () => onUnsavedChange(dirty || saving),
    [dirty, onUnsavedChange, saving],
  );
  useEffect(() => {
    if (!dirty) return;
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", prevent);
    const preventNavigation = (event: MouseEvent) => {
      const target =
        event.target instanceof Element
          ? event.target.closest("a[href]")
          : null;
      if (!target || target.getAttribute("href")?.startsWith("#")) return;
      event.preventDefault();
      event.stopPropagation();
      setError("Lưu nhận định hoặc hủy thay đổi trước khi chuyển trang.");
    };
    document.addEventListener("click", preventNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", prevent);
      document.removeEventListener("click", preventNavigation, true);
    };
  }, [dirty]);
  const update = (id: string, patch: Partial<DossierClaim>) =>
    setClaims((current) =>
      current.map((claim) =>
        claim.id === id ? { ...claim, ...patch } : claim,
      ),
    );
  async function save() {
    setSaving(true);
    setError("");
    try {
      const result = await dossierApi.saveClaims(dossierId, revision, claims);
      const acknowledged = result.claims ?? [];
      setClaims(acknowledged);
      setBaseline(JSON.stringify(acknowledged));
      setRevision(result.claimsRevision ?? revision + 1);
      onSaved();
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.status === 409
          ? "Nhận định đã được thay đổi ở phiên khác. Giữ lại nội dung đang nhập và tải lại hồ sơ để đối chiếu trước khi lưu."
          : "Chưa lưu được nhận định. Nội dung đang nhập vẫn được giữ; kiểm tra tiêu chí và tài liệu rồi thử lại.",
      );
    } finally {
      setSaving(false);
    }
  }
  if (!criteria.length && !claims.length) return null;
  return (
    <details className="border-y border-[var(--theme-border)] py-3">
      <summary className="min-h-11 cursor-pointer py-2">
        <span className="block text-base font-bold text-[var(--theme-text)]">
          Nhận định và căn cứ
        </span>
        <span className="mt-1 block text-sm leading-5 text-[var(--theme-muted)]">
          Nêu căn cứ theo tiêu chí và liên kết tài liệu hỗ trợ.
        </span>
      </summary>
      <div className="space-y-4 pt-4">
        {!criteria.length && claims.length ? (
          <p className="text-sm text-amber-900" role="status">
            Tiêu chí hiện không có sẵn. Nhận định lịch sử được giữ nguyên ở chế
            độ chỉ xem.
          </p>
        ) : null}
        <fieldset className="space-y-4" disabled={effectiveReadOnly || saving}>
          <legend className="sr-only">Các nhận định của người nộp</legend>
          {claims.map((claim, index) => {
            const criterionValid = criteria.some(
              ({ key }) => key === claim.criterionKey,
            );
            const statementLength = claim.statement.trim().length;
            const staleEvidence = claim.evidenceMediaIds.some(
              (id) =>
                !evidences.some((evidence) => evidence.mediaAssetId === id),
            );
            const criterionErrorId = `claim-${claim.id}-criterion-error`;
            const statementErrorId = `claim-${claim.id}-statement-error`;
            return (
              <div
                className="space-y-3 border-t border-[var(--theme-border)] pt-4"
                key={claim.id}
              >
                <label className="block text-sm font-semibold">
                  Tiêu chí cho nhận định {index + 1}
                  <select
                    aria-describedby={
                      !criterionValid ? criterionErrorId : undefined
                    }
                    aria-invalid={!criterionValid}
                    aria-label={`Tiêu chí nhận định ${index + 1}`}
                    className="mt-1 min-h-11 w-full rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3"
                    value={claim.criterionKey}
                    onChange={(event) =>
                      update(claim.id, { criterionKey: event.target.value })
                    }
                  >
                    <option value="">Chọn tiêu chí</option>
                    {criteria.map(({ key, label }) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                  {!criterionValid ? (
                    <span
                      className="mt-1 block text-sm font-normal text-red-700"
                      id={criterionErrorId}
                      role="alert"
                    >
                      Chọn một tiêu chí hợp lệ cho nhận định này.
                    </span>
                  ) : null}
                </label>
                <label className="block text-sm font-semibold">
                  Nội dung nhận định {index + 1}
                  <textarea
                    aria-describedby={
                      statementLength < 20 ? statementErrorId : undefined
                    }
                    aria-invalid={statementLength < 20}
                    aria-label={`Nội dung nhận định ${index + 1}`}
                    className="mt-1 min-h-28 w-full rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] p-3 font-normal"
                    maxLength={2000}
                    value={claim.statement}
                    onChange={(event) =>
                      update(claim.id, { statement: event.target.value })
                    }
                  />
                  {statementLength < 20 ? (
                    <span
                      className="mt-1 block text-sm font-normal text-amber-800"
                      id={statementErrorId}
                      role="status"
                    >
                      Cần ít nhất 20 ký tự trước khi gửi hồ sơ.
                    </span>
                  ) : null}
                </label>
                <fieldset className="space-y-1">
                  <legend className="mb-1 text-sm font-semibold">
                    Tài liệu hỗ trợ nhận định {index + 1}
                  </legend>
                  {evidences.map((evidence) => (
                    <label
                      className="flex min-h-11 items-center gap-2 text-sm"
                      key={evidence.id}
                    >
                      <input
                        type="checkbox"
                        checked={claim.evidenceMediaIds.includes(
                          evidence.mediaAssetId,
                        )}
                        onChange={(event) =>
                          update(claim.id, {
                            evidenceMediaIds: event.target.checked
                              ? [
                                  ...claim.evidenceMediaIds,
                                  evidence.mediaAssetId,
                                ]
                              : claim.evidenceMediaIds.filter(
                                  (id) => id !== evidence.mediaAssetId,
                                ),
                          })
                        }
                      />
                      {evidence.title}
                    </label>
                  ))}
                  {!claim.evidenceMediaIds.some((id) =>
                    evidences.some((evidence) => evidence.mediaAssetId === id),
                  ) ? (
                    <p className="pt-1 text-sm text-amber-800" role="status">
                      Liên kết ít nhất một tài liệu trước khi gửi hồ sơ.
                    </p>
                  ) : null}
                  {staleEvidence ? (
                    <p role="alert" className="text-sm text-red-700">
                      Tài liệu đã gỡ khỏi hồ sơ. Nhận định vẫn được giữ; hãy
                      chọn minh chứng thay thế hoặc chủ động gỡ liên kết cũ.
                      {!effectiveReadOnly ? (
                        <button
                          type="button"
                          className="ml-2 min-h-11 font-semibold underline underline-offset-2"
                          onClick={() =>
                            update(claim.id, {
                              evidenceMediaIds: claim.evidenceMediaIds.filter(
                                (id) =>
                                  evidences.some(
                                    (evidence) => evidence.mediaAssetId === id,
                                  ),
                              ),
                            })
                          }
                        >
                          Gỡ liên kết cũ
                        </button>
                      ) : null}
                    </p>
                  ) : null}
                </fieldset>
                {!effectiveReadOnly ? (
                  claimToRemove === claim.id ? (
                    <div className="border-l-2 border-amber-500 pl-3">
                      <p className="text-sm text-amber-950">
                        Nhận định sẽ bị xóa khỏi bản nháp khi bạn lưu thay đổi.
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setClaimToRemove(null)}
                        >
                          Hủy
                        </Button>
                        <Button
                          type="button"
                          className="border border-red-700 text-red-800 hover:bg-red-50"
                          variant="ghost"
                          onClick={() => {
                            setClaims((current) =>
                              current.filter(({ id }) => id !== claim.id),
                            );
                            setClaimToRemove(null);
                          }}
                        >
                          Xóa nhận định
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setClaimToRemove(claim.id)}
                    >
                      Xóa nhận định {index + 1}
                    </Button>
                  )
                ) : null}
              </div>
            );
          })}
          {!effectiveReadOnly ? (
            <Button
              type="button"
              variant="outline"
              disabled={claims.length >= 50}
              onClick={() =>
                setClaims((current) => [
                  ...current,
                  {
                    id: crypto.randomUUID(),
                    criterionKey: criteria[0]?.key ?? "",
                    statement: "",
                    evidenceMediaIds: [],
                  },
                ])
              }
            >
              Thêm nhận định
            </Button>
          ) : null}
        </fieldset>
        {!effectiveReadOnly ? (
          <div className="flex flex-wrap items-center gap-3 border-t border-[var(--theme-border)] pt-4">
            <Button
              type="button"
              disabled={
                !dirty ||
                saving ||
                claims.some(
                  (claim) =>
                    !criteria.some(({ key }) => key === claim.criterionKey) ||
                    !claim.statement.trim() ||
                    claim.statement.trim().length > 2000 ||
                    claim.evidenceMediaIds.some(
                      (id) =>
                        !evidences.some(
                          (evidence) => evidence.mediaAssetId === id,
                        ),
                    ),
                )
              }
              onClick={() => void save()}
            >
              {saving ? "Đang lưu nhận định…" : "Lưu nhận định"}
            </Button>
            {dirty ? (
              <Button
                variant="ghost"
                type="button"
                disabled={saving}
                onClick={() => {
                  setClaims(JSON.parse(baseline) as DossierClaim[]);
                  setClaimToRemove(null);
                  setError("");
                }}
              >
                Hủy thay đổi nhận định
              </Button>
            ) : null}
            <span className="text-sm text-[var(--theme-muted)]" role="status">
              {dirty ? "Có nội dung chưa lưu" : "Nhận định đã lưu"}
            </span>
          </div>
        ) : null}
        {error ? (
          <p className="text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </details>
  );
}
