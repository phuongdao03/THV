# Audit và thiết kế mobile Tinh Hoa Việt

## Phạm vi và mốc so sánh

Workspace ở commit `872ddff9`, remote có tên `TMI_blockchain_project`. Brief dẫn tới repository `THV`. Chưa đối chiếu được commit production. Chrome DevTools truy cập được trang chủ production. Playwright trực tiếp tới production trả `ERR_NETWORK_ACCESS_DENIED`, nên ảnh đối chiếu được chụp trên máy cục bộ với API giả lập của dự án.

## Phát hiện

| Mức | Khu vực | Bằng chứng | Hướng xử lý |
| --- | --- | --- | --- |
| P1 | Tìm kiếm trang chủ | `home-editorial.css` ẩn form trong hero. Playwright đo input rộng 0px từ 320 đến 1440 trong baseline. | Đưa form lên trước hành động hồ sơ trên điện thoại, dùng tham số GET hiện tại. |
| P1 | Văn bản và thư viện ảnh | Hero mobile dành 160–208px cho biểu trưng riêng. Chrome đo vùng thư viện bắt đầu ở 2268px tại 320px. | Thu gọn hero, giữ văn bản và ảnh ngay sau hero. |
| P1 | Điều hướng | `globals.css` đặt cỡ chữ gốc 0.62rem và ghi đè thành 11px trong stylesheet layout. Các breakpoint 48rem, 64rem và các khai báo drawer lặp nhau. | Tăng cỡ nhãn, dùng chung biến safe-area với nội dung. Giữ nguyên logic phân quyền. |
| P2 | Thư viện ảnh | Hai breakpoint cùng tác động tại 768px. Thumbnail mobile chia nhiều hàng và chiếm thêm chiều cao. | Dùng một dải thumbnail cuộn ngang và giữ thao tác vuốt hiện có. |
| P2 | CSS dùng chung | `globals.css` có 109 dòng media query, 243 dòng chứa `!important` và nhiều cụm selector lặp quanh search/drawer. | Chuyển điều hướng dưới sang stylesheet layout. Giữ thay đổi trang chủ trong stylesheet sở hữu tính năng. |

Chưa xác nhận lỗi P0. Bộ lọc danh mục đã có bottom sheet, quản lý focus và Escape. Gallery đã có nhận diện vuốt. Cộng đồng có route riêng cho chat. Những hành vi này là nền tảng để phát triển tiếp.

## Đặc tả mobile

Dùng palette và token giao diện hiện có. Nhịp khoảng cách 4, 8, 12, 16, 24, 32px. Nội dung chính 16px, nhãn phụ từ 12px. Nút chính và ô nhập tối thiểu 44px. Đường viền mảnh, radius 10–12px, hỗ trợ focus-visible và reduced motion. Trang chủ dùng breakpoint dưới 48rem. Điều hướng dưới tiếp tục dùng breakpoint hiện tại của shell.

Thứ tự triển khai có thể review độc lập gồm trang chủ và gallery, shell/bộ lọc, nội dung cộng đồng và luồng hồ sơ. Kiểm tra viewport 320, 360, 375, 390, 414, 430, 768 và 1440 ở hai theme. Kiểm tra các thao tác có dữ liệu bằng API giả lập, không chạy giao dịch thật. Giữ nguyên luồng nghiệp vụ, routes và phân quyền.

## Thay đổi theo nhóm

