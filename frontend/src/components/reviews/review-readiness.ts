import type { ReviewCompletionIssue } from "@/lib/api/types";

const guidance: Record<string, string> = {
  ADMISSION_OUTCOME_MISSING: "Chọn kết luận cho điều kiện tiếp nhận.",
  ADMISSION_RATIONALE_MISSING: "Ghi căn cứ tiếp nhận, tối thiểu 20 ký tự.",
  ADMISSION_UNKNOWN: "Kiểm tra các điều kiện tiếp nhận của phiên bản hồ sơ.",
  CRITERION_UNKNOWN: "Kiểm tra các tiêu chí của phiên bản hồ sơ.",
  CRITERION_OUTCOME_MISSING: "Chọn kết luận cho tiêu chí.",
  CRITERION_RATIONALE_MISSING: "Ghi nhận định, tối thiểu 20 ký tự.",
  CRITERION_RATIONALE_DUPLICATE: "Ghi căn cứ riêng cho tiêu chí này.",
  CRITERION_NOT_APPLICABLE_INVALID:
    "Chọn kết luận khác vì tiêu chí này bắt buộc áp dụng.",
  CRITERION_EVIDENCE_INVALID: "Chọn lại tài liệu dẫn chiếu.",
  CRITERION_EVIDENCE_MISSING: "Chọn tài liệu dẫn chiếu cho kết luận.",
  CRITERION_EVIDENCE_UNRESOLVED:
    "Chọn tài liệu phù hợp đã được kiểm tra hoặc xử lý yêu cầu làm rõ.",
  CRITERION_VERIFICATION_REQUIRED:
    "Kiểm chứng nội dung tài liệu dẫn chiếu hoặc điều chỉnh kết luận.",
  DOCUMENT_ASSESSMENT_INCOMPLETE: "Chọn kết quả kiểm tra tài liệu.",
  DOCUMENT_CLARIFICATION_MISSING:
    "Ghi nội dung cần làm rõ, tối thiểu 10 ký tự.",
  DOCUMENT_CONTRADICTION:
    "Xử lý mâu thuẫn minh chứng trước khi đề nghị phê duyệt.",
  NO_APPLICABLE_CRITERION: "Đánh giá ít nhất một tiêu chí áp dụng cho hồ sơ.",
  REPORT_RECOMMENDATION_MISMATCH:
    "Kiểm tra lại kết luận từng tiêu chí và lưu báo cáo.",
  APPLICANT_FEEDBACK_MISSING: "Ghi nội dung gửi người nộp, tối thiểu 20 ký tự.",
  STORED_EVIDENCE_INVALID:
    "Không đọc được danh sách tài liệu. Hãy tải lại hồ sơ.",
  RUBRIC_INVALID: "Không đọc được bộ tiêu chí. Hãy tải lại hồ sơ.",
};

const verificationFields: Record<string, string> = {
  method: "phương pháp đối chiếu",
  source: "nguồn đối chiếu",
  scope: "phạm vi đã kiểm tra",
  limitations: "giới hạn kiểm chứng",
};

export function completionGuidance(issue: ReviewCompletionIssue) {
  if (issue.code === "VERIFICATION_FIELD_MISSING") {
    return `Ghi ${verificationFields[issue.field] ?? "thông tin kiểm chứng"} cho tài liệu.`;
  }
  return guidance[issue.code] ?? "Kiểm tra trường được đánh dấu và lưu lại.";
}

export function completionTarget(issue: ReviewCompletionIssue) {
  if (issue.entityId) {
    if (issue.section === "documents")
      return `review-document-${issue.field}-${issue.entityId}`;
    if (issue.section === "criteria")
      return `verdict-${issue.field}-${issue.entityId}`;
    if (issue.section === "conditions")
      return `verdict-gate-${issue.field}-${issue.entityId}`;
  }
  if (issue.section === "report")
    return issue.field === "feedback"
      ? "verdict-feedback"
      : "review-final-result";
  return `review-step-${issue.section}`;
}
