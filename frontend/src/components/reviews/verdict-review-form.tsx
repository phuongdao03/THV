"use client";

import {
  AlertCircle,
  CheckCircle2,
  LoaderCircle,
  Save,
  Send,
} from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";

import { ReviewEvidenceAssessments } from "@/components/reviews/review-evidence-assessments";
import { criterionEvidenceIssue } from "@/components/reviews/review-evidence-policy";
import {
  completionGuidance,
  completionTarget,
} from "@/components/reviews/review-readiness";
import { ReviewEvidenceSelect } from "@/components/reviews/review-evidence-select";
import { useReviewAutosave } from "@/components/reviews/use-review-autosave";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { ApiError } from "@/lib/api/client";
import type {
  CriterionVerdict,
  CriterionVerdictOutcome,
  DossierClaim,
  EvidenceAssessment,
  ReviewData,
  ReviewDraft,
  ReviewEvidenceSnapshot,
  ReviewCompletionIssue,
  ReviewReadiness,
  ReviewGateAnswer,
  ReviewRecommendation,
  ReviewRubric,
} from "@/lib/api/types";

const outcomeOptions: Array<{
  value: CriterionVerdictOutcome;
  label: string;
  note: string;
  selectedClass: string;
  markerClass: string;
}> = [
  {
    value: "MEETS",
    label: "Đáp ứng",
    note: "Có căn cứ phù hợp",
    selectedClass:
      "border-emerald-600 bg-emerald-50 text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-100",
    markerClass: "bg-emerald-600",
  },
  {
    value: "NEEDS_CLARIFICATION",
    label: "Cần bổ sung",
    note: "Chưa đủ căn cứ để kết luận",
    selectedClass:
      "border-amber-600 bg-amber-50 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100",
    markerClass: "bg-amber-600",
  },
  {
    value: "DOES_NOT_MEET",
    label: "Không đáp ứng",
    note: "Có điểm chưa phù hợp",
    selectedClass:
      "border-red-600 bg-red-50 text-red-950 dark:bg-red-950/40 dark:text-red-100",
    markerClass: "bg-red-600",
  },
  {
    value: "INSUFFICIENT_BASIS",
    label: "Chưa đủ căn cứ",
    note: "Có thông tin nhưng chưa đủ nguồn để kết luận",
    selectedClass:
      "border-amber-600 bg-amber-50 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100",
    markerClass: "bg-amber-600",
  },
  {
    value: "NOT_APPLICABLE",
    label: "Không áp dụng",
    note: "Tiêu chí không phù hợp hồ sơ",
    selectedClass:
      "border-slate-500 bg-slate-100 text-slate-950 dark:bg-slate-800 dark:text-slate-100",
    markerClass: "bg-slate-500",
  },
];

function recommendationFor(
  rubric: ReviewRubric,
  verdicts: Record<string, CriterionVerdict>,
  gates: Record<string, ReviewGateAnswer>,
): ReviewRecommendation | null {
  if (rubric.criteria.some(({ key }) => !verdicts[key]?.outcome)) return null;
  if (
    rubric.gates.some(
      ({ key }) => !gates[key] || gates[key].outcome === "UNASSESSED",
    )
  )
    return null;
  const requiredGateFailed = rubric.gates.some(
    ({ key, required }) =>
      required !== false &&
      gates[key]?.outcome &&
      gates[key].outcome !== "PASS",
  );
  const outcomes = rubric.criteria.map(({ key }) => verdicts[key]!.outcome);
  if (requiredGateFailed || outcomes.includes("DOES_NOT_MEET")) return "REJECT";
  if (
    outcomes.includes("NEEDS_CLARIFICATION") ||
    outcomes.includes("INSUFFICIENT_BASIS")
  )
    return "SUPPLEMENT";
  if (outcomes.every((outcome) => outcome === "NOT_APPLICABLE")) return null;
  return "APPROVE";
}

function resultLabel(value: ReviewRecommendation | null) {
  if (value === "APPROVE") return "Đề nghị phê duyệt";
  if (value === "SUPPLEMENT") return "Yêu cầu bổ sung";
  if (value === "REJECT") return "Đề nghị từ chối";
  return "Chưa đủ thông tin để kết luận";
}

function gateOutcomeLabel(outcome?: ReviewGateAnswer["outcome"]) {
  if (outcome === "PASS") return "Đáp ứng";
  if (outcome === "FAIL") return "Không đáp ứng";
  if (outcome === "NOT_APPLICABLE") return "Không áp dụng";
  return "Chưa đánh giá";
}

function documentOutcomeLabel(status?: EvidenceAssessment["status"]) {
  if (status === "VALID") return "Phù hợp";
  if (status === "NEEDS_CLARIFICATION") return "Cần làm rõ";
  if (status === "NOT_RELEVANT") return "Không liên quan";
  return "Chưa kiểm tra";
}