| Tệp | Thay đổi |
| --- | --- |
| `frontend/src/app/(public)/page.tsx`, `frontend/src/components/public/home-editorial.css`, `frontend/src/components/public/heritage-symbols.tsx` | Hero gọn hơn, biểu trưng chính thức với nguồn ảnh 64px theo mật độ điểm ảnh và họa tiết trống đồng, tìm kiếm dùng GET `/works?query=…`, văn bản và thư viện tiếp tục đứng ngay sau phần giới thiệu. Dải thumbnail cuộn nội bộ và giữ mô tả, swipe, ảnh lớn, điều khiển bàn phím. |
| `frontend/src/app/globals.css`, `frontend/src/components/layout/navigation.css` | Chuyển CSS thanh dưới về layout, dùng nhãn 12px, bù safe area hai bên và bên dưới. Dùng lại drawer, các đích điều hướng và trạng thái phiên hiện có. |
| `frontend/src/app/(public)/works/page.tsx`, `frontend/src/components/public/public-library.tsx`, `frontend/src/components/public/public-work-detail.tsx` | Danh mục có lối tắt đến tìm kiếm và bộ lọc. Bộ lọc có tiêu đề và nút đóng dễ tiếp cận khi cuộn. Chi tiết đối chiếu có điều khiển mở rộng trên điện thoại, trạng thái và bằng xác lập vẫn hiển thị bình thường. |
| `frontend/src/components/community/community-feed.tsx`, `frontend/src/components/community/community-post-editor.tsx`, `frontend/src/components/dossiers/dossier-create-form.tsx` | Lối vào phòng trò chuyện cạnh luồng bài viết. Font 16px cho trường nhập trên màn hình nhỏ và nút công cụ soạn bài 44px. Tái sử dụng autosave, tải tệp và quản lý nháp hiện tại. |
| `frontend/src/components/wallet/wallet-workspace.tsx`, `frontend/src/components/membership/membership-pricing-page.tsx` | Lịch sử giao dịch xếp mô tả và số tiền theo chiều dọc ở màn hình nhỏ. Mở rộng vùng chạm cho từng nhóm quyền lợi hội viên. |
| `frontend/e2e/home-editorial.spec.ts`, `frontend/e2e/public.spec.ts` | Kiểm tra hiển thị form theo breakpoint, tìm kiếm tiếng Việt và điều khiển mở rộng trên trang chi tiết. |

## Bằng chứng trước và sau

Ảnh cục bộ được tạo từ hai cây nguồn với cùng bộ dữ liệu giả lập. Ở 390px, mép trên phần văn bản chuyển từ khoảng 633px lên 590px. Mép trên phần thư viện và ô tìm kiếm có số đo trong log JSONL. Các ảnh trong thư mục test output được Git bỏ qua.

