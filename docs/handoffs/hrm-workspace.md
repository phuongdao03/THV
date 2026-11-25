# HRM Workspace

## Phạm vi đã triển khai

- `/admin/hr` tái sử dụng `HrDashboardSummary`, gồm số nhân viên đang hoạt động và các hàng đợi chấm công, nghỉ phép, tăng ca, kỳ lương nháp. API giới hạn cho Super Admin ở backend. Liên kết nhân viên đang hoạt động mở danh sách với bộ lọc trạng thái được xử lý qua API hiện có.
- Menu cũ đặt bảy mục dưới Nhân sự. Menu mới nhóm Tổng quan, Nhân sự, Chấm công và Bảng lương trong Quản trị nhân sự, nhóm Phòng ban và Điểm chấm công trong Tổ chức, và nhóm Duyệt tăng ca và Duyệt nghỉ phép trong Phê duyệt nhân sự. Các đường dẫn cũ vẫn phục vụ bookmark và liên kết sâu.
- Hồ sơ nhân viên mới vẫn dùng tài khoản đã đăng ký. Sau khi lưu thành công, thông báo xác nhận cung cấp lối sang màn hình phân công điểm chấm công cho Super Admin. Bước tìm và phân công hồ sơ vẫn thực hiện trên màn hình hiện có.

## Đối chiếu mã nguồn

- `backend/app/modules/hr/service.py` xác thực tài khoản liên kết đang hoạt động, đã xác minh email và khớp email. `models.py` áp dụng chỉ mục duy nhất cho `employees.user_id`, ràng buộc duy nhất cho mã nhân viên và khóa ngoại phòng ban. Phòng ban là trường bắt buộc trong mô hình hiện tại.
- Điểm chấm công, chính sách GPS và phân công có ngày hiệu lực nằm trong các thực thể riêng. Hồ sơ nhân viên được tạo qua API hiện có, sau đó phân công được ghi qua API phân công. Kiểm tra dữ liệu trùng hoặc mất liên kết trong cơ sở dữ liệu đang vận hành vẫn cần môi trường dữ liệu được cấp quyền.
- Tổng quan hiện có sáu số đếm và thời điểm cập nhật. Các số đếm hàng đợi áp dụng cho trạng thái hiện có trên toàn bộ dữ liệu. Chỉ số theo ca hôm nay, lịch sử thay đổi liên phòng ban và thống kê chưa phân công cần xác minh nguồn dữ liệu trước khi hiển thị.
- Playwright hiện sử dụng backend giả lập và fixture tài khoản. Các ca chạy với fixture này kiểm tra điều hướng và hiển thị; vòng đời có ghi dữ liệu cần frontend, FastAPI, PostgreSQL và tài khoản test được cô lập.

## Kiểm thử

- 33 ca frontend tập trung và 22 ca backend tập trung đạt. Build Next.js và kiểm tra kiểu TypeScript đạt. Playwright đạt 2/2 ca tổng quan trên desktop Chrome và Chrome giả lập Pixel 7, sử dụng dữ liệu fixture.
- `npm test` đạt 10 ca root và 1.184 ca frontend ở lần baseline. Bộ backend đầy đủ dừng ở bước thu thập do thiếu `openpyxl`. Các lượt chạy suite Playwright rộng hơn gặp timeout điều hướng ở các ca sẵn có.
- Docker daemon không truy cập được trong phiên này. Chưa xác minh vòng đời có ghi dữ liệu với PostgreSQL và bốn phiên độc lập, GPS qua trình duyệt, WebKit hay tablet.

## Phần còn lại

- Hoàn thiện danh sách và hồ sơ nhân viên, phân công ngay trong luồng tiếp nhận, workspace tổ chức, self-service mobile, trung tâm phê duyệt, bảng công và đối soát bảng lương.
- Chạy vòng đời từ tài khoản đã đăng ký với các phiên Admin, User, Employee A và Employee B độc lập. Kiểm tra GPS trên trình duyệt và đối chiếu thiết bị vật lý, lưu ảnh desktop/mobile và đo hiệu năng trước/sau.
- Hoàn tất audit quyền backend, cấu hình môi trường thử nghiệm và kiểm tra toàn vẹn dữ liệu. Thay đổi chính sách GPS, phân quyền, công thức lương hoặc cấu trúc dữ liệu cần đánh giá tác động và phê duyệt riêng theo hướng dẫn repo.