export function VerdictReviewForm({
  claims = [],
  evidences,
  initialReview,
  initialReadiness,
  isSaving,
  isSubmitting,
  onSave,
  onSubmit,
  readOnly,
  rubric,
  saveError,
}: {
  claims?: DossierClaim[];
  evidences: ReviewEvidenceSnapshot[];
  initialReview: ReviewData | null;
  initialReadiness?: ReviewReadiness | null;
  isSaving: boolean;
  isSubmitting: boolean;
  onSave: (draft: ReviewDraft) => Promise<ReviewData | void>;
  onSubmit: () => Promise<void>;
  readOnly: boolean;
  rubric: ReviewRubric;
  saveError?: Error | null;
}) {
  const [savedReview, setSavedReview] = useState(initialReview);
  const savedReadiness = useRef<ReviewReadiness | null | undefined>(undefined);
  const [serverIssues, setServerIssues] = useState<ReviewCompletionIssue[]>();
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [selectedMediaId, setSelectedMediaId] = useState<string>();
  const [activeIssue, setActiveIssue] = useState<ReviewCompletionIssue>();
  const [task, setTask] = useState("documents");
  const [selectedGate, setSelectedGate] = useState(rubric.gates[0]?.key ?? "");
  const [selectedCriterion, setSelectedCriterion] = useState(
    rubric.criteria[0]?.key ?? "",
  );
  const activeCriterionIndex = Math.max(
    0,
    rubric.criteria.findIndex(({ key }) => key === selectedCriterion),
  );
  const activeCriterionKey = rubric.criteria[activeCriterionIndex]?.key;

  function selectCriterion(key: string, focus = false) {
    setSelectedCriterion(key);
    if (focus) {
      requestAnimationFrame(() =>
        document.getElementById(`review-criterion-${key}`)?.focus(),
      );
    }
  }

  const [verdicts, setVerdicts] = useState<Record<string, CriterionVerdict>>(
    () =>
      Object.fromEntries(
        Object.entries(initialReview?.criterionVerdicts ?? {}).map(
          ([key, value]) => [key, value],
        ),
      ),
  );
  const [gates, setGates] = useState<Record<string, ReviewGateAnswer>>(
    () => initialReview?.gateAnswers ?? {},
  );
  const [assessments, setAssessments] = useState<
    Record<string, EvidenceAssessment>
  >(() => initialReview?.evidenceAssessments ?? {});
  const [applicantFeedback, setApplicantFeedback] = useState(
    initialReview?.applicantFeedback ?? "",
  );
  const [privateNote, setPrivateNote] = useState(
    initialReview?.privateNote ?? "",
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState("");
  const recommendation = useMemo(
    () => recommendationFor(rubric, verdicts, gates),
    [gates, rubric, verdicts],
  );

  const buildDraft = useCallback((): ReviewDraft => {
    return {
      truthScore: null,
      transparencyScore: null,
      ownershipScore: null,
      professionalismScore: null,
      respectScore: null,
      criterionComments: {},
      criterionEvidence: {},
      findings: initialReview?.findings ?? [],
      checklistAnswers: initialReview?.checklistAnswers ?? {},
      applicantFeedback: applicantFeedback.trim() || null,
      recommendation,
      privateNote: privateNote.trim() || null,
      gateAnswers: gates,
      specialistAnswers: {},
      criterionVerdicts: verdicts,
      evidenceAssessments: assessments,
    };
  }, [
    applicantFeedback,
    assessments,
    gates,
    initialReview,
    privateNote,
    recommendation,
    verdicts,
  ]);

  const autosaveDraft = useMemo(() => buildDraft(), [buildDraft]);
  const autosave = useReviewAutosave({
    draft: autosaveDraft,
    onSave: async (draft) => {
      const saved = await onSave(draft);
      if (saved) {
        savedReadiness.current = saved.readiness;
        setSavedReview(saved);
        setServerIssues(undefined);
      }
    },
    readOnly,
  });

  const readiness = savedReview?.readiness ?? initialReadiness;
  const validationIssues = serverIssues ?? readiness?.issues ?? [];
  const savedAssessments = savedReview?.evidenceAssessments ?? {};
  const savedVerdicts = savedReview?.criterionVerdicts ?? {};
  const savedGates = savedReview?.gateAnswers ?? {};
  const complete =
    !serverIssues?.length &&
    Boolean(readiness?.readyToSubmit) &&
    autosave.status === "saved";
  const blocked = (section: string, key: string) =>
    validationIssues.some(
      (issue) => issue.section === section && issue.entityId === key,
    );
  const reviewedFiles = evidences.filter(
    ({ mediaAssetId }) =>
      Boolean(
        savedAssessments[mediaAssetId] &&
          savedAssessments[mediaAssetId].status !== "UNREVIEWED",
      ) && !blocked("documents", mediaAssetId),
  ).length;
  const completedCriteria = rubric.criteria.filter(
    ({ key }) => Boolean(savedVerdicts[key]) && !blocked("criteria", key),
  ).length;
  const completedGates = rubric.gates.filter(
    ({ key }) =>
      Boolean(savedGates[key] && savedGates[key].outcome !== "UNASSESSED") &&
      !blocked("conditions", key),
  ).length;

  function stepProgress(section: string, completed: number, total: number) {
    if (!total) return "Không áp dụng";
    const hasError = validationIssues.some(
      (issue) => issue.section === section && issue.code.endsWith("_INVALID"),
    );
    const status = hasError
      ? "Cần xử lý lỗi"
      : completed === total
        ? "Đã hoàn tất"
        : task === section
          ? "Đang thực hiện"
          : completed === 0
            ? "Chưa bắt đầu"
            : "Còn thiếu";
    return `${completed}/${total} · ${status}`;
  }

  const steps = [
    {
      id: "documents",
      label: "Kiểm tra tài liệu",
      progress: stepProgress("documents", reviewedFiles, evidences.length),
    },
    ...(rubric.gates.length
      ? [
          {
            id: "conditions",
            label: "Điều kiện tiếp nhận",
            progress: stepProgress(
              "conditions",
              completedGates,
              rubric.gates.length,
            ),
          },
        ]
      : []),
    {
      id: "criteria",
      label: "Đánh giá từng tiêu chí",
      progress: stepProgress(
        "criteria",
        completedCriteria,
        rubric.criteria.length,
      ),
    },
    {
      id: "report",
      label: "Báo cáo",
      progress: readOnly ? "Đã gửi" : "Chưa gửi",
    },
  ];

  const issueLabel = (issue: ReviewCompletionIssue) =>
    issue.label ??
    (issue.section === "documents"
      ? evidences.find(({ mediaAssetId }) => mediaAssetId === issue.entityId)
          ?.title
      : undefined) ??
    steps.find(({ id }) => id === issue.section)?.label;

  function goToIssue(issue: ReviewCompletionIssue) {
    const step = steps.some(({ id }) => id === issue.section)
      ? issue.section
      : "report";
    setTask(step);
    setActiveIssue(issue);
    setError("");
    if (issue.entityId) {
      if (
        step === "criteria" &&
        rubric.criteria.some(({ key }) => key === issue.entityId)
      )
        selectCriterion(issue.entityId);
      if (
        step === "conditions" &&
        rubric.gates.some(({ key }) => key === issue.entityId)
      )
        setSelectedGate(issue.entityId);
      if (
        step === "documents" &&
        evidences.some(({ mediaAssetId }) => mediaAssetId === issue.entityId)
      )
        setSelectedMediaId(issue.entityId);
    }
    requestAnimationFrame(() => {
      const candidate = document.getElementById(completionTarget(issue));
      const target = candidate?.closest("[hidden]") ? null : candidate;
      const fallback = document.getElementById(
        step === "report" ? "review-final-result" : `review-step-${step}`,
      );
      const element = target ?? fallback;
      if (!target) {
        setError("Không tìm thấy trường chính xác. Hãy kiểm tra phần đang mở.");
        console.warn(
          "Review completion target unavailable",
          issue.code,
          issue.section,
          issue.field,
        );
      }
      element?.scrollIntoView?.({ block: "center" });
      const control = target?.querySelector<HTMLElement>(
        "input:not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled)",
      );
      (control ?? element)?.focus({ preventScroll: true });
    });
  }

  const selectedIssue =
    activeIssue &&
    validationIssues.some(
      (issue) => completionTarget(issue) === completionTarget(activeIssue),
    )
      ? activeIssue
      : undefined;
  const issueTarget = selectedIssue && completionTarget(selectedIssue);

  function issueProps(id: string) {
    return id === issueTarget
      ? { "aria-invalid": true, "aria-describedby": `${id}-hint` }
      : {};
  }

  function fieldHint(id: string) {
    return selectedIssue && id === issueTarget ? (
      <p
        id={`${id}-hint`}
        role="status"
        className="mt-2 border-l-2 border-[var(--theme-accent)] pl-2 text-sm font-semibold"
      >
        {completionGuidance(selectedIssue)}
      </p>
    ) : null;
  }

  async function prepareSubmit() {
    setError("");
    try {
      await autosave.save(buildDraft());
      const confirmed = savedReadiness.current ?? readiness;
      if (confirmed?.readyToSubmit) {
        setConfirmOpen(true);
      } else {
        setChecklistOpen(true);
        requestAnimationFrame(() =>
          document.getElementById("review-completion-checklist")?.focus(),
        );
        if (!confirmed)
          setError("Chưa tải được kết quả kiểm tra. Vui lòng thử lưu lại.");
      }
    } catch {
      setError("Chưa thể lưu phiếu. Nội dung đang nhập vẫn còn trên màn hình.");
    }
  }

  return (
    <>
      <section className="border-t border-[var(--theme-border)] pt-5 text-[var(--theme-text)] sm:pt-6">
        <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--theme-accent)]">
              Phiếu thẩm định
            </p>
            <h2 className="mt-1 text-xl font-bold sm:text-2xl">
              Đánh giá từng tiêu chí
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--theme-muted)]">
              Kiểm tra tài liệu, ghi căn cứ cho từng tiêu chí rồi gửi kết quả.
              Bản nháp được lưu tự động.
            </p>
          </div>
          <span
            className={
              complete
                ? "w-fit rounded-md bg-emerald-100 px-3 py-2 text-sm font-bold text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100"
                : "w-fit rounded-md bg-amber-100 px-3 py-2 text-sm font-bold text-amber-950 dark:bg-amber-950/50 dark:text-amber-100"
            }
          >
            {readOnly ? "Đã gửi" : complete ? "Sẵn sàng gửi" : "Đang thẩm định"}
          </span>
        </header>
        <div
          aria-label="Tiến độ thẩm định"
          className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm"
        >
          <span className="text-[var(--theme-muted)]">
            <strong className="tabular-nums text-[var(--theme-text)]">
              {reviewedFiles}/{evidences.length}
            </strong>{" "}
            tài liệu đã kiểm tra
          </span>
          <span className="text-[var(--theme-muted)]">
            <strong className="tabular-nums text-[var(--theme-text)]">
              {completedCriteria}/{rubric.criteria.length}
            </strong>{" "}
            tiêu chí hoàn tất
          </span>
        </div>
        <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-[11rem_minmax(0,1fr)]">
          <div className="min-w-0 space-y-3">
            <nav
              className="grid grid-cols-2 gap-1 lg:grid-cols-1"
              aria-label="Công việc thẩm định"
            >
              {steps.map(({ id, label, progress }) => (
                <button
                  type="button"
                  key={id}
                  aria-label={label}
                  aria-describedby={`review-step-progress-${id}`}
                  aria-current={task === id ? "step" : undefined}
                  className="block min-h-11 w-full rounded-lg px-3 py-2 text-left text-sm aria-[current=step]:bg-[var(--theme-elevated)]"
                  onClick={() => {
                    setTask(id);
                    setActiveIssue(undefined);
                  }}
                >
                  <span className="block font-semibold">{label}</span>
                  <span
                    id={`review-step-progress-${id}`}
                    className="text-xs text-[var(--theme-muted)]"
                  >
                    {progress}
                  </span>
                </button>
              ))}
            </nav>
            {!readOnly && validationIssues.length ? (
              <Button
                type="button"
                variant="outline"
                aria-expanded={checklistOpen}
                onClick={() => setChecklistOpen(!checklistOpen)}
              >
                Mục cần hoàn tất ({validationIssues.length})
              </Button>
            ) : null}
          </div>
          <div className="min-w-0">
            {checklistOpen && validationIssues.length ? (
              <section
                id="review-completion-checklist"
                tabIndex={-1}
                className="mb-4 rounded-lg border border-[var(--theme-border)] p-4"
              >
                <h3 className="font-bold">Nội dung cần hoàn tất</h3>
                <ul className="mt-2 divide-y divide-[var(--theme-border)]">
                  {validationIssues.map((issue) => (
                    <li
                      key={`${issue.code}:${issue.entityId ?? ""}:${issue.field}`}
                      className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                    >
                      <div>
                        <p className="font-semibold">{issueLabel(issue)}</p>
                        <p>{completionGuidance(issue)}</p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => goToIssue(issue)}
                        aria-label={`Đi đến ${issueLabel(issue) ?? ""} ${completionGuidance(issue)}`}
                      >
                        Đi đến
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            <form
              className="min-w-0 space-y-5 [&_[aria-invalid=true]]:outline-2 [&_[aria-invalid=true]]:outline-offset-2 [&_[aria-invalid=true]]:outline-[var(--theme-accent)]"
              onSubmit={(event) => event.preventDefault()}
            >
              <div
                hidden={task !== "documents"}
                id="review-step-documents"
                tabIndex={-1}
              >
                <ReviewEvidenceAssessments
                  assessments={assessments}
                  evidences={evidences}
                  onChange={setAssessments}
                  readOnly={readOnly}
                  activeIssue={selectedIssue}
                  savedAssessments={savedAssessments}
                  selectedMediaId={selectedMediaId}
                  onSelectMedia={setSelectedMediaId}
                />
              </div>
              {rubric.gates.length ? (
                <section
                  hidden={task !== "conditions"}
                  id="review-step-conditions"
                  tabIndex={-1}
                  className="space-y-3"
                  aria-labelledby="review-conditions"
                >
                  <h3 className="text-lg font-bold" id="review-conditions">
                    Điều kiện tiếp nhận
                  </h3>
                  <label className="block text-sm font-semibold">
                    Chọn điều kiện tiếp nhận
                    <select
                      className="mt-2 min-h-11 w-full rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3"
                      value={selectedGate}
                      onChange={(event) => setSelectedGate(event.target.value)}
                    >
                      {rubric.gates.map((gate) => (
                        <option key={gate.key} value={gate.key}>
                          {gate.label} ·{" "}
                          {gates[gate.key]?.outcome &&
                          gates[gate.key]?.outcome !== "UNASSESSED"
                            ? "Đã đánh giá"
                            : "Chưa đánh giá"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="space-y-3">
                    {rubric.gates.map((gate) => {
                      const answer = gates[gate.key] ?? {
                        outcome: "UNASSESSED" as const,
                        rationale: "",
                        evidenceMediaIds: [],
                      };
                      return (
                        <fieldset
                          className="min-w-0 rounded-xl bg-[var(--theme-elevated)] p-4 sm:p-5"
                          hidden={selectedGate !== gate.key}
                          disabled={readOnly}
                          key={gate.key}
                        >
                          <legend className="px-1 font-bold">
                            {gate.label}
                          </legend>
                          <p className="mt-1 text-sm leading-6 text-[var(--theme-muted)]">
                            {gate.description}
                          </p>
                          <div className="mt-3 grid gap-3">
                            <select
                              id={`verdict-gate-outcome-${gate.key}`}
                              {...issueProps(
                                `verdict-gate-outcome-${gate.key}`,
                              )}
                              aria-label={`Kết quả ${gate.label}`}
                              className="min-h-11 w-full min-w-0 rounded-lg border bg-[var(--theme-surface)] px-3"
                              onChange={(event) =>
                                setGates((current) => ({
                                  ...current,
                                  [gate.key]: {
                                    ...answer,
                                    outcome: event.target
                                      .value as ReviewGateAnswer["outcome"],
                                  },
                                }))
                              }
                              value={answer.outcome}
                            >
                              <option value="UNASSESSED">Chưa đánh giá</option>
                              <option value="PASS">Đáp ứng</option>
                              <option value="FAIL">Không đáp ứng</option>
                              <option value="NOT_APPLICABLE">
                                Không áp dụng
                              </option>
                            </select>
                            {fieldHint(`verdict-gate-outcome-${gate.key}`)}
                            <div>
                              <textarea
                                aria-label={`Căn cứ ${gate.label}`}
                                className="min-h-28 w-full resize-y rounded-lg border bg-[var(--theme-surface)] p-3 leading-6"
                                id={`verdict-gate-rationale-${gate.key}`}
                                {...issueProps(
                                  `verdict-gate-rationale-${gate.key}`,
                                )}
                                maxLength={2_000}
                                onChange={(event) =>
                                  setGates((current) => ({
                                    ...current,
                                    [gate.key]: {
                                      ...answer,
                                      rationale: event.target.value,
                                    },
                                  }))
                                }
                                placeholder="Nêu kết quả đối chiếu (tối thiểu 20 ký tự)"
                                value={answer.rationale}
                              />
                              {fieldHint(`verdict-gate-rationale-${gate.key}`)}
                              <p className="mt-1 text-right text-xs text-[var(--theme-muted)]">
                                {answer.rationale.trim().length >= 20
                                  ? "Đủ độ dài căn cứ"
                                  : `Cần thêm ${20 - answer.rationale.trim().length} ký tự`}
                              </p>
                            </div>
                          </div>
                          <ReviewEvidenceSelect
                            disabled={readOnly}
                            evidences={evidences}
                            label={gate.label}
                            onChange={(ids) =>
                              setGates((current) => ({
                                ...current,
                                [gate.key]: {
                                  ...answer,
                                  evidenceMediaIds: ids,
                                },
                              }))
                            }
                            value={answer.evidenceMediaIds}
                          />
                        </fieldset>
                      );
                    })}
                  </div>
                </section>
              ) : null}

              <section
                hidden={task !== "criteria"}
                id="review-step-criteria"
                tabIndex={-1}
                className="[&[hidden]]:hidden grid min-w-0 gap-4"
                aria-labelledby="review-verdicts"
              >
                <div className="min-w-0">
                  <h3 className="text-lg font-bold" id="review-verdicts">
                    Kết luận từng tiêu chí
                  </h3>
                  <p className="mt-1 text-sm text-[var(--theme-muted)]">
                    Chọn một tiêu chí để đối chiếu minh chứng và ghi nhận định.
                    Nội dung đã nhập được giữ khi chuyển tiêu chí.
                  </p>
                </div>
                <label className="text-sm font-semibold lg:hidden">
                  Chọn tiêu chí đang đánh giá
                  <select
                    className="mt-2 min-h-11 w-full rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3"
                    value={activeCriterionKey}
                    onChange={(event) => selectCriterion(event.target.value)}
                  >
                    {rubric.criteria.map((criterion, index) => (
                      <option key={criterion.key} value={criterion.key}>
                        {index + 1}. {criterion.label} ·{" "}
                        {verdicts[criterion.key]?.outcome
                          ? "Đã chọn kết luận"
                          : "Chưa đánh giá"}
                      </option>
                    ))}
                  </select>
                </label>
                <nav
                  aria-label="Tiến độ từng tiêu chí"
                  className="hidden min-w-0 flex-wrap gap-2 lg:flex"
                >
                  {rubric.criteria.map((criterion, index) => {
                    const isComplete =
                      Boolean(savedVerdicts[criterion.key]) &&
                      !blocked("criteria", criterion.key);
                    return (
                      <button
                        aria-pressed={criterion.key === activeCriterionKey}
                        aria-controls={`review-criterion-${criterion.key}`}
                        className={[
                          "inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-accent)]",
                          criterion.key === activeCriterionKey
                            ? "border-[var(--theme-accent)]"
                            : "border-transparent",
                          isComplete
                            ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100"
                            : "bg-[var(--theme-elevated)] text-[var(--theme-text)] hover:bg-[var(--theme-border)]",
                        ].join(" ")}
                        onClick={() => selectCriterion(criterion.key)}
                        type="button"
                        key={criterion.key}
                      >
                        <span className="font-mono text-xs">{index + 1}</span>
                        <span>{criterion.label}</span>
                        <span className="text-xs opacity-75">
                          {isComplete ? "Đã xong" : "Cần làm"}
                        </span>
                      </button>
                    );
                  })}
                </nav>
                <div className="min-w-0 space-y-3">
                  {rubric.criteria.map((criterion, index) => {
                    const answer = verdicts[criterion.key] ?? {
                      outcome: null,
                      rationale: "",
                      evidenceMediaIds: [],
                    };
                    const evidenceIssue = criterionEvidenceIssue(
                      rubric,
                      criterion,
                      answer,
                      assessments,
                    );
                    return (
                      <fieldset
                        hidden={criterion.key !== activeCriterionKey}
                        tabIndex={-1}
                        className="min-w-0 scroll-mt-28 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4 sm:p-5"
                        disabled={readOnly}
                        id={`review-criterion-${criterion.key}`}
                        key={criterion.key}
                      >
                        <legend className="max-w-full px-0 font-bold">
                          <span className="mr-2 inline-grid size-7 place-items-center rounded-full bg-[var(--theme-elevated)] text-xs text-[var(--theme-accent)]">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          {criterion.label}
                        </legend>
                        <p className="mt-1 text-sm leading-6 text-[var(--theme-muted)]">
                          {criterion.description}
                        </p>
                        {claims
                          .filter(
                            (claim) => claim.criterionKey === criterion.key,
                          )
                          .map((claim) => (
                            <div
                              className="mt-3 border-l-2 border-[var(--theme-accent)] bg-[var(--theme-elevated)] p-3 text-sm"
                              key={claim.id}
                            >
                              <p className="font-semibold">
                                Nhận định do người nộp khai báo
                              </p>
                              <p className="mt-1 whitespace-pre-wrap break-words leading-6">
                                {claim.statement}
                              </p>
                              <p className="mt-2 text-xs text-[var(--theme-muted)]">
                                {claim.evidenceMediaIds.length} tài liệu hỗ trợ.
                                Nội dung tự khai cần được đối chiếu độc lập.
                              </p>
                              {claim.evidenceMediaIds.length ? (
                                <ul className="mt-2 space-y-1">
                                  {claim.evidenceMediaIds.map((id) => (
                                    <li className="break-words" key={id}>
                                      {evidences.find(
                                        (file) => file.mediaAssetId === id,
                                      )?.title ??
                                        "Tài liệu không có trong phiên bản đã khóa"}
                                    </li>
                                  ))}
                                </ul>
                              ) : null}
                            </div>
                          ))}
                        <fieldset className="mt-4" disabled={readOnly}>
                          <legend className="text-sm font-bold">
                            Chọn kết luận
                          </legend>
                          <div className="mt-2 grid gap-2 sm:grid-cols-2">
                            {outcomeOptions
                              .filter(
                                (option) =>
                                  option.value !== "NOT_APPLICABLE" ||
                                  rubric.evidencePolicyVersion !== "2026.1" ||
                                  criterion.allowNotApplicable,
                              )
                              .map((option, optionIndex) => {
                                const selected =
                                  answer.outcome === option.value;
                                return (
                                  <label
                                    className={[
                                      "flex min-h-14 items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--theme-accent)]",
                                      selected
                                        ? option.selectedClass
                                        : "border-[var(--theme-border)] bg-[var(--theme-elevated)] hover:border-[var(--theme-accent)]",
                                      readOnly
                                        ? "cursor-default"
                                        : "cursor-pointer",
                                    ].join(" ")}
                                    key={option.value}
                                  >
                                    <input
                                      aria-label={`${criterion.label}: ${option.label}`}
                                      {...(optionIndex === 0
                                        ? issueProps(
                                            `verdict-outcome-${criterion.key}`,
                                          )
                                        : {})}
                                      checked={selected}
                                      className="sr-only"
                                      disabled={readOnly}
                                      id={
                                        optionIndex === 0
                                          ? `verdict-outcome-${criterion.key}`
                                          : undefined
                                      }
                                      name={`verdict-outcome-${criterion.key}`}
                                      onChange={() =>
                                        setVerdicts((current) => ({
                                          ...current,
                                          [criterion.key]: {
                                            ...answer,
                                            outcome: option.value,
                                          },
                                        }))
                                      }
                                      type="radio"
                                      value={option.value}
                                    />
                                    <span
                                      aria-hidden="true"
                                      className={[
                                        "mt-1.5 size-2 shrink-0 rounded-full",
                                        selected
                                          ? option.markerClass
                                          : "bg-[var(--theme-muted)]",
                                      ].join(" ")}
                                    />
                                    <span>
                                      <span className="block text-sm font-bold">
                                        {option.label}
                                      </span>
                                      <span className="mt-0.5 block text-xs leading-4 opacity-75">
                                        {option.note}
                                      </span>
                                    </span>
                                  </label>
                                );
                              })}
                          </div>
                        </fieldset>
                        <div className="mt-4">
                          <label
                            className="text-sm font-bold"
                            htmlFor={`verdict-rationale-${criterion.key}`}
                          >
                            Nhận định và căn cứ
                          </label>
                          <textarea
                            aria-label={`Nhận định ${criterion.label}`}
                            className="mt-2 min-h-24 w-full rounded-lg border border-[var(--theme-border)] bg-[var(--theme-elevated)] p-3 text-sm leading-6"
                            id={`verdict-rationale-${criterion.key}`}
                            {...issueProps(
                              `verdict-rationale-${criterion.key}`,
                            )}
                            maxLength={2_000}
                            onChange={(event) =>
                              setVerdicts((current) => ({
                                ...current,
                                [criterion.key]: {
                                  ...answer,
                                  rationale: event.target.value,
                                },
                              }))
                            }
                            placeholder="Ghi rõ nội dung đã đối chiếu trong hồ sơ (tối thiểu 20 ký tự)"
                            value={answer.rationale}
                          />
                          {fieldHint(`verdict-rationale-${criterion.key}`)}
                          <p className="mt-1 text-right text-xs text-[var(--theme-muted)]">
                            {answer.rationale.trim().length >= 20
                              ? "Đã đủ độ dài căn cứ"
                              : `Cần thêm ${20 - answer.rationale.trim().length} ký tự`}
                          </p>
                        </div>
                        {fieldHint(`verdict-outcome-${criterion.key}`)}
                        <div
                          id={`verdict-evidence-${criterion.key}`}
                          {...issueProps(`verdict-evidence-${criterion.key}`)}
                          tabIndex={-1}
                        >
                          <ReviewEvidenceSelect
                            disabled={
                              readOnly || answer.outcome === "NOT_APPLICABLE"
                            }
                            evidences={evidences}
                            label={criterion.label}
                            onChange={(ids) =>
                              setVerdicts((current) => ({
                                ...current,
                                [criterion.key]: {
                                  ...answer,
                                  evidenceMediaIds: ids,
                                },
                              }))
                            }
                            value={answer.evidenceMediaIds}
                          />
                          {fieldHint(`verdict-evidence-${criterion.key}`)}
                          {evidenceIssue ? (
                            <p className="mt-2 text-sm text-[var(--theme-muted)]">
                              {evidenceIssue}
                            </p>
                          ) : null}
                        </div>
                      </fieldset>
                    );
                  })}
                  {rubric.criteria.length > 1 ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--theme-border)] pt-3">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={activeCriterionIndex === 0}
                        onClick={() =>
                          selectCriterion(
                            rubric.criteria[activeCriterionIndex - 1]!.key,
                            true,
                          )
                        }
                      >
                        Tiêu chí trước
                      </Button>
                      <span
                        className="text-sm text-[var(--theme-muted)]"
                        role="status"
                      >
                        Tiêu chí {activeCriterionIndex + 1}/
                        {rubric.criteria.length}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={
                          activeCriterionIndex === rubric.criteria.length - 1
                        }
                        onClick={() =>
                          selectCriterion(
                            rubric.criteria[activeCriterionIndex + 1]!.key,
                            true,
                          )
                        }
                      >
                        Tiêu chí tiếp theo
                      </Button>
                    </div>
                  ) : null}
                </div>
              </section>

              <section
                hidden={task !== "report"}
                className="[&[hidden]]:hidden grid scroll-mt-24 gap-4 rounded-xl bg-[var(--theme-elevated)] p-4 sm:grid-cols-2 sm:p-5"
                id="review-final-result"
                tabIndex={-1}
              >
                <div className="sm:col-span-2">
                  <h3 className="text-lg font-bold">Tổng hợp thẩm định</h3>
                  {rubric.gates.length ? (
                    <details className="mt-3 border-b border-[var(--theme-border)] py-2 text-sm">
                      <summary className="cursor-pointer font-semibold">
                        Điều kiện tiếp nhận · {completedGates}/
                        {rubric.gates.length}
                      </summary>
                      <ul className="space-y-2 py-2">
                        {rubric.gates.map(({ key, label }) => (
                          <li key={key}>
                            <strong>{label}</strong> ·{" "}
                            {gateOutcomeLabel(savedGates[key]?.outcome)}
                            {savedGates[key]?.rationale ? (
                              <p className="break-words text-[var(--theme-muted)]">
                                {savedGates[key].rationale}
                              </p>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                  {evidences.length ? (
                    <details className="border-b border-[var(--theme-border)] py-2 text-sm">
                      <summary className="cursor-pointer font-semibold">
                        Minh chứng · {reviewedFiles}/{evidences.length}
                      </summary>
                      <ul className="space-y-2 py-2">
                        {evidences.map(({ title, mediaAssetId }) => {
                          const assessment = savedAssessments[mediaAssetId];
                          return (
                            <li key={mediaAssetId}>
                              <strong>{title}</strong> ·{" "}
                              {documentOutcomeLabel(assessment?.status)}
                              {assessment?.note ? (
                                <p className="break-words text-[var(--theme-muted)]">
                                  {assessment.note}
                                </p>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    </details>
                  ) : null}
                  <p className="mt-2 text-sm">
                    Đã hoàn tất {completedCriteria}/{rubric.criteria.length}{" "}
                    tiêu chí · Đã kiểm tra {reviewedFiles}/{evidences.length}{" "}
                    tài liệu
                  </p>
                  <dl className="mt-3 grid grid-cols-2 gap-3 border-y border-[var(--theme-border)] py-3 sm:grid-cols-4">
                    {outcomeOptions
                      .filter((option) => option.value !== "NOT_APPLICABLE")
                      .map((option) => (
                        <div key={option.value}>
                          <dt className="text-xs text-[var(--theme-muted)]">
                            {option.label}
                          </dt>
                          <dd className="mt-1 font-bold tabular-nums">
                            {
                              Object.values(savedVerdicts).filter(
                                (verdict) => verdict.outcome === option.value,
                              ).length
                            }
                          </dd>
                        </div>
                      ))}
                  </dl>
                  <ul className="mt-3 space-y-2 text-sm">
                    {rubric.criteria.map((criterion) => {
                      const saved = savedVerdicts[criterion.key];
                      const referenced = evidences.filter(({ mediaAssetId }) =>
                        saved?.evidenceMediaIds.includes(mediaAssetId),
                      );
                      return (
                        <li
                          key={criterion.key}
                          className="flex flex-wrap justify-between gap-2 border-b border-[var(--theme-border)] pb-2"
                        >
                          <button
                            type="button"
                            className="min-h-11 text-left font-semibold text-[var(--theme-accent)]"
                            onClick={() => {
                              setTask("criteria");
                              selectCriterion(criterion.key);
                            }}
                          >
                            {criterion.label}
                          </button>
                          <span>
                            {outcomeOptions.find(
                              (option) => option.value === saved?.outcome,
                            )?.label ?? "Chưa đánh giá"}
                          </span>
                          {saved?.rationale ? (
                            <p className="basis-full break-words text-[var(--theme-muted)]">
                              {saved.rationale}
                            </p>
                          ) : null}
                          {referenced.length ? (
                            <p className="basis-full break-words text-xs text-[var(--theme-muted)]">
                              Dẫn chiếu ·{" "}
                              {referenced.map(({ title }) => title).join(", ")}
                            </p>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <div
                  className="border-l-2 border-[var(--theme-accent)] pl-4"
                  role="status"
                >
                  <p className="text-xs font-bold uppercase tracking-wider text-[var(--theme-muted)]">
                    Kết quả từ các tiêu chí
                  </p>
                  <p className="mt-2 text-lg font-bold">
                    {resultLabel(savedReview?.recommendation ?? null)}
                  </p>
                </div>
                <div>
                  <label
                    className="text-sm font-bold"
                    htmlFor="verdict-feedback"
                  >
                    Nội dung gửi người nộp
                  </label>
                  <textarea
                    className="mt-2 min-h-24 w-full rounded-xl border bg-[var(--theme-surface)] p-3"
                    disabled={readOnly}
                    id="verdict-feedback"
                    {...issueProps("verdict-feedback")}
                    onChange={(event) =>
                      setApplicantFeedback(event.target.value)
                    }
                    placeholder="Nêu rõ nội dung cần bổ sung hoặc lý do không đáp ứng"
                    value={applicantFeedback}
                  />
                  {fieldHint("verdict-feedback")}
                </div>
                <details
                  className="rounded-lg bg-[var(--theme-surface)] p-3 sm:col-span-2"
                  open={Boolean(privateNote)}
                >
                  <summary className="cursor-pointer text-sm font-bold">
                    Ghi chú nội bộ
                    <span className="ml-2 text-xs font-normal text-[var(--theme-muted)]">
                      Chỉ kiểm duyệt viên xem
                    </span>
                  </summary>
                  <label
                    className="mt-3 block text-sm font-semibold"
                    htmlFor="verdict-private-note"
                  >
                    Ghi chú cho nhóm xử lý
                  </label>
                  <textarea
                    className="mt-2 min-h-20 w-full rounded-lg border border-[var(--theme-border)] bg-[var(--theme-elevated)] p-3 text-sm"
                    disabled={readOnly}
                    id="verdict-private-note"
                    onChange={(event) => setPrivateNote(event.target.value)}
                    value={privateNote}
                  />
                </details>
              </section>

              {error ? (
                <p className="text-sm font-semibold text-red-700" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="review-submit-bar lg:sticky lg:bottom-0 z-20 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-t-xl bg-[var(--theme-surface)]/95 px-4 py-2 shadow-[0_-8px_24px_rgb(15_23_42_/_10%)] backdrop-blur sm:px-5">
                <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
                  <p
                    aria-live="polite"
                    className="flex items-center gap-2 text-xs font-semibold text-[var(--theme-muted)]"
                    data-testid="review-save-status"
                    role={
                      saveError || autosave.status === "error"
                        ? "alert"
                        : "status"
                    }
                  >
                    {readOnly ? (
                      <>
                        <CheckCircle2 className="size-4" />
                        Kết quả đã gửi.
                      </>
                    ) : saveError || autosave.status === "error" ? (
                      <>
                        <AlertCircle className="size-4 text-red-700" />
                        {saveError instanceof ApiError &&
                        saveError.code === "REVIEW_CONFLICT"
                          ? "Phiên bản hồ sơ hoặc bản nháp đã thay đổi. Hãy sao chép nội dung đang nhập trước khi tải lại."
                          : "Chưa lưu được bản nháp."}
                      </>
                    ) : isSaving ||
                      autosave.status === "saving" ||
                      autosave.status === "pending" ? (
                      <>
                        <LoaderCircle className="size-4 animate-spin" />
                        {autosave.status === "pending"
                          ? "Có thay đổi chưa lưu…"
                          : "Đang lưu thay đổi…"}
                      </>
                    ) : (
                      <>
                        <Save className="size-4" />
                        {savedReview
                          ? "Đã lưu bản nháp."
                          : "Chưa có bản nháp đã lưu."}
                      </>
                    )}
                  </p>
                  <p className="text-sm font-bold text-[var(--theme-text)]">
                    {complete
                      ? resultLabel(recommendation)
                      : "Kiểm tra bản nháp trước khi gửi"}
                  </p>
                </div>
                {!readOnly ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isSaving || isSubmitting}
                    onClick={() =>
                      void autosave
                        .save(buildDraft())
                        .catch(() =>
                          setError("Chưa thể lưu phiếu. Vui lòng thử lại."),
                        )
                    }
                  >
                    {saveError || autosave.status === "error"
                      ? "Thử lưu lại"
                      : "Lưu bản nháp"}
                  </Button>
                ) : null}
                {!readOnly ? (
                  <Button
                    disabled={isSaving || isSubmitting}
                    onClick={() => void prepareSubmit()}
                    type="button"
                  >
                    <Send className="size-4" />
                    {complete ? "Gửi kết quả thẩm định" : "Kiểm tra để gửi"}
                  </Button>
                ) : null}
              </div>
            </form>
          </div>
        </div>
      </section>
      <ConfirmationDialog
        confirmLabel="Xác nhận gửi"
        description="Sau khi gửi, kết luận và tài liệu dẫn chiếu sẽ được khóa."
        isPending={isSubmitting}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() =>
          void onSubmit()
            .then(() => setConfirmOpen(false))
            .catch((failure: unknown) => {
              setConfirmOpen(false);
              if (failure instanceof ApiError && failure.details?.readiness) {
                const result = failure.details.readiness as ReviewReadiness;
                savedReadiness.current = result;
                setServerIssues(result.issues);
                setChecklistOpen(true);
                requestAnimationFrame(() =>
                  document
                    .getElementById("review-completion-checklist")
                    ?.focus(),
                );
              } else {
                setError("Chưa thể gửi kết quả. Kiểm tra bản nháp và thử lại.");
              }
            })
        }
        open={confirmOpen && (complete || isSubmitting)}
        title="Xác nhận gửi kết quả"
      />
    </>
  );
}