| 390px | Sáng trước / sau | Tối trước / sau |
| --- | --- | --- |
| Trang chủ | [Trước](../frontend/test-results-mobile-redesign/before-home-light-390.png) · [Sau](../frontend/test-results-mobile-redesign/after-home-light-390.png) | [Trước](../frontend/test-results-mobile-redesign/before-home-dark-390.png) · [Sau](../frontend/test-results-mobile-redesign/after-home-dark-390.png) |
| Văn bản thành lập | [Trước](../frontend/test-results-mobile-redesign/before-decision-light-390.png) · [Sau](../frontend/test-results-mobile-redesign/after-decision-light-390.png) | [Trước](../frontend/test-results-mobile-redesign/before-decision-dark-390.png) · [Sau](../frontend/test-results-mobile-redesign/after-decision-dark-390.png) |
| Thư viện ảnh | [Trước](../frontend/test-results-mobile-redesign/before-gallery-light-390.png) · [Sau](../frontend/test-results-mobile-redesign/after-gallery-light-390.png) | [Trước](../frontend/test-results-mobile-redesign/before-gallery-dark-390.png) · [Sau](../frontend/test-results-mobile-redesign/after-gallery-dark-390.png) |
| Danh mục | [Trước](../frontend/test-results-mobile-redesign/before-works-light-390.png) · [Sau](../frontend/test-results-mobile-redesign/after-works-light-390.png) | [Trước](../frontend/test-results-mobile-redesign/before-works-dark-390.png) · [Sau](../frontend/test-results-mobile-redesign/after-works-dark-390.png) |
| Chi tiết | [Trước](../frontend/test-results-mobile-redesign/before-work-detail-light-390.png) · [Sau](../frontend/test-results-mobile-redesign/after-work-detail-light-390.png) | [Trước](../frontend/test-results-mobile-redesign/before-work-detail-dark-390.png) · [Sau](../frontend/test-results-mobile-redesign/after-work-detail-dark-390.png) |
| Cộng đồng | [Trước](../frontend/test-results-mobile-redesign/before-community-light-390.png) · [Sau](../frontend/test-results-mobile-redesign/after-community-light-390.png) | [Trước](../frontend/test-results-mobile-redesign/before-community-dark-390.png) · [Sau](../frontend/test-results-mobile-redesign/after-community-dark-390.png) |
| Đăng nhập | [Trước](../frontend/test-results-mobile-redesign/before-login-light-390.png) · [Sau](../frontend/test-results-mobile-redesign/after-login-light-390.png) | [Trước](../frontend/test-results-mobile-redesign/before-login-dark-390.png) · [Sau](../frontend/test-results-mobile-redesign/after-login-dark-390.png) |
| Chat hội viên | [Trước](../frontend/test-results-mobile-redesign/before-chat-light-390.png) · [Sau](../frontend/test-results-mobile-redesign/after-chat-light-390.png) | [Trước](../frontend/test-results-mobile-redesign/before-chat-dark-390.png) · [Sau](../frontend/test-results-mobile-redesign/after-chat-dark-390.png) |
| Tạo hồ sơ | [Trước](../frontend/test-results-mobile-redesign/before-dossier-light-390.png) · [Sau](../frontend/test-results-mobile-redesign/after-dossier-light-390.png) | [Trước](../frontend/test-results-mobile-redesign/before-dossier-dark-390.png) · [Sau](../frontend/test-results-mobile-redesign/after-dossier-dark-390.png) |
| Tài khoản | [Trước](../frontend/test-results-mobile-redesign/before-account-light-390.png) · [Sau](../frontend/test-results-mobile-redesign/after-account-light-390.png) | [Trước](../frontend/test-results-mobile-redesign/before-account-dark-390.png) · [Sau](../frontend/test-results-mobile-redesign/after-account-dark-390.png) |
| Ví | [Trước](../frontend/test-results-mobile-redesign/before-wallet-light-390.png) · [Sau](../frontend/test-results-mobile-redesign/after-wallet-light-390.png) | [Trước](../frontend/test-results-mobile-redesign/before-wallet-dark-390.png) · [Sau](../frontend/test-results-mobile-redesign/after-wallet-dark-390.png) |
| Hội viên | [Trước](../frontend/test-results-mobile-redesign/before-membership-light-390.png) · [Sau](../frontend/test-results-mobile-redesign/after-membership-light-390.png) | [Trước](../frontend/test-results-mobile-redesign/before-membership-dark-390.png) · [Sau](../frontend/test-results-mobile-redesign/after-membership-dark-390.png) |
| Thẩm định | [Trước](../frontend/test-results-mobile-redesign/before-reviewer-light-390.png) · [Sau](../frontend/test-results-mobile-redesign/after-reviewer-light-390.png) | [Trước](../frontend/test-results-mobile-redesign/before-reviewer-dark-390.png) · [Sau](../frontend/test-results-mobile-redesign/after-reviewer-dark-390.png) |
| Quản trị | [Trước](../frontend/test-results-mobile-redesign/before-admin-light-390.png) · [Sau](../frontend/test-results-mobile-redesign/after-admin-light-390.png) | [Trước](../frontend/test-results-mobile-redesign/before-admin-dark-390.png) · [Sau](../frontend/test-results-mobile-redesign/after-admin-dark-390.png) |
| Trang chủ, 1440px | [Trước](../frontend/test-results-mobile-redesign/before-home-light-1440.png) · [Sau](../frontend/test-results-mobile-redesign/after-home-light-1440.png) | [Trước](../frontend/test-results-mobile-redesign/before-home-dark-1440.png) · [Sau](../frontend/test-results-mobile-redesign/after-home-dark-1440.png) |

Các ảnh khác có cùng quy ước tên. Nhóm công khai có `login`, `chat` và `membership`. Nhóm có phiên giả lập có `dossier`, `account`, `wallet`, `private-membership`, `reviewer` và `admin`.

## Phạm vi xác nhận

