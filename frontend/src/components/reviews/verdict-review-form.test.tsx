import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { VerdictReviewForm } from "@/components/reviews/verdict-review-form";
import { ApiError } from "@/lib/api/client";
import type {
  ReviewData,
  ReviewDraft,
  ReviewReadiness,
  ReviewRubric,
} from "@/lib/api/types";

const rubric: ReviewRubric = {
  version: "2026.3",
  title: "Thẩm định nguồn gốc",
  assessmentMethod: "VERDICT",
  evidencePolicyVersion: "2026.1",
  gates: [],
  criteria: [
    {
      key: "origin",
      label: "Nguồn gốc",
      description: "Đối chiếu thông tin nguồn gốc",
    },
  ],
};

it("focuses one criterion and preserves edits when moving between criteria", async () => {
  const user = userEvent.setup();
  const save = vi.fn().mockImplementation(
    async (draft) =>
      ({
        ...draft,
        readiness: {
          readyToSubmit: false,
          issues: [
            {
              code: "CRITERION_OUTCOME_MISSING",
              section: "criteria",
              field: "outcome",
              entityId: "value",
              label: "Giá trị",
            },
          ],
        },
      }) as ReviewData,
  );
  const submit = vi.fn().mockResolvedValue(undefined);
  render(
    <VerdictReviewForm
      rubric={{
        ...rubric,
        criteria: [
          ...rubric.criteria,
          { key: "value", label: "Giá trị", description: "Đối chiếu giá trị" },
        ],
      }}
      evidences={[]}
      initialReview={null}
      isSaving={false}
      isSubmitting={false}
      onSave={save}
      onSubmit={submit}
      readOnly={false}
    />,
  );
  await user.click(
    screen.getByRole("button", { name: "Đánh giá từng tiêu chí" }),
  );
  expect(screen.queryByRole("radio", { name: "Giá trị: Đáp ứng" })).toBeNull();
  await user.type(
    screen.getByLabelText("Nhận định Nguồn gốc"),
    "Nguồn được đối chiếu độc lập.",
  );
  await user.click(
    screen.getByRole("radio", { name: "Nguồn gốc: Chưa đủ căn cứ" }),
  );
  await user.click(screen.getByRole("button", { name: "Tiêu chí tiếp theo" }));
  expect(screen.getByRole("radio", { name: "Giá trị: Đáp ứng" })).toBeDefined();
  expect(
    screen.queryByRole("radio", { name: "Nguồn gốc: Đáp ứng" }),
  ).toBeNull();
  await user.click(screen.getByRole("button", { name: "Tiêu chí trước" }));
  expect(screen.getByLabelText("Nhận định Nguồn gốc")).toHaveProperty(
    "value",
    "Nguồn được đối chiếu độc lập.",
  );
  expect(
    screen.getByRole("radio", { name: "Nguồn gốc: Chưa đủ căn cứ" }),
  ).toHaveProperty("checked", true);
  await user.click(screen.getByRole("button", { name: "Kiểm tra để gửi" }));
  await user.click(
    await screen.findByRole("button", { name: /Đi đến Giá trị/ }),
  );
  await waitFor(() =>
    expect(screen.getByRole("radio", { name: "Giá trị: Đáp ứng" })).toBe(
      document.activeElement,
    ),
  );
  expect(submit).not.toHaveBeenCalled();
});

it("can request sources for insufficient basis without manufacturing an evidence link", async () => {
  const user = userEvent.setup();
  const save = vi.fn().mockImplementation(
    async (draft) =>
      ({
        ...draft,
        readiness: { readyToSubmit: true, issues: [] },
      }) as ReviewData,
  );
  render(
    <VerdictReviewForm
      rubric={rubric}
      evidences={[]}
      initialReview={null}
      isSaving={false}
      isSubmitting={false}
      onSave={save}
      onSubmit={vi.fn()}
      readOnly={false}
    />,
  );
  await user.click(
    screen.getByRole("button", { name: "Đánh giá từng tiêu chí" }),
  );
  await user.click(
    screen.getByRole("radio", { name: "Nguồn gốc: Chưa đủ căn cứ" }),
  );
  await user.type(
    screen.getByLabelText("Nhận định Nguồn gốc"),
    "Chưa có nguồn độc lập về niên đại được khai báo.",
  );
  await user.click(screen.getByRole("button", { name: "Báo cáo" }));
  await user.type(
    screen.getByLabelText("Nội dung gửi người nộp"),
    "Vui lòng bổ sung tư liệu có niên đại hoặc giải trình nguồn thông tin.",
  );
  await user.click(
    screen.getByRole("button", {
      name: /Kiểm tra để gửi|Gửi kết quả thẩm định/,
    }),
  );
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({
      recommendation: "SUPPLEMENT",
      criterionVerdicts: {
        origin: expect.objectContaining({
          outcome: "INSUFFICIENT_BASIS",
          evidenceMediaIds: [],
        }),
      },
    }),
  );
  expect(
    await screen.findByRole("button", { name: "Xác nhận gửi" }),
  ).toBeDefined();
});

