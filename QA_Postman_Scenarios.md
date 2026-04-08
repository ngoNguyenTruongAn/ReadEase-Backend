# Kịch Bản Kiểm Thử Postman - Vietnamese Word Segmentation

**Yêu cầu hệ thống**:
1. Khởi chạy Backend NestJS.
2. Khởi chạy ML Service (FastAPI) trước.
3. Import file JSON có sẵn hoặc tạo các request như kịch bản bên dưới.

**Thiết lập Environment**:
- `baseUrl` = `http://localhost:3000/api/v1`
- `token` = `<lấy từ bước login>`
- `contentId` = `<lấy từ bước create>`

---

## 0. Chuẩn bị: Đăng ký & Đăng nhập (Role: `ROLE_CLINICIAN`)

### Đăng ký (Register)
- **POST** `{{baseUrl}}/auth/register`
```json
{
  "email": "vohtuankiet3004@gmail.com",
  "password": "Kiet3004",
  "displayName": "administrator",
  "role": "ROLE_CLINICIAN"
}
```

### Đăng nhập (Login)
- **POST** `{{baseUrl}}/auth/login`
```json
{
  "email": "vohtuankiet3004@gmail.com",
  "password": "Kiet3004"
}
```
*Ghi chú: Lấy `access_token` từ response và gán vào biến environment `token`.*

---

## Bắt đầu kịch bản Segmentation

### 2. Test Case A — Create content (Trạng thái: ML UP)
- **Mục tiêu**: Lưu data cùng `body_segmented` thành công.
- **POST** `{{baseUrl}}/content`
- **Header**: `Authorization: Bearer {{token}}`
```json
{
  "title": "Test segmentation A",
  "body": "Con vịt bơi rất nhanh trong hồ nước. Chú vịt này có bộ lông màu trắng muốt và chiếc mỏ màu vàng trông rất đáng yêu.",
  "difficulty": "EASY",
  "age_group": "5-7"
}
```
**Expect**: Status `201`. Response trả về có chứa thuộc tính `body_segmented` mang giá trị có nối dấu gạch dưới (VD: `hồ_nước`). Nhớ lưu `id` của content này vào biến `contentId`.

---

### 3. Test Case B — Get detail (Không load lại ML)
- **Mục tiêu**: Lấy trường segmented đã được map sẵn dưới DB.
- **GET** `{{baseUrl}}/content/{{contentId}}`
- **Header**: `Authorization: Bearer {{token}}`

**Expect**: Status `200`. Response chứa đủ `body_segmented` đồng nhất với những gì vừa tạo khi nãy, không bị crash.

---

### 4. Test Case C — Update content (Trạng thái: ML UP)
- **Mục tiêu**: Trigger lại hàm NLP khi edit từ ngữ.
- **PUT** `{{baseUrl}}/content/{{contentId}}`
- **Header**: `Authorization: Bearer {{token}}`
```json
{
  "body": "Con mèo đang ngủ trên ghế dài. Cứ mỗi buổi sáng, nó lại ra ngoài sân cỏ để phơi nắng và bắt bướm bay lượn."
}
```
**Expect**: Status `200`. `body_segmented` cập nhật lại theo text mới.

---

### 5. Test Case D — List content
- **Mục tiêu**: Đảm bảo List hoạt động tốt và không bị chặn.
- **GET** `{{baseUrl}}/content?page=1&limit=10`
- **Header**: `Authorization: Bearer {{token}}`

**Expect**: Status `200`. Trả về Array Data, record vừa tạo xuất hiện.

---

### 6. Test Case E — Fallback khi ML DOWN (QUAN TRỌNG NHẤT)
- **Chuẩn bị**: Gõ quyền ngắt Terminal đang chạy ML Engine (`Ctrl + C`) hoặc dùng lệnh `Stop-Process`. Đảm bảo Port 8000 đã chết. Không còn kết nối nhận Segment API.
- **POST** `{{baseUrl}}/content`
- **Header**: `Authorization: Bearer {{token}}`
```json
{
  "title": "Fallback test",
  "body": "Đây là bài kiểm tra tính năng dự phòng an toàn. Hệ thống phải đảm bảo vẫn lưu được câu này khi trí tuệ nhân tạo bị tắt.",
  "difficulty": "EASY",
  "age_group": "5-7"
}
```
**Expect**: Trả về `201 Created` thành công (KHÔNG LỖI 500). `body_segmented` mang chính text chuẩn do backend fall back xuống ("Con vịt bơi").

---

### 7. Test Case F — Validation âm (Negative Test)
- **Mục tiêu**: Test middleware Validator.
- **POST** `{{baseUrl}}/content`
- **Header**: `Authorization: Bearer {{token}}`
```json
{
  "body": "Nội dung này rất dài và đầy đủ độ dài để vượt qua màn kiểm tra của thư viện. Tuy nhiên thiếu mất khoản tiêu đề rồi."
}
```
**Expect**: `400 Bad Request`. Hiển thị message validation "title is required" cụ thể của Joi. Không lưu database.
