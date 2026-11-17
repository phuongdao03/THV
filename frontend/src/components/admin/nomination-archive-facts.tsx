const labels: Record<string, string> = {
  dossier: "Thông tin hồ sơ",
  evidences: "Danh mục tài liệu đã nộp",
  schemaVersion: "Định dạng bản lưu",
  code: "Mã hồ sơ",
  subject_name: "Đối tượng",
  subjectName: "Đối tượng",
  categoryId: "Danh mục",
  dossierType: "Loại hồ sơ",
  submittedAt: "Thời gian nộp",
  evidenceType: "Loại tài liệu",
  mediaAssetId: "Mã tệp",
  mimeType: "Định dạng",
  bytes: "Dung lượng",
  sha256: "Mã đối chiếu tệp",
  media: "Thông tin tệp",
  displayOrder: "Thứ tự",
  isPublic: "Được chọn công khai",
  note: "Nhận định / ghi chú",
  archive_id: "Bằng lưu trữ nguồn",
  assignment: "Thông tin phân công",
  owner_user_id: "Người nộp",
  organization_id: "Đơn vị",
  form_data_json: "Thông tin đã khai",
  summary: "Tóm tắt",
  organization_name: "Tên đơn vị",
  email: "Email",
  phone: "Điện thoại",
  address: "Địa chỉ",
  linked_user_id: "Tài khoản liên kết",
  access_scope: "Quyền truy cập",
  evidence_type: "Loại tài liệu",
  evidence_role: "Vai trò tài liệu",
  award_id: "Bằng liên quan",
  media_kind: "Loại tư liệu",
  event_type: "Sự kiện lưu",
  submitted_by: "Người nộp",
  created_by_user_id: "Người tạo",
  title: "Tên",
  status: "Trạng thái",
  scheduled_at: "Thời gian hội đồng",
  closed_at: "Thời gian kết thúc",
  certificate_number: "Số hiệu bằng",
  issued_at: "Ngày cấp",
  issued_by: "Đơn vị cấp",
  recipient_person_id: "Người nhận trong hồ sơ",
  verification_status: "Trạng thái đối chiếu",
  certificate_id: "Bằng nguồn",
  metadata_json: "Thông tin trên bằng",
  predecessor_version_id: "Phiên bản trước",
  change_reason: "Lý do thay thế",
  decided_by: "Người phê duyệt",
  decided_at: "Thời điểm phê duyệt",
  revoked_at: "Thời điểm thu hồi",
  blockchain_transaction_id: "Bản ghi xác thực",
  requested_information: "Thông tin cần bổ sung",
  reason: "Căn cứ / lý do",
  created_by: "Người yêu cầu",
  created_at: "Thời gian",
  due_at: "Hạn bổ sung",
  response: "Phản hồi",
  author_id: "Người phản hồi",
  kind: "Loại phản hồi",
  sequence_no: "Lần phản hồi",
  text: "Nội dung",
  slug: "Đường dẫn công khai",
  version: "Phiên bản",
  short_description: "Mô tả ngắn",
  full_description: "Nội dung chi tiết",
  thumbnail_media_id: "Ảnh bìa",
  author_display_name: "Tác giả hiển thị",
  category_id: "Danh mục",
  visibility: "Phạm vi hiển thị",
  before_json: "Trước thay đổi",
  after_json: "Sau thay đổi",
};
export function ArchiveFacts({ value }: { value: unknown }) {
  if (value == null)
    return <span className="text-[var(--theme-muted)]">Chưa ghi nhận</span>;
  if (Array.isArray(value))
    return (
      <ul className="space-y-2">
        {value.map((item, index) => (
          <li key={index}>
            <ArchiveFacts value={item} />
          </li>
        ))}
      </ul>
    );
  if (typeof value === "object")
    return (
      <dl className="space-y-2">
        {Object.entries(value)
          .filter(
            ([key]) => !["snapshot_json", "report", "snapshot"].includes(key),
          )
          .map(([key, item]) => (
            <div key={key}>
              <dt className="text-xs font-semibold text-[var(--theme-muted)]">
                {Object.hasOwn(labels, key) ? labels[key] : key}
              </dt>
              <dd className="mt-1 break-words whitespace-pre-wrap text-sm">
                <ArchiveFacts value={item} />
              </dd>
            </div>
          ))}
      </dl>
    );
  return (
    <>{typeof value === "boolean" ? (value ? "Có" : "Không") : String(value)}</>
  );
}
