# 🚀 Hướng Dẫn Deploy ReadEase lên VPS Linux

## Bước 1: Chuẩn bị VPS (Chạy 1 lần)

### 1.1 Cài Docker trên Ubuntu
```bash
# Cài Docker Engine
curl -fsSL https://get.docker.com | sh

# Cho phép user hiện tại dùng docker không cần sudo
sudo usermod -aG docker $USER

# Đăng xuất rồi đăng nhập lại, sau đó kiểm tra
docker --version
docker compose version
```

### 1.2 Clone repo và cấu hình
```bash
# Clone project
cd /opt
sudo git clone https://github.com/ngoNguyenTruongAn/ReadEase-Backend.git readease
sudo chown -R $USER:$USER readease
cd readease

# Tạo file biến môi trường production
cp .env.example .env
```

### 1.3 Sửa file `.env` với giá trị production thật
```bash
nano .env
```

Các giá trị **BẮT BUỘC** phải thay đổi:
```env
# ĐỔI NGAY — Mật khẩu DB mạnh
POSTGRES_PASSWORD=your_strong_password_here

# ĐỔI NGAY — JWT secret ngẫu nhiên (chạy: openssl rand -hex 32)
JWT_SECRET=your_random_64_char_hex_string

# Supabase credentials (lấy từ dashboard Supabase)
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJxxxxxxx
SUPABASE_BUCKET=media
```

### 1.4 Khởi chạy lần đầu
```bash
# Build và chạy tất cả containers
docker compose -f docker-compose.prod.yml up -d --build

# Kiểm tra tất cả containers đang chạy
docker ps

# Chạy migrations lần đầu
docker exec readease_api npx typeorm migration:run -d src/database/data-source.js

# Kiểm tra health
curl http://localhost:3000/api/v1/health
```

---

## Bước 2: Cấu hình GitHub Actions (Auto Deploy)

### 2.1 Tạo SSH Key cho Deploy
Trên VPS, chạy:
```bash
ssh-keygen -t ed25519 -C "github-deploy" -f ~/.ssh/github_deploy -N ""
cat ~/.ssh/github_deploy.pub >> ~/.ssh/authorized_keys
cat ~/.ssh/github_deploy   # Copy toàn bộ private key này
```

### 2.2 Thêm GitHub Secrets
Vào repo GitHub → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

| Secret Name | Giá trị |
|---|---|
| `VPS_HOST` | IP của VPS (ví dụ `103.xxx.xxx.xxx`) |
| `VPS_USER` | Username SSH (ví dụ `root` hoặc `deploy`) |
| `VPS_SSH_KEY` | Nội dung private key từ bước 2.1 |
| `VPS_DEPLOY_PATH` | `/opt/readease` |

### 2.3 Test Pipeline
```bash
# Push code lên main
git add .
git commit -m "ci: setup production CI/CD pipeline"
git push origin main
```

Vào tab **Actions** trên GitHub để xem pipeline chạy. Nếu xanh = thành công!

---

## Bước 3: Các lệnh vận hành thường dùng

```bash
# Xem logs realtime
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f ml-engine

# Restart một service
docker compose -f docker-compose.prod.yml restart api

# Dừng tất cả
docker compose -f docker-compose.prod.yml down

# Rebuild và chạy lại (sau khi đổi Dockerfile)
docker compose -f docker-compose.prod.yml up -d --build

# Backup database
docker exec readease_db pg_dump -U readease_app readease > backup_$(date +%Y%m%d).sql
```

---

## Kiến trúc Production

```
VPS Linux (Ubuntu 22.04)
├── readease_api      (NestJS)     → Port 3000
├── readease_ml       (FastAPI)    → Internal only
├── readease_db       (PostgreSQL) → Internal only
└── readease_redis    (Redis)      → Internal only
```

> **Lưu ý bảo mật:** Trong `docker-compose.prod.yml`, PostgreSQL và Redis KHÔNG expose port ra ngoài. Chỉ có API port 3000 là truy cập được từ internet.