it("shows frozen applicant claims without adopting them as the reviewer's conclusion", async () => {
  render(
    <VerdictReviewForm
      rubric={rubric}
      claims={[
        {
          id: "claim-1",
          criterionKey: "origin",
          statement: "Tác phẩm được sáng tác độc lập năm 2024.",
          evidenceMediaIds: [],
        },
      ]}
      evidences={[]}
      initialReview={null}
      isSaving={false}
      isSubmitting={false}
      onSave={vi.fn()}
      onSubmit={vi.fn()}
      readOnly={false}
    />,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Đánh giá từng tiêu chí" }),
  );
  expect(
    screen.getByText("Tác phẩm được sáng tác độc lập năm 2024."),
  ).toBeDefined();
  expect(
    screen.getByRole("radio", { name: "Nguồn gốc: Đáp ứng" }),
  ).toHaveProperty("checked", false);
  expect(
    screen.getByText(/Nội dung tự khai cần được đối chiếu độc lập/),
  ).toBeDefined();
});

it("opens the sole admission blocker after one document and three criteria are complete", async () => {
  const user = userEvent.setup();
  const criteria = [
    ...rubric.criteria,
    { key: "scope", label: "Phạm vi", description: "Đối chiếu phạm vi" },
    { key: "date", label: "Hiệu lực", description: "Đối chiếu hiệu lực" },
  ];
  const readiness: ReviewReadiness = {
    readyToSubmit: false,
    issues: [
      {
        code: "ADMISSION_OUTCOME_MISSING",
        message: "Every rubric gate requires an assessment.",
        section: "conditions",
        field: "outcome",
        entityId: "rights",
        label: "Quyền nộp hồ sơ",
      },
    ],
  };
  const initialReview: ReviewData = {
    id: "draft",
    assignmentId: "assignment",
    submittedAt: null,
    totalScore: null,
    rubricVersion: rubric.version,
    specialistScore: null,
    truthScore: null,
    transparencyScore: null,
    ownershipScore: null,
    professionalismScore: null,
    respectScore: null,
    criterionComments: {},
    criterionEvidence: {},
    findings: [],
    checklistAnswers: {},
    applicantFeedback: null,
    recommendation: null,
    privateNote: "Bản nháp ghi chú nội bộ",
    gateAnswers: {},
    specialistAnswers: {},
    evidenceAssessments: { media: { status: "VALID", note: "" } },
    criterionVerdicts: Object.fromEntries(
      criteria.map(({ key }) => [
        key,
        {
          outcome: "MEETS",
          rationale: `Nội dung ${key} đã đối chiếu với nguồn của hồ sơ.`,
          evidenceMediaIds: ["media"],
        },
      ]),
    ),
    readiness,
  };
  const save = vi.fn(async (draft: ReviewDraft) => ({
    ...initialReview,
    ...draft,
    readiness: { readyToSubmit: true, issues: [] },
  }));
  const submit = vi
    .fn()
    .mockRejectedValue(
      new ApiError(
        "Every rubric gate requires an assessment.",
        "REVIEW_VALIDATION_ERROR",
        422,
        undefined,
        { readiness },
      ),
    );
  render(
    <VerdictReviewForm
      rubric={{
        ...rubric,
        criteria,
        gates: [
          {
            key: "rights",
            label: "Quyền nộp hồ sơ",
            description: "Đối chiếu quyền nộp",
            required: true,
          },
        ],
      }}
      evidences={[
        {
          id: "document",
          mediaAssetId: "media",
          title: "Tài liệu.pdf",
          evidenceType: "SOURCE_DOCUMENT",
          description: null,
          issuedAt: null,
          displayOrder: 0,
          isPublic: false,
          media: {
            mimeType: "application/pdf",
            bytes: 500,
            sha256: "a".repeat(64),
          },
        },
      ]}
      initialReview={initialReview}
      isSaving={false}
      isSubmitting={false}
      onSave={save}
      onSubmit={submit}
      readOnly={false}
    />,
  );
  expect(
    screen.getByRole("button", { name: "Mục cần hoàn tất (1)" }),
  ).toBeDefined();
  await user.click(screen.getByRole("button", { name: "Kiểm tra để gửi" }));
  await user.click(
    await screen.findByRole("button", { name: /Đi đến Quyền nộp hồ sơ/ }),
  );
  const outcome = screen.getByLabelText("Kết quả Quyền nộp hồ sơ");
  await waitFor(() => expect(document.activeElement).toBe(outcome));
  expect(outcome.getAttribute("aria-invalid")).toBe("true");
  await user.selectOptions(outcome, "PASS");
  await user.type(
    screen.getByLabelText("Căn cứ Quyền nộp hồ sơ"),
    "Đối chiếu giấy ủy quyền với hồ sơ gốc.",
  );
  await user.click(screen.getByRole("button", { name: "Lưu bản nháp" }));
  await screen.findByRole("button", { name: "Gửi kết quả thẩm định" });
  expect(
    screen.queryByRole("button", { name: "Mục cần hoàn tất (1)" }),
  ).toBeNull();
  await user.click(
    screen.getByRole("button", { name: "Gửi kết quả thẩm định" }),
  );
  await user.click(await screen.findByRole("button", { name: "Xác nhận gửi" }));
  expect(
    await screen.findByRole("button", { name: /Đi đến Quyền nộp hồ sơ/ }),
  ).toBeDefined();
  expect(submit).toHaveBeenCalledTimes(1);
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({ privateNote: "Bản nháp ghi chú nội bộ" }),
  );
});
