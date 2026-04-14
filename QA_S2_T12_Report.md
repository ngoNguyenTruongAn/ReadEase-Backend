# Báo Cáo Hoàn Thành Nhiệm Vụ 
**[S2-T12] Guardian API — Child Linking & COPPA Approval**

## Tổng quan
Lỗ hổng (gap) trong Backlog Sprint 2 giữa UI "Vui lòng liên hệ Người bảo hộ" và Logic Backend đã chính thức được vá lại.
Máy chủ (Backend) giờ đây đã áp dụng tiêu chuẩn bảo vệ quyền trẻ em (COPPA). Tài khoản của học sinh tạo ra sẽ ở trạng thái chờ đợi mã vạch (*invite_code*) cho đến khi Phụ huynh (Guardian) chấp thuận.

## Các thay đổi kỹ thuật chính (Tech Spec Changes)

| Hạng mục | Chi tiết triển khai | DB/File ảnh hưởng |
|--|--|--|
| **Cơ sở dữ liệu (Database)** | Add column `guardian_invite_code` (VARCHAR, UNIQUE) và `guardian_invite_code_expires_at`. | `migration/...-add-child-invite-code.js` |
| **Logic Xác thực (Auth Flow)** | Sửa đổi logic `verifyEmail`. Nếu Role là `ROLE_CHILD`, backend lập tức generate chuỗi Random 8-character HEX, gán cho User, và khoá cố định `is_active = false`. Đẩy đoạn code đó về body response cho Frontend hiện lên màn hình ngay lúc Verify thành công. | `auth.service.js` |
| **Luồng Phụ huynh (Guardian)** | Viết mới api `POST /api/v1/guardian/link-child` nhận đầu vào là Invite Code. Backend tự chui vào bảng Users đọc xem Invite Code đó thuộc Child nào. Validate thời gian hết hạn (7 ngày). | `guardian.service.js`, `guardian.controller.js` |
| **COPPA & Activation** | Nếu mã đúng, tạo bản phân quyền `INSERT INTO guardian_children` (lưu luôn ngày giờ COPPA_PARENTAL). Đồng thời bật xanh `is_active = true` ở User Child và null hoá (bỏ đi) mã Invite Code đó để chống dùng lại (Duplicate). | `guardian.service.js` |
| **Bảo mật (Security)** | Ngăn Child đăng nhập (Login từ chối nếu accounts bị false). Đảm bảo Validation DTO của Invite Code tuân thủ RegExp Uppercase/Numeric 8 chuỗi. | `login` Auth, `link-child.dto.js` |
| **Testing** | Unit Testing module Guardian và module Auth cập nhật đúng expectation `ROLE_CHILD` is assigned `false` pending review. Vượt qua 100% 147 Total Jest Suites. | `auth.service.spec.js` |

## Trạng thái triển khai:
Toàn bộ code đã hoàn thành, chuẩn hoá clean-code Lint, Pass toàn bộ Tests. 
Bạn có thể tham khảo tệp tin `QA_S2_T12_Guardian_Linking.md` đã được biên dịch thành Test-Case để QA kiểm tra trên Postman.

## Next Steps cho Team:
1. Thông báo cho bạn lập trình viên Front-End update UI của `S1-T07` để nó hiển thị mã `inviteCode` (lấy từ API response `/auth/verify-email`) lên thay vì chữ "Vui lòng liên hệ" chung chung đợt trước.
2. Front-End có thể thi công nốt UI nhập mã invite này trong Màn hình Guardian (S2-T07).
