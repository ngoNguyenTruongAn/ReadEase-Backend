# 📘 ReadEase Backend — Hướng Dẫn Cài Đặt & Chạy Dự Án Cho Đội Ngũ

> **Cập nhật lần cuối:** 21/04/2026 — Sprint 3 (bổ sung Module Reports + Gemini AI)

---

## 📋 Mục Lục

1. [Yêu Cầu Hệ Thống](#-1-yêu-cầu-hệ-thống)
2. [Kiến Trúc Tổng Quan Dự Án](#-2-kiến-trúc-tổng-quan-dự-án)
3. [Bước 0 — Clone Repository](#-3-bước-0--clone-repository)
4. [Bước 1 — Khởi Động Hạ Tầng (PostgreSQL + Redis)](#-4-bước-1--khởi-động-hạ-tầng-postgresql--redis)
5. [Bước 2 — Cấu Hình Biến Môi Trường (.env)](#-5-bước-2--cấu-hình-biến-môi-trường-env)
6. [Bước 3 — Chạy Backend NestJS (Cổng 3000)](#-6-bước-3--chạy-backend-nestjs-cổng-3000)
7. [Bước 4 — Chạy ML-Service FastAPI (Cổng 8000)](#-7-bước-4--chạy-ml-service-fastapi-cổng-8000)
8. [Bước 5 — Kiểm Tra Hệ Thống Hoạt Động Đúng](#-8-bước-5--kiểm-tra-hệ-thống-hoạt-động-đúng)
9. [Danh Sách Lệnh NPM Quan Trọng](#-9-danh-sách-lệnh-npm-quan-trọng)
10. [Cấu Trúc Thư Mục Dự Án](#-10-cấu-trúc-thư-mục-dự-án)
11. [Xử Lý Sự Cố Thường Gặp (Troubleshooting)](#-11-xử-lý-sự-cố-thường-gặp-troubleshooting)
12. [Quy Ước Làm Việc Với Git](#-12-quy-ước-làm-việc-với-git)

---

## 🖥️ 1. Yêu Cầu Hệ Thống

Trước khi bắt đầu, hãy đảm bảo máy tính của bạn đã cài đặt đầy đủ các công cụ sau:

| Công cụ | Phiên bản tối thiểu | Kiểm tra bằng lệnh | Ghi chú |
|:---|:---|:---|:---|
| **Node.js** | `v20.x` trở lên | `node --version` | Khuyến nghị dùng LTS |
| **npm** | `v10.x` trở lên | `npm --version` | Đi kèm Node.js |
| **Python** | `v3.10` trở lên | `python --version` | Dùng cho ML-Service |
| **pip** | `v23.x` trở lên | `pip --version` | Đi kèm Python |
| **Docker Desktop** | `v4.x` trở lên | `docker --version` | Chạy PostgreSQL + Redis |
| **Git** | `v2.x` trở lên | `git --version` | Quản lý mã nguồn |
| **Postman** | Bản mới nhất | — | Test API thủ công |
| **VS Code** | Bản mới nhất | — | IDE đề xuất |

### Extensions VS Code nên cài:
- ESLint
- Prettier
- REST Client (hoặc Thunder Client)
- Docker

---

## 🏗️ 2. Kiến Trúc Tổng Quan Dự Án

Hệ thống ReadEase Backend bao gồm **4 dịch vụ** chạy song song:

```
┌──────────────────────────────────────────────────────────┐
│                    Frontend (React)                       │
│                 http://localhost:5173                     │
└─────────────────────┬────────────────────────────────────┘
                      │ HTTP + WebSocket
┌─────────────────────▼────────────────────────────────────┐
│             NestJS Backend API (Node.js)                  │
│                 http://localhost:3000                     │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌───────────┐ │
│  │  Auth   │  │ Reading  │  │ Tracking │  │  Reports  │ │
│  │ Module  │  │ Module   │  │ (WS)     │  │ (Gemini)  │ │
│  └────┬────┘  └────┬─────┘  └────┬─────┘  └─────┬─────┘ │
└───────┼────────────┼────────────┼──────────────┼─────────┘
        │            │            │              │
   ┌────▼────────────▼────┐  ┌───▼───┐   ┌──────▼───────┐
   │  PostgreSQL (DB)     │  │ Redis │   │ ML-Service   │
   │  localhost:5432      │  │ :6379 │   │ (FastAPI)    │
   │  Container:          │  │       │   │ localhost:   │
   │  readease_db         │  │       │   │ 8000         │
   └──────────────────────┘  └───────┘   └──────────────┘
```

| Service | Ngôn ngữ | Cổng | Container Docker |
|:---|:---|:---:|:---|
| **Backend API** | Node.js / NestJS | `3000` | Chạy ngoài Docker (dev) |
| **PostgreSQL** | — | `5432` | `readease_db` |
| **Redis** | — | `6379` | `readease_redis` |
| **ML-Service** | Python / FastAPI | `8000` | Chạy ngoài Docker (dev) |

---

## 📥 3. Bước 0 — Clone Repository

```bash
# Clone repository về máy
git clone https://github.com/ngoNguyenTruongAn/ReadEase-Backend.git

# Di chuyển vào thư mục dự án
cd ReadEase-Backend
```

> ⚠️ **Lưu ý:** Nếu bạn đã có repository rồi, hãy pull code mới nhất trước khi tiếp tục:
> ```bash
> git checkout main
> git pull origin main
> ```

---

## 🐳 4. Bước 1 — Khởi Động Hạ Tầng (PostgreSQL + Redis)

Dự án sử dụng Docker để chạy cơ sở dữ liệu. Bạn **không cần cài PostgreSQL hay Redis** trực tiếp lên máy.

### 4.0. Kiểm tra Docker Desktop đã chạy

Trước tiên, hãy đảm bảo Docker Desktop đã được mở và đang chạy (icon cá voi 🐋 xanh lá ở thanh taskbar).

```powershell
docker info
```

Nếu thấy lỗi `Cannot connect to the Docker daemon` → **mở Docker Desktop lên trước**, chờ nó khởi động xong (khoảng 30 giây).

### 4.1. Khởi động containers

> ⚠️ **QUAN TRỌNG:** Lệnh `docker compose` phải chạy từ **thư mục gốc `ReadEase-Backend/`** (nơi chứa file `docker-compose.yml`), **KHÔNG PHẢI** từ thư mục `backend/`.

```powershell
# Bước 1: Di chuyển về thư mục GỐC (nơi chứa docker-compose.yml)
cd D:\đường-dẫn-của-bạn\ReadEase-Backend

# Bước 2: Khởi động PostgreSQL + Redis
docker compose up -d postgres redis
```

**Kết quả mong đợi:**
```
[+] Running 4/4
 ✔ Network readease-backend_readease-network  Created
 ✔ Volume "readease-backend_pgdata"           Created
 ✔ Container readease_db                      Started
 ✔ Container readease_redis                   Started
```

### 4.2. Kiểm tra containers đã chạy và HEALTHY

```powershell
docker ps
```

**Kết quả mong đợi:** Bạn phải thấy 2 dòng container, cột STATUS phải ghi `Up ... (healthy)`:

```
CONTAINER ID   IMAGE               STATUS                   PORTS                    NAMES
xxxxxxxxxxxx   postgres:16-alpine   Up 30 seconds (healthy)  0.0.0.0:5432->5432/tcp   readease_db
xxxxxxxxxxxx   redis:7-alpine       Up 30 seconds (healthy)  0.0.0.0:6379->6379/tcp   readease_redis
```

> 📌 **Chú ý:** Nếu STATUS hiện `Up ... (health: starting)` → **chờ thêm 10 giây** rồi chạy `docker ps` lại. PostgreSQL cần vài giây để khởi tạo database lần đầu.

### 4.3. Kiểm tra kết nối Database thủ công (TÙY CHỌN)

Nếu muốn chắc chắn 100% PostgreSQL hoạt động, chạy lệnh sau:

```powershell
docker exec readease_db psql -U readease_app -d readease -c "SELECT 1 AS ok;"
```

**Kết quả đúng:**
```
 ok
----
  1
(1 row)
```

Nếu thấy `FATAL: password authentication failed` ở bước này → xem mục **Troubleshooting 11.2**.

### 4.4. Nếu container bị lỗi hoặc muốn reset sạch DB

```powershell
# Đứng ở thư mục gốc ReadEase-Backend/

# Dừng và xóa TOÀN BỘ dữ liệu cũ (CẢNH BÁO: Mất hết data trong DB)
docker compose down -v

# Khởi động lại từ đầu (DB sẽ được tạo mới hoàn toàn)
docker compose up -d postgres redis

# Chờ PostgreSQL healthy (khoảng 10 giây)
# Kiểm tra lại:
docker ps
```

---

## ⚙️ 5. Bước 2 — Cấu Hình Biến Môi Trường (.env)

Hệ thống sử dụng file `.env` để lưu trữ các thông tin nhạy cảm (mật khẩu DB, JWT secret, API key...). File này **không được commit lên Git** (đã nằm trong `.gitignore`).

> 🚨 **ĐÂY LÀ BƯỚC GÂY LỖI NHIỀU NHẤT** cho thành viên mới. Hãy đọc kỹ từng dòng.

### 5.1. Tạo file `.env` từ mẫu

**Windows PowerShell:**
```powershell
# Di chuyển vào thư mục backend
cd backend

# Copy file mẫu thành file .env
Copy-Item .env.example .env
```

**macOS / Linux / Git Bash:**
```bash
cd backend
cp .env.example .env
```

### 5.2. Mở file `.env` và chỉnh sửa

Mở file `backend/.env` bằng VS Code (hoặc Notepad) và **thay thế toàn bộ nội dung** bằng đoạn dưới đây:

```env
# ═══════════════════════════════════════════
#  READEASE BACKEND — BIẾN MÔI TRƯỜNG
#  ⚠️ KHÔNG COMMIT FILE NÀY LÊN GIT
# ═══════════════════════════════════════════

# ── App ──
APP_PORT=3000
APP_ENV=development
LOG_LEVEL=debug

# ── Database (PostgreSQL chạy trên Docker) ──
# ⚠️ DB_PASSWORD phải ĐÚNG CHÍNH XÁC là "devpassword"
# Đây là mật khẩu mặc định trong docker-compose.yml
DB_HOST=localhost
DB_PORT=5432
DB_NAME=readease
DB_USER=readease_app
DB_PASSWORD=devpassword

# ── Redis ──
REDIS_HOST=localhost
REDIS_PORT=6379

# ── JWT ──
JWT_SECRET=eX01zPgPUpchflIXHrJFeNiSNEkHqZlzqi1h1oAanRs
JWT_ACCESS_TTL=900
JWT_REFRESH_TTL=604800

# ── Email SMTP (Hỏi Kiệt để lấy SMTP_PASSWORD) ──
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tnkiet0512@gmail.com
SMTP_PASSWORD=<hỏi_Kiệt>
SMTP_FROM=ReadEase <noreply@readease.app>
OTP_TTL_SECONDS=300

# ── ML Service ──
ML_SERVICE_URL=http://localhost:8000
ML_CLASSIFY_TIMEOUT=3000

# ── Supabase Storage (Hỏi Kiệt để lấy key) ──
SUPABASE_URL=<hỏi_Kiệt>
SUPABASE_SERVICE_KEY=<hỏi_Kiệt>
SUPABASE_BUCKET=media

# ── Gemini AI (TÙY CHỌN — bỏ trống vẫn chạy được) ──
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.0-flash
```

### 5.3. ✅ XÁC MINH FILE `.env` ĐÃ ĐÚNG

Sau khi lưu file, chạy lệnh sau để kiểm tra các giá trị quan trọng:

**Windows PowerShell:**
```powershell
# Kiểm tra DB_PASSWORD có đúng là devpassword không
Get-Content .env | Select-String "DB_PASSWORD"

# Kiểm tra không có khoảng trắng thừa
Get-Content .env | Select-String "DB_"
```

**Kết quả đúng:**
```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=readease
DB_USER=readease_app
DB_PASSWORD=devpassword      ← PHẢI LÀ "devpassword" (không có dấu cách)
```

> 🚨 **Những lỗi hay gặp ở bước này:**
> - `DB_PASSWORD=your_password_here` → **SAI!** Phải đổi thành `devpassword`
> - `DB_PASSWORD= devpassword` → **SAI!** Có dấu cách thừa sau dấu `=`  
> - `DB_PASSWORD="devpassword"` → **SAI!** Không được đặt trong dấu ngoặc kép
> - File `.env` bị lưu với encoding UTF-8 BOM → Mở lại bằng VS Code, chọn encoding `UTF-8` (không có BOM)

### 5.4. ⚠️ KIỂM TRA KHÔNG CÓ FILE `.env` Ở THƯ MỤC GỐC

Docker Compose cũng đọc file `.env` ở cùng thư mục với `docker-compose.yml`. Nếu ở thư mục gốc (`ReadEase-Backend/`) có file `.env` chứa `POSTGRES_PASSWORD` khác, nó sẽ ghi đè mật khẩu mặc định → gây lệch mật khẩu giữa Docker và NestJS.

```powershell
# Kiểm tra xem có file .env ở thư mục gốc không
cd ..   # Về thư mục ReadEase-Backend/
Test-Path .env
```

- Nếu kết quả là `True` → Mở file đó ra kiểm tra, đảm bảo **KHÔNG CÓ** dòng `POSTGRES_PASSWORD=cái_gì_đó_khác`
- Nếu kết quả là `False` → Tốt, không có vấn đề gì

> 📌 **Tóm lại:** 
> - File `.env` chứa thông tin bí mật, **TUYỆT ĐỐI KHÔNG commit** lên Git.
> - Các giá trị có ghi `<hỏi_Kiệt>` thì liên hệ **Kiệt** qua nhóm chat để nhận.

---

## 🚀 6. Bước 3 — Chạy Backend NestJS (Cổng 3000)

> 💡 **Mở Terminal Tab 1** trong VS Code (Ctrl + `)

### 6.1. Cài đặt dependencies

```bash
# Đảm bảo đang ở thư mục backend/
cd backend
npm install
```

### 6.2. Chạy Database Migration (BẮT BUỘC)

Migration đồng bộ cấu trúc bảng trong Database. **Mỗi lần pull code mới đều nên chạy lại lệnh này.**

```bash
npm run migration:run
```

**Kết quả mong đợi:**
```
query: SELECT * FROM "migrations" ...
Migration CreateUsers1741600001000 has been executed successfully.
Migration CreateChildrenProfiles1741600002000 has been executed successfully.
... (16 migration files)
```

> ⚠️ Nếu bạn thấy lỗi `connection refused` → quay lại **Bước 1** kiểm tra Docker container PostgreSQL đã chạy chưa.

### 6.3. Khởi động NestJS (chế độ Development)

```bash
npm run start:dev
```

**Kết quả mong đợi:**
```
[Nest] LOG [NestFactory] Starting Nest application...
[Nest] LOG [RoutesResolver] AppController {/}: ...
...
Application started { port: 3000, env: 'development' }
```

Server đã sẵn sàng tại: **http://localhost:3000**

### 6.4. Test nhanh API Health Check

Mở trình duyệt hoặc Postman, truy cập:
```
GET http://localhost:3000/api/v1/health
```

Response mong đợi:
```json
{
  "success": true,
  "data": {
    "status": "ok"
  }
}
```

---

## 🧠 7. Bước 4 — Chạy ML-Service FastAPI (Cổng 8000)

Đây là dịch vụ AI xử lý ngôn ngữ Tiếng Việt (tách từ bằng thư viện `underthesea`) và phân tích trạng thái nhận thức (Cognitive State Classifier).

> 💡 **Mở Terminal Tab 2** trong VS Code (Ctrl + Shift + `)

### 7.1. Di chuyển vào thư mục ML-Service

```bash
# Từ thư mục gốc ReadEase-Backend/
cd ml-service
```

### 7.2. (Chỉ lần đầu) Tạo Virtual Environment & cài thư viện

```bash
# Tạo môi trường ảo Python
python -m venv venv

# Kích hoạt môi trường ảo
# Windows PowerShell:
.\venv\Scripts\Activate.ps1
# Windows CMD:
.\venv\Scripts\activate.bat
# macOS / Linux:
source venv/bin/activate

# Cài đặt thư viện
pip install -r requirements.txt
```

> ⚠️ Nếu gặp lỗi `Activate.ps1 cannot be loaded because running scripts is disabled`:
> ```powershell
> Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
> ```
> Sau đó thử kích hoạt lại.

### 7.3. Khởi động ML-Service

**Windows PowerShell / VS Code Terminal:**
```powershell
$env:PYTHONIOENCODING='utf-8'; python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

**macOS / Linux Bash:**
```bash
PYTHONIOENCODING=utf-8 python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

**Kết quả mong đợi:**
```
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
INFO:     Started reloader process [12345]
```

### 7.4. Test nhanh ML-Service

```
GET http://localhost:8000/docs
```
→ Mở ra trang Swagger UI của FastAPI (tài liệu API tự động).

---

## ✅ 8. Bước 5 — Kiểm Tra Hệ Thống Hoạt Động Đúng

Khi cả 4 dịch vụ đều đã chạy, hãy kiểm tra toàn bộ đường ống hoạt động:

### 8.1. Bảng tóm tắt trạng thái

| # | Dịch vụ | URL kiểm tra | Kết quả đúng |
|:---:|:---|:---|:---|
| 1 | PostgreSQL | `docker ps` → `readease_db` | Status: `Up (healthy)` |
| 2 | Redis | `docker ps` → `readease_redis` | Status: `Up (healthy)` |
| 3 | NestJS API | `http://localhost:3000/api/v1/health` | `{ "status": "ok" }` |
| 4 | ML-Service | `http://localhost:8000/docs` | Trang Swagger mở ra |

### 8.2. Chạy Unit Tests xác nhận không có lỗi

```bash
# Trong thư mục backend/
npm test
```

**Kết quả mong đợi:**
```
Test Suites: 14 passed, 14 of 15 total
Tests:       145 passed, 148 total
```

### 8.3. Test luồng đăng ký + đăng nhập trên Postman

1. **Đăng ký:** `POST http://localhost:3000/api/v1/auth/register`
   ```json
   {
     "email": "test@example.com",
     "password": "Test@1234",
     "display_name": "Tester",
     "role": "ROLE_CLINICIAN"
   }
   ```

2. **Xác thực OTP:** Kiểm tra email → lấy mã OTP → `POST /api/v1/auth/verify-email`

3. **Đăng nhập:** `POST http://localhost:3000/api/v1/auth/login`
   ```json
   {
     "email": "test@example.com",
     "password": "Test@1234"
   }
   ```
   → Lấy `accessToken` trong response để sử dụng cho các API khác.

---

## 📜 9. Danh Sách Lệnh NPM Quan Trọng

Tất cả lệnh chạy từ thư mục `backend/`:

| Lệnh | Mô tả |
|:---|:---|
| `npm run start:dev` | Khởi động server ở chế độ development (auto-reload) |
| `npm run start:prod` | Khởi động server ở chế độ production |
| `npm test` | Chạy toàn bộ unit tests (Jest) |
| `npm run test:watch` | Chạy tests ở chế độ watch (tự chạy lại khi code thay đổi) |
| `npm run test:cov` | Chạy tests kèm báo cáo code coverage |
| `npm run lint` | Kiểm tra và tự sửa lỗi coding style (ESLint) |
| `npm run format` | Format code (Prettier) |
| `npm run migration:run` | Chạy tất cả migration chưa được áp dụng |
| `npm run migration:revert` | Hoàn tác migration gần nhất |

---

## 📁 10. Cấu Trúc Thư Mục Dự Án

```
ReadEase-Backend/
├── backend/                          # NestJS Backend API
│   ├── .env                          # Biến môi trường (KHÔNG commit)
│   ├── .env.example                  # Mẫu biến môi trường
│   ├── package.json                  # Dependencies & scripts
│   └── src/
│       ├── main.js                   # Entry point
│       ├── app.module.js             # Root module
│       ├── config/                   # Cấu hình (DB, JWT, Redis, Gemini...)
│       ├── common/                   # Interceptors, Filters, Middleware
│       ├── database/
│       │   ├── data-source.js        # TypeORM data source
│       │   └── migrations/           # 16 migration files
│       └── modules/
│           ├── auth/                 # Đăng ký, Đăng nhập, JWT, OTP
│           ├── reading/              # Quản lý nội dung đọc (CRUD)
│           ├── tracking/             # WebSocket Cursor Tracking
│           ├── analytics/            # Heatmap, Session Replay, Trends
│           ├── gamification/         # Điểm thưởng, Phần thưởng
│           ├── guardian/             # Phụ huynh quản lý con
│           ├── reports/              # Báo cáo tuần (Gemini AI) ← MỚI
│           ├── storage/              # Upload ảnh (Supabase)
│           ├── health/               # Health check endpoint
│           └── users/                # Entity User, ChildrenProfile
│
├── ml-service/                       # Python FastAPI ML Engine
│   ├── requirements.txt              # Python dependencies
│   ├── app/
│   │   ├── main.py                   # FastAPI entry point
│   │   ├── classifier.py            # Cognitive State Classifier
│   │   ├── calibration.py           # Motor calibration
│   │   └── feature_processor.py     # Feature extraction
│   ├── training/                     # Model training scripts
│   └── tests/                        # Python unit tests
│
├── docker-compose.yml                # Docker infrastructure
├── docker-compose.prod.yml           # Production Docker config
└── TEAM_SETUP_GUIDE.md               # 📌 File này
```

---

## 🔧 11. Xử Lý Sự Cố Thường Gặp (Troubleshooting)

### ❌ Lỗi: `EADDRINUSE: port 3000 already in use`

Cổng 3000 đang bị chiếm bởi một tiến trình khác.

**Windows:**
```powershell
# Tìm process đang chiếm cổng 3000
netstat -ano | findstr :3000
# Kết quả: ... LISTENING  <PID>

# Giết tiến trình (thay <PID> bằng số ở trên)
taskkill /PID <PID> /F
```

**macOS / Linux:**
```bash
lsof -i :3000
kill -9 <PID>
```

---

### ❌ Lỗi: `Connection refused` khi chạy migration

PostgreSQL chưa khởi động. Kiểm tra:
```bash
docker ps
# Nếu không thấy readease_db → chạy lại:
docker compose up -d postgres redis
# Chờ 5 giây rồi thử lại migration
```

---

### ❌ Lỗi: `FATAL: password authentication failed for user "readease_app"`

**Đây là lỗi phổ biến nhất** khi cài đặt lần đầu. Nguyên nhân: mật khẩu trong `backend/.env` không khớp với mật khẩu PostgreSQL đã được tạo trong Docker container.

**Cách xác định nguyên nhân — chạy lần lượt:**

```powershell
# 1. Kiểm tra mật khẩu trong file .env của NestJS
Get-Content backend\.env | Select-String "DB_PASSWORD"
# → Phải là: DB_PASSWORD=devpassword

# 2. Kiểm tra mật khẩu Docker đang dùng
docker exec readease_db printenv POSTGRES_PASSWORD
# → Phải là: devpassword
```

Nếu 2 giá trị này **KHÔNG GIỐNG NHAU** → đó là nguyên nhân.

**Cách fix triệt để (từ A đến Z):**

```powershell
# Bước 1: Sửa file backend/.env → đảm bảo DB_PASSWORD=devpassword
# (mở file bằng VS Code, sửa tay, lưu lại)

# Bước 2: Di chuyển về thư mục gốc (nơi có docker-compose.yml)
cd D:\đường-dẫn\ReadEase-Backend

# Bước 3: Xóa sạch container + volume cũ
docker compose down -v

# Bước 4: Kiểm tra KHÔNG có file .env ở thư mục gốc gây nhiễu
#          Nếu có → xóa nó hoặc đảm bảo POSTGRES_PASSWORD=devpassword
Test-Path .env

# Bước 5: Tạo lại container mới, ép đúng mật khẩu
$env:POSTGRES_PASSWORD='devpassword'; docker compose up -d postgres redis

# Bước 6: Chờ PostgreSQL khởi tạo xong (10 giây)
Start-Sleep -Seconds 10

# Bước 7: Kiểm tra kết nối
docker exec readease_db psql -U readease_app -d readease -c "SELECT 1;"
# → Phải thấy: ok = 1

# Bước 8: Chạy migration
cd backend
npm run migration:run
```

> 💡 **Tại sao `docker compose down -v` mà vẫn lỗi?**  
> Vì Docker Compose đọc biến môi trường từ **file `.env` ở thư mục gốc** (cùng chỗ với `docker-compose.yml`). Nếu file đó có `POSTGRES_PASSWORD=xyz` thì khi `up` lại, Docker sẽ tạo DB với mật khẩu `xyz` thay vì `devpassword` mặc định. Giải pháp: xóa file `.env` ở thư mục gốc hoặc ép biến bằng `$env:POSTGRES_PASSWORD='devpassword'` trước khi chạy.

> 💡 **Tại sao lỗi này chỉ xảy ra trên máy teammate mới?**  
> Vì máy của Team Lead đã tạo Docker volume với mật khẩu `devpassword` từ trước. Máy mới chưa có volume, khi tạo lần đầu nếu có biến môi trường bị sai thì PostgreSQL sẽ khởi tạo database với mật khẩu sai → sau đó dù sửa `.env` thì volume DB cũ vẫn giữ mật khẩu sai → phải `down -v` để xóa volume rồi tạo lại.

---

### ❌ Lỗi: `Cannot find module '@google/generative-ai'`

Chưa cài đặt SDK Gemini:
```bash
cd backend
npm install
```

---

### ❌ Lỗi: `underthesea` cài không được trên Windows

Thư viện `underthesea` đôi khi cần build C extension. Thử:
```powershell
pip install --upgrade pip setuptools wheel
pip install underthesea
```

Nếu vẫn lỗi, cài Visual C++ Build Tools:
→ https://visualstudio.microsoft.com/visual-cpp-build-tools/

---

### ❌ Lỗi: Node.js `MODULE_NOT_FOUND` sau khi pull code mới

Team member khác đã thêm package mới. Cần cài lại:
```bash
cd backend
rm -rf node_modules
npm install
```

---

## 🌿 12. Quy Ước Làm Việc Với Git

### Luồng làm việc (Git Flow)

```
main (production-ready)
  └── Kiet (nhánh phát triển chính)
        ├── feature/ten-tinh-nang
        └── fix/ten-loi
```

### Quy tắc commit message

Sử dụng chuẩn **Conventional Commits**:

```
feat(module): mô tả tính năng mới
fix(module): mô tả lỗi đã sửa
docs(module): cập nhật tài liệu
refactor(module): tái cấu trúc code
test(module): thêm/sửa unit test
```

**Ví dụ:**
```bash
git commit -m "feat(reports): implement Gemini AI weekly report generation"
git commit -m "fix(auth): resolve display_name missing in GET /profile"
```

### Trước khi push code

```bash
# 1. Chạy lint kiểm tra lỗi
npm run lint

# 2. Chạy tests đảm bảo không gãy gì
npm test

# 3. Push code
git push origin <tên-nhánh-của-bạn>
```

---

## 🎉 HOÀN TẤT!

Khi cả 4 dịch vụ (PostgreSQL, Redis, NestJS, ML-Service) đều xanh đèn, bạn đã sẵn sàng phát triển tính năng mới! Nếu gặp vấn đề không giải quyết được, hãy:

1. Chụp ảnh màn hình lỗi
2. Copy full log từ Terminal
3. Gửi vào nhóm chat kèm mô tả ngắn gọn

**Chúc anh em code vui vẻ! 🚀**
