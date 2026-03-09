# ReadEase-Backend
ReadEase Backend & Infrastructure Chào mừng cả nhóm đến với kho lưu trữ Backend của dự án ReadEase. Đây là nơi chứa toàn bộ hạ tầng máy chủ, cơ sở dữ liệu và các dịch vụ AI.🚀
Hướng dẫn khởi động nhanh Để đảm bảo môi trường code của tất cả thành viên giống hệt nhau, chúng ta sẽ chạy mọi thứ qua Docker.
1. Yêu cầu hệ thống Đã cài đặt Docker Desktop
2. Đã cài đặt Node.js 18+ (nếu muốn chạy lệnh npm trực tiếp).
3. Thiết lập môi trường: Copy file .env.example thành file .env. Giữ nguyên các thông số mặc định trong .env để đồng bộ với cấu hình Docker.
4. Lệnh chạy duy nhất: Mở Terminal tại thư mục này và gõ: docker compose up --build
Hệ thống sẽ tự động tải, cài đặt và khởi động: PostgreSQL, Redis, NestJS và Python ML.
🏗️ Cấu trúc dự án (Architecture):
📁 backend/: Chứa mã nguồn NestJS (JavaScript).Kiệt sẽ tập trung viết API và xử lý WebSocket tại đây.
📁 ml-service/: Chứa mã nguồn Python (FastAPI) để chạy các mô hình AI/Machine Learning.
🐳 docker-compose.yml: Điều phối toàn bộ hạ tầng.
⚙️ .github/workflows/: Hệ thống CI/CD tự động kiểm tra lỗi khi có người push code.
🛠️ Thông tin kết nối (Local)Sau khi chạy Docker thành công, các dịch vụ sẽ sẵn sàng tại:
Dịch vụ Địa chỉ (URL) Cổng (Port)
- Backend API (NestJS): URL: http://localhost:3000 Port: 3000
- ML Service (Python): URL: http://localhost:8000 Port: 8000
- PostgreSQL: URL: localhost Port:5432
- Redis: URL: localhost Port: 6379
⚠️ Lưu ý quan trọng cho Team: Không push file .env: File này chứa mật khẩu Database cá nhân, tuyệt đối không đẩy lên GitHub.
- Cài đặt thư viện mới: Nếu cài thêm thư viện npm vào backend/, hãy chạy lại lệnh docker compose up --build để Docker cập nhật lại môi trường.
- Database: Dữ liệu PostgreSQL sẽ được lưu bền vững (Persistent) trong Volume của Docker, nên dù có tắt máy, dữ liệu cũng không bị mất.
-  Nếu Terminal báo lỗi transferring context quá lâu, hãy kiểm tra xem bạn đã có file .dockerignore trong thư mục backend/ chưa để tránh việc Docker copy nhầm thư mục node_modules.
