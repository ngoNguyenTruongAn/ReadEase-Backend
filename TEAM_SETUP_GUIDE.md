# Hướng Dẫn Chạy Dự Án Cho Đội Ngũ (Team Setup Guide)

Gần đây hệ thống đã bổ sung thêm Core Features mới (Word Segmentation và Guardian Invite Code COPPA). Để đảm bảo chạy dưới Node.js/Python không bị lỗi Schema hay lỗi mất kết nối máy chủ phân tích (ML), mọi người làm theo các bước chuẩn sau đây.

Nên mở 2 Tab Terminal / PowerShell song song để chạy 2 Services (Node và Python).

---

## 🛠️ PHẦN 1: Chạy DB Migration & Backend (NestJS)

Gần đây dự án đã thêm các Cột dữ liệu mới vào PostgreSQL (VD: bảng `users` được thêm cột khóa `guardian_invite_code` cho tính năng đăng ký Child, và thêm `body_segmented` cho Reading Content). Do NestJS đang khoá tính năng tự sinh cột (`synchronize: false` để an toàn), nên **mọi thành viên khi git pull code về bắt buộc phải chạy bộ Migration đồng bộ.**

**Bước 1: Chui vào thư mục thư mục NestJS**
```bash
cd ReadEase-Backend/backend
```

**Bước 2: Cài gói mới (nếu có update file package.json) & Chạy Migration cập nhật Cột Database**
```bash
npm install
npm run migration:run
```
*(Bạn sẽ thấy nó nhắc Database báo 2 chữ `executed successfully` đỏng dạc ở Console. Nếu sau này lỡ ấn chạy nữa nó cũng sẽ kệ không gây lỗi, rất an toàn).*

**Bước 3: Khởi động máy chủ NestJS (Cổng 3000)**
```bash
npm run start:dev
```
Lúc này NestJS sẽ nóng máy chạy ở cổng: `http://localhost:3000`. Cứ treo khung Tab log ở đó nhé!

---

## 🧠 PHẦN 2: Chạy Dịch vụ AI Tiếng Việt (ML-Service FastAPI)

Đây là khoang chứa Model Xử lý ngôn ngữ `underthesea` (Dùng để bắt chữ "con vịt" gom lại thành `con_vịt` giúp Frontend tách từ).

**Bước 1: Đổi sang Tab Terminal thứ 2, nhảy vào khoang thư mục ML**
```bash
cd ReadEase-Backend/ml-service
```

**Bước 2: Cài thư viện Core của Machine Learning (Chỉ cần mọc 1 lần duy nhất cho máy mới)**
```bash
pip install -r requirements.txt
```

**Bước 3: Bật công tắc máy chủ AI (Cổng mặc định: 8000)**

*Chú ý:* Trên máy dùng hệ điều hành Windows, do tiếng Việt sẽ thỉnh thoảng đập vào PowerShell gây nát bộ chữ UNICODE, lệnh sau đã được tráng thêm 1 lớp giải mã UTF-8. 

*(Dành cho Windows PowerShell / VSCode Terminal Windows):*
```powershell
$env:PYTHONIOENCODING='utf-8'; python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

*(Dành cho Mac/Linux Bash):*
```bash
PYTHONIOENCODING=utf-8 python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

**Dấu hiệu thành công:** Terminal phun ra dòng chữ xanh ngọt ngào:
`Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)`

---
🎉 **HOÀN THÀNH KẾT NỐI!**
Ngay lúc này, khi bạn đăng ký/đọc truyện trên port 3000 Front-end thì NestJS sẽ chủ động "móc ngoéo" sang port 8000 của Python để xử lý tiếng Việt trơn tru. Cứ cắm máy đó chạy thôi là ngon rùi!
