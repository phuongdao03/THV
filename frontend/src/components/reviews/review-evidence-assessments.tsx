"use client";

import { useState } from "react";
import { FileCheck2 } from "lucide-react";

import {
  completionGuidance,
  completionTarget,
} from "@/components/reviews/review-readiness";
import { formatEvidenceMimeType } from "@/components/reviews/review-evidence-format";
import type {
  EvidenceAssessment,
  EvidenceAssessmentStatus,
  EvidenceVerification,
  ReviewEvidenceSnapshot,
  ReviewCompletionIssue,
} from "@/lib/api/types";

const statusOptions: Array<{
  value: EvidenceAssessmentStatus;
  label: string;
}> = [
  { value: "UNREVIEWED", label: "Chưa kiểm tra" },
  { value: "VALID", label: "Phù hợp" },
  { value: "NEEDS_CLARIFICATION", label: "Cần làm rõ" },
  { value: "NOT_RELEVANT", label: "Không liên quan" },
];

const verificationOptions: Array<{
  value: EvidenceVerification["outcome"];
  label: string;
}> = [
  { value: "UNVERIFIED", label: "Chưa kiểm chứng" },
  { value: "VERIFIED", label: "Đã đối chiếu trong phạm vi kiểm tra" },
  { value: "PARTIAL", label: "Đã đối chiếu một phần" },
  { value: "INSUFFICIENT", label: "Chưa đủ căn cứ" },
  { value: "CONTRADICTED", label: "Có mâu thuẫn" },
  { value: "UNVERIFIABLE", label: "Không thể xác minh với nguồn hiện có" },
];

const verificationFields = [
  ["method", "Phương pháp đối chiếu"],
  ["source", "Nguồn đối chiếu"],
  ["scope", "Phạm vi đã kiểm tra"],
  ["limitations", "Giới hạn kiểm chứng"],
] as const;

