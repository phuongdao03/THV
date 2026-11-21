# Bàn giao: thẩm định theo kết luận

## Kết quả

- Hồ sơ mới dùng kết luận theo từng tiêu chí thay cho điểm số 5T.
- Kết quả cuối được suy ra từ các kết luận, không cho nhân viên chọn tùy ý.
- Mỗi kết luận phải có nhận định và tài liệu dẫn chiếu; từng tệp cũng phải được kiểm tra.
- Trang reviewer hiển thị loại tài liệu, định dạng và dung lượng bằng nhãn dễ đọc.
- Hồ sơ và phiếu điểm cũ vẫn đọc được bằng giao diện tương thích.

## Quy tắc kết quả

- Có điều kiện bắt buộc không đạt hoặc tiêu chí `DOES_NOT_MEET`: `REJECT`.
- Có tiêu chí `NEEDS_CLARIFICATION`: `SUPPLEMENT`.
- Các tiêu chí còn lại đạt hoặc không áp dụng, đồng thời có ít nhất một tiêu chí áp dụng: `APPROVE`.
- `SUPPLEMENT` và `REJECT` bắt buộc có phản hồi gửi người nộp.

## Dữ liệu và migration

- Migration `0073_verdict_based_reviews` thêm `reviews.criterion_verdicts`.
- Migration tạo phiên bản cấu hình hồ sơ mới với `assessmentMethod=VERDICT`; không sửa hoặc xóa phiên bản cũ.
- Điểm cũ, nhận xét cũ, audit history, API route và dữ liệu hồ sơ được giữ nguyên.

## Kiểm tra hoàn tất phiếu theo kết luận

- Trước đây, form tự tính các mục còn thiếu và thử định vị lỗi đầu tiên. Máy chủ kiểm tra lại khi gửi và dừng ở lỗi đầu tiên, thiếu thông tin định vị.
- Chi tiết phân công và phản hồi lưu bản nháp trả thêm `readiness` cho luồng verdict. Mỗi vấn đề chứa mã ổn định, bước, trường, ID đối tượng khi có và mô tả. Lần gửi kiểm tra lại bằng cùng bộ quy tắc và có thể trả `error.details.readiness`.
- Mỗi dòng trong checklist chọn đúng bước và đối tượng rồi đưa focus tới trường. Trường được đánh dấu kèm hướng dẫn. Khi đích đã đổi, giao diện điều hướng đến phần gần nhất và ghi mã vấn đề vào nhật ký trình duyệt.
- Workspace đặt điều hướng, biểu mẫu và trình xem tài liệu cạnh nhau trên desktop rộng. Trên màn hình nhỏ, reviewer mở tài liệu ở màn riêng và quay lại bản nháp đang nhập. Trình xem tiếp tục dùng liên kết ký theo quyền hiện có.
- Báo cáo tổng hợp kết luận, nhận định và tài liệu dẫn chiếu từ dữ liệu đã lưu. Nhận định trước khi chọn kết luận cũng lưu được với `outcome: null` và vẫn xuất hiện trong checklist. Gửi kết quả đối chiếu token bản nháp dưới khóa giao dịch và kiểm tra phiên bản hồ sơ hiện tại.
- Trường mới được thêm vào phản hồi hiện có. Phiếu lịch sử có điểm số tiếp tục dùng luồng 5T.

### Tệp thay đổi

- Backend trong `backend/app/` gồm `api/v1/reviews.py`, `modules/reviews/{errors,schemas,service,types}.py` và `tests/{test_review_scoring,test_review_scoring_api}.py`.
- Frontend trong `frontend/src/` gồm `lib/api/{client,types}.ts`, `components/admin/review-report-details.tsx` và `components/reviews/{five-t-scorecard,review-evidence-assessments,review-workspace,verdict-review-form}.tsx`, cùng `components/reviews/review-readiness.ts` và hai tệp test colocated cho scorecard và verdict form.
- Kịch bản trình duyệt trong `frontend/e2e/` gồm `critical-journey.spec.ts`, `review-evidence-policy.spec.ts`, `reviewer.spec.ts` và `mock-auth-server.mjs`.

### Kiểm thử thay đổi workspace

- 44 test backend mục tiêu đạt, gồm trường hợp 1/1 tài liệu và 3/3 tiêu chí đã hoàn tất nhưng còn thiếu Quyền nộp hồ sơ, thiếu nguồn đối chiếu, token cũ, phiên bản hồ sơ cũ và hợp đồng lỗi khi gửi.
- Sáu lượt Playwright đạt trên Chrome desktop và mobile với mock API. Các luồng xác nhận focus vào nguồn đối chiếu, khả năng truy cập bằng axe, bố cục sáng/tối và gửi khi đủ điều kiện.
- Lệnh `npm test` bị chặn ở bước thu thập test backend do môi trường thiếu `openpyxl`.

## Kiểm thử phiên bản verdict trước đây

- Backend mục tiêu, migration và API: đã đạt.
- Toàn bộ backend: `740 passed, 2 skipped`.
- Toàn bộ frontend trước thay đổi E2E cuối: `323 passed`.
- Format, lint và typecheck toàn workspace đã đạt trước cập nhật E2E cuối.
- E2E reviewer đã được chuyển sang dữ liệu rubric `VERDICT`, gồm kiểm tra loại/định dạng tệp, kết luận tự động, gửi phiếu và dark mode.

## Việc còn lại trước production

- Chạy lại frontend unit test và E2E trên runner có quyền tạo file tạm trong `frontend/node_modules/.vite-temp`.
- Chạy migration thử trên bản sao database production và xác nhận version mới của từng loại hồ sơ.
- Không cần và không được gửi giao dịch blockchain cho thay đổi này.
