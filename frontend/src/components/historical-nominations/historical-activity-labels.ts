const actions: Record<string, string> = {
  created: "Tạo hồ sơ",
  updated: "Cập nhật thông tin hồ sơ",
  person_added: "Thêm người liên quan",
  person_linked: "Liên kết người liên quan",
  account_linked: "Liên kết tài khoản người nhận",
  award_added: "Thêm bằng xác lập cũ",
  award_updated: "Sửa thông tin bằng cũ",
  media_linked: "Thêm ảnh hoặc tài liệu",
  media_reused: "Gắn tài liệu vào bằng cũ",
  media_unlinked: "Gỡ tài liệu khỏi hồ sơ",
  public_content_draft_saved: "Lưu bản nháp nội dung công khai",
  public_content_draft_submitted: "Gửi nội dung để công bố",
  published: "Xuất bản nội dung",
  public_content_approved: "Công bố nội dung đề cử",
  submitted: "Gửi hồ sơ để xem xét",
  verify: "Xác nhận hồ sơ",
  request_correction: "Yêu cầu bổ sung thông tin",
  hold: "Tạm dừng xem xét",
  reject: "Không chấp thuận hồ sơ",
  award_verify: "Xác nhận thông tin bằng cũ",
  award_request_evidence: "Yêu cầu bổ sung căn cứ cho bằng cũ",
  award_mark_unverifiable: "Ghi nhận bằng cũ chưa đủ căn cứ xác minh",
  hidden: "Ẩn nội dung công khai",
  archived: "Chuyển hồ sơ vào lưu trữ",
  draft_deleted: "Xóa bản nháp",
};
const fields: Record<string, string> = {
  title: "tên hồ sơ",
  subject_name: "tên đối tượng",
  subject_type: "loại đối tượng",
  summary: "tóm tắt",
  description: "mô tả",
  dossier_type_id: "loại hồ sơ",
  historical_result: "thành tích",
  legacy_category_label: "phân loại cũ",
  nominated_at: "ngày đề cử",
  nomination_year: "năm đề cử",
  provenance_notes: "ghi chú nguồn",
  source_kind: "loại nguồn",
  source_label: "tên nguồn",
  source_recorded_at: "ngày ghi nhận nguồn",
  source_reference: "mã tham chiếu",
  category_id: "danh mục",
};
export function historicalActivityLabel(action: string) {
  return (
    actions[action.replace(/^historical_nomination\./, "")] ?? "Cập nhật hồ sơ"
  );
}
export function historicalActivityDescription(changedFields: string[]) {
  const labels = changedFields.flatMap((field) =>
    fields[field] ? [fields[field]] : [],
  );
  return labels.length
    ? `Thông tin đã cập nhật: ${labels.join(", ")}.`
    : "Thay đổi đã được lưu vào hồ sơ.";
}