- Chrome DevTools kiểm tra trang chủ production ở toàn bộ tám chiều rộng và hai chủ đề. Danh mục, cộng đồng, đăng nhập và hội viên được kiểm tra thêm tại 320, 390 và 1440px. Các trang này không có cuộn ngang cấp tài liệu ở những lần đo đó. Việc ghi ảnh trực tiếp vào workspace bị giới hạn bởi công cụ Chrome, nên ảnh so sánh dùng máy cục bộ.
- Playwright ghi 52 điểm đo công khai ở mỗi phiên bản và 96 điểm đo có phiên đăng nhập giả lập cho cả hai phiên bản. Tất cả có chênh lệch `scrollWidth - clientWidth` bằng 0. Dải thumbnail là vùng cuộn ngang nội bộ có chủ đích.
- Menu theo vai trò, thanh cố định và trang reviewer/admin được rà ở 320, 390, 768 và 1440px với cả hai chủ đề. Quản trị và thẩm định mới được kiểm tra ở các trang đại diện. Các màn hình con và luồng thao tác nghiệp vụ cần thêm lượt nghiệm thu.
- Tạo hồ sơ tiếp tục dùng wizard, nháp, tải minh chứng và kiểm tra phí hiện có. Hội viên tiếp tục dùng bảng desktop và các nhóm quyền lợi bung gọn trên điện thoại. Chat, bình luận, bổ sung hồ sơ và thanh toán vẫn dùng các luồng hiện có. Các nhánh dữ liệu hiếm, thông báo từng trường, trạng thái tài khoản thật và giao dịch tiền thật nằm ngoài bằng chứng lần này.
- Kiểm tra dùng Chrome mô phỏng. Cần thiết bị iOS để xác nhận bàn phím, thanh công cụ động và safe area phần cứng. Cần dữ liệu hiệu năng triển khai để kết luận Core Web Vitals.

## Xác minh kỹ thuật

- `npm test` chạy qua kiểm tra repository và 1.184 test frontend trong lượt đầu. Backend dừng ở bước thu thập do thiếu `openpyxl` 3.1.5. Nguồn gói trong môi trường không cung cấp bản cài.
- Lượt cuối có 90 test frontend theo tính năng đạt. ESLint frontend, TypeScript, Prettier root và `git diff --check` đạt.
- Playwright desktop đạt 14/14 và mobile đạt 10/10, với 4 test chỉ chạy trong project desktop trong nhóm trang chủ, ảnh/PDF, điều hướng, các cửa vào theo vai trò và trang công khai. Bộ test dùng axe để kiểm tra các trang trạng thái chính. Các lượt chạy rộng trước đó có lần tải lại từ Next.js dev server và lỗi hydration ở trang hội viên. Báo cáo chỉ tính lượt chạy có kết quả xác nhận.
- Lượt kiểm tra tải minh chứng trên mobile dừng trước khi chọn tệp. Một trace cho thấy mock nhận POST tạo bản nháp và trả 201, nhưng trình duyệt vẫn ở `/dossiers/new`. Lượt thử sau khi làm nóng route cũng không chuyển sang chi tiết trong thời gian chờ. Chức năng tải tệp đầu-cuối còn chờ xác nhận.

- Smoke riêng ở 390px dùng mô phỏng touch và reduced motion. Tìm kiếm, mở/đóng bộ lọc và khôi phục focus, mở rộng thông tin đối chiếu, liên kết chat, và axe đều đạt ở cả sáng và tối.
- Lượt dựng mốc cục bộ có sự cố khi Windows di chuyển junction. `frontend/public` và `frontend/node_modules` đã được khôi phục trước lượt kiểm tra Playwright cuối. Git xác nhận thư mục tài nguyên công khai không có diff và npm xác nhận cây phụ thuộc frontend đầy đủ.

[Log Playwright cuối](../frontend/test-results-mobile-redesign/stable-e2e.log) · [Log smoke](../frontend/test-results-mobile-redesign/smoke-ready.log) · [Số đo trước](../frontend/test-results-mobile-redesign/before-final.jsonl) · [Số đo sau](../frontend/test-results-mobile-redesign/after-final.jsonl) · [Số đo theo vai trò](../frontend/test-results-mobile-redesign/roles.jsonl)