export function ReviewEvidenceAssessments({
  assessments,
  evidences,
  onChange,
  readOnly = false,
  savedAssessments,
  selectedMediaId,
  activeIssue,
  onSelectMedia,
}: {
  assessments: Record<string, EvidenceAssessment>;
  evidences: ReviewEvidenceSnapshot[];
  onChange: (value: Record<string, EvidenceAssessment>) => void;
  readOnly?: boolean;
  savedAssessments?: Record<string, EvidenceAssessment>;
  selectedMediaId?: string;
  activeIssue?: ReviewCompletionIssue;
  onSelectMedia?: (id: string) => void;
}) {
  const [selected, setSelected] = useState(evidences[0]?.id ?? "");
  const requestedId = evidences.find(
    (item) => item.mediaAssetId === selectedMediaId,
  )?.id;
  const activeId =
    requestedId ??
    (evidences.some((item) => item.id === selected)
      ? selected
      : evidences[0]?.id);
  const reviewedCount = evidences.filter(
    (evidence) =>
      assessments[evidence.mediaAssetId]?.status &&
      assessments[evidence.mediaAssetId]?.status !== "UNREVIEWED",
  ).length;

  const activeField =
    activeIssue?.section === "documents" ? completionTarget(activeIssue) : null;
  function errorProps(id: string) {
    return id === activeField
      ? { "aria-invalid": true, "aria-describedby": `${id}-hint` }
      : {};
  }
  function fieldHint(id: string) {
    return activeIssue && id === activeField ? (
      <span
        id={`${id}-hint`}
        className="mt-2 block border-l-2 border-[var(--theme-accent)] pl-2 text-sm font-semibold"
      >
        {completionGuidance(activeIssue)}
      </span>
    ) : null;
  }

  const update = (mediaId: string, value: EvidenceAssessment) => {
    onChange({ ...assessments, [mediaId]: value });
  };

  return (
    <section
      aria-labelledby="evidence-assessment-title"
      className="rounded-xl bg-[var(--theme-elevated)] p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3
            className="flex items-center gap-2 font-bold"
            id="evidence-assessment-title"
          >
            <FileCheck2
              aria-hidden="true"
              className="size-5 text-[var(--theme-accent)]"
            />
            Kiểm tra tài liệu
          </h3>
          <p className="mt-1 text-sm text-[var(--theme-muted)]">
            Đánh giá sự liên quan và kiểm chứng nội dung riêng. Tệp tải lên
            thành công hoặc có mã hash không đồng nghĩa nội dung đã được xác
            nhận.
          </p>
        </div>
        <span className="rounded-full bg-[var(--theme-surface)] px-3 py-1 text-xs font-bold text-[var(--theme-text)]">
          {reviewedCount}/{evidences.length} đã kiểm tra
        </span>
      </div>
      {evidences.length > 1 ? (
        <label className="mt-4 block text-sm font-semibold">
          Tài liệu cần kiểm tra
          <select
            className="mt-2 min-h-11 w-full rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3"
            value={activeId}
            onChange={(event) => {
              setSelected(event.target.value);
              const mediaId = evidences.find(
                (item) => item.id === event.target.value,
              )?.mediaAssetId;
              if (mediaId) onSelectMedia?.(mediaId);
            }}
          >
            {evidences.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title} ·{" "}
                {assessments[item.mediaAssetId]?.status &&
                assessments[item.mediaAssetId]?.status !== "UNREVIEWED"
                  ? "Đã kiểm tra"
                  : "Chưa kiểm tra"}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="mt-4 grid gap-3">
        {evidences.map((evidence) => {
          const verifiedAt = (savedAssessments ?? assessments)[
            evidence.mediaAssetId
          ]?.verification?.verifiedAt;
          const assessment = assessments[evidence.mediaAssetId] ?? {
            status: "UNREVIEWED" as const,
            note: "",
          };
          const verification: EvidenceVerification =
            assessment.verification ?? {
              outcome: "UNVERIFIED",
              method: "",
              source: "",
              scope: "",
              limitations: "",
            };
          return (
            <article
              hidden={evidence.id !== activeId}
              className="[&[hidden]]:hidden space-y-3 border-t border-[var(--theme-border)] py-4"
              key={evidence.id}
            >
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_13rem] sm:items-center">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{evidence.title}</p>
                  <p className="mt-1 text-xs text-[var(--theme-muted)]">
                    Định dạng {formatEvidenceMimeType(evidence.media.mimeType)}
                  </p>
                </div>
                <label className="text-sm font-semibold">
                  <span className="sr-only">
                    Kết quả kiểm tra {evidence.title}
                  </span>
                  <select
                    id={`review-document-status-${evidence.mediaAssetId}`}
                    {...errorProps(
                      `review-document-status-${evidence.mediaAssetId}`,
                    )}
                    aria-label={`Kết quả kiểm tra ${evidence.title}`}
                    className="min-h-11 w-full rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3"
                    disabled={readOnly}
                    onChange={(event) =>
                      update(evidence.mediaAssetId, {
                        ...assessment,
                        status: event.target.value as EvidenceAssessmentStatus,
                      })
                    }
                    value={assessment.status}
                  >
                    {statusOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {fieldHint(`review-document-status-${evidence.mediaAssetId}`)}
                </label>
              </div>
              {assessment.status === "NEEDS_CLARIFICATION" ? (
                <label className="text-sm font-semibold">
                  Nội dung cần khách hàng làm rõ
                  <textarea
                    className="mt-2 min-h-24 w-full rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] p-3 font-normal"
                    disabled={readOnly}
                    id={`review-document-note-${evidence.mediaAssetId}`}
                    {...errorProps(
                      `review-document-note-${evidence.mediaAssetId}`,
                    )}
                    maxLength={1_000}
                    onChange={(event) =>
                      update(evidence.mediaAssetId, {
                        ...assessment,
                        note: event.target.value,
                      })
                    }
                    value={assessment.note}
                  />
                  {fieldHint(`review-document-note-${evidence.mediaAssetId}`)}
                </label>
              ) : null}
              <fieldset
                className="min-w-0 space-y-3 sm:col-span-2"
                disabled={readOnly}
              >
                <legend className="mb-2 text-sm font-semibold">
                  Kiểm chứng nội dung
                </legend>
                <select
                  id={`review-document-verification-${evidence.mediaAssetId}`}
                  {...errorProps(
                    `review-document-verification-${evidence.mediaAssetId}`,
                  )}
                  aria-label={`Kiểm chứng nội dung ${evidence.title}`}
                  className="min-h-11 w-full min-w-0 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 text-sm"
                  onChange={(event) =>
                    update(evidence.mediaAssetId, {
                      ...assessment,
                      verification: {
                        ...verification,
                        outcome: event.target
                          .value as EvidenceVerification["outcome"],
                      },
                    })
                  }
                  value={verification.outcome}
                >
                  {verificationOptions.map(({ value, label }) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                {fieldHint(
                  `review-document-verification-${evidence.mediaAssetId}`,
                )}
                {verification.outcome !== "UNVERIFIED" ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    {verificationFields.map(([key, label]) => (
                      <label
                        className="min-w-0 text-sm font-semibold"
                        key={key}
                      >
                        {label}
                        <textarea
                          id={`review-document-${key}-${evidence.mediaAssetId}`}
                          {...errorProps(
                            `review-document-${key}-${evidence.mediaAssetId}`,
                          )}
                          aria-label={`${label} — ${evidence.title}`}
                          className="mt-1 min-h-24 w-full rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] p-3 font-normal"
                          disabled={readOnly}
                          maxLength={1_000}
                          onChange={(event) =>
                            update(evidence.mediaAssetId, {
                              ...assessment,
                              verification: {
                                ...verification,
                                [key]: event.target.value,
                              },
                            })
                          }
                          value={verification[key]}
                        />
                        {fieldHint(
                          `review-document-${key}-${evidence.mediaAssetId}`,
                        )}
                      </label>
                    ))}
                  </div>
                ) : null}
                {verifiedAt ? (
                  <p className="break-words text-xs text-[var(--theme-muted)]">
                    Ghi nhận đối chiếu:{" "}
                    {new Date(verifiedAt).toLocaleString("vi-VN")}.
                  </p>
                ) : null}
              </fieldset>
            </article>
          );
        })}
        {evidences.length === 0 ? (
          <p className="rounded-lg bg-[var(--theme-surface)] p-3 text-sm text-[var(--theme-muted)]">
            Hồ sơ chưa có tài liệu đính kèm.
          </p>
        ) : null}
      </div>
    </section>
  );
}
