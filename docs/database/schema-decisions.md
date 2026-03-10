# ReadEase — Schema Design Decisions

> **Version**: 2.0.0 | **Last Updated**: 2026-03-10
> **Purpose**: Document key architectural decisions behind the ReadEase database schema

---

## 1. UUID vs SERIAL cho Primary Keys

### Quyết định: ✅ UUID (cho hầu hết bảng), BIGSERIAL (cho high-volume bảng)

| Tiêu chí | UUID | SERIAL/BIGSERIAL |
|----------|------|-----------------|
| **Bảo mật** | ✅ Không đoán được ID tiếp theo | ❌ Dễ dàng đoán (id=1, id=2, ...) |
| **Distributed** | ✅ Gen ở client/server đều được | ❌ Chỉ gen ở DB server |
| **Performance (INSERT)** | ⚠️ Chậm hơn 5-10% (random I/O) | ✅ Nhanh hơn (sequential I/O) |
| **Storage** | ⚠️ 16 bytes | ✅ 4-8 bytes |
| **Index size** | ⚠️ Lớn hơn 2-4x | ✅ Nhỏ gọn |

### Tradeoff chi tiết

**Dùng UUID cho**: `users`, `children_profiles`, `reading_content`, `reading_sessions`, `tokens`, `rewards`, `redemptions`, `reports`
- **Lý do**: Các bảng này expose ID ra API URL (`/api/v1/users/:id`). UUID ngăn chặn [IDOR attack](https://owasp.org/www-project-web-security-testing-guide/) — attacker không thể đoán ID user khác bằng cách tăng số
- **Volume thấp**: < 10,000 rows/tháng → UUID overhead không đáng kể

**Dùng BIGSERIAL cho**: `mouse_events`, `session_replay_events`
- **Lý do**: Volume cực lớn (~6 triệu rows/tháng cho mouse_events). Sequential insert nhanh hơn đáng kể
- **ID không lộ ra API** — chỉ dùng nội bộ, không có endpoint `/api/v1/mouse-events/:id`
- **Performance**: BIGSERIAL + B-Tree index nhỏ gọn hơn UUID index, tiết kiệm RAM cho buffer pool

---

## 2. JSONB vs Normalized Tables

### Quyết định: ✅ JSONB cho dữ liệu semi-structured, ❌ JSONB cho dữ liệu cần query thường xuyên

| Cột | Bảng | Tại sao JSONB? |
|-----|------|----------------|
| `baseline_json` | `children_profiles` | **12 đặc trưng kinematic** có thể thay đổi khi ML model update. Nếu normalize thành 12 cột, mỗi lần model thêm feature → phải ALTER TABLE. JSONB linh hoạt hơn |
| `preferences` | `children_profiles` | **UI preferences** (fontSize, colorTheme, letterSpacing) — cấu trúc nhẹ, mỗi trẻ khác nhau, không cần query `WHERE preferences.fontSize > 16` |
| `cognitive_state_summary` | `reading_sessions` | **Tóm tắt cuối session** — ghi 1 lần, đọc 1 lần. Không cần index. Object chứa `{ fluent_pct, regression_pct, ... }` |
| `settings` | `reading_sessions` | **Session-specific UI** — mỗi session có thể override preferences mặc định |
| `payload` | `session_replay_events` | **Dữ liệu sự kiện đa dạng** — mỗi `event_type` có payload khác nhau. Normalize = cần 6+ bảng. JSONB linh hoạt hơn |

### Khi KHÔNG dùng JSONB

| Dữ liệu | Tại sao normalize? |
|---------|---------------------|
| `mouse_events.x, y, velocity, ...` | **Query thường xuyên** bởi ML feature extraction. Cần index trên `session_id + timestamp`. JSONB không index nested fields hiệu quả |
| `tokens.amount, type` | **Aggregate query**: `SUM(amount) WHERE child_id = ?`. B-Tree index trên column nhanh hơn JSONB index |
| `users.role` | **Filter thường xuyên**: `WHERE role = 'ROLE_CHILD'`. Cần partial index |

### Quy tắc ngón tay cái

```
✅ Dùng JSONB khi:
  - Cấu trúc thay đổi thường xuyên
  - Không cần WHERE clause trên nested fields
  - Ghi 1 lần, đọc ít
  - Payload đa dạng (polymorphic)

❌ KHÔNG dùng JSONB khi:
  - Cần aggregate (SUM, COUNT, AVG)
  - Cần index trên field con
  - Query với WHERE clause thường xuyên
  - Cần referential integrity (FK)
```

---

## 3. Indexing Strategy

### Thiết kế chung

ReadEase follow **query-driven indexing** — chỉ tạo index cho các query pattern **thực sự sử dụng**:

| Pattern | Index | Tại sao cần? |
|---------|-------|--------------|
| Login: `WHERE email = ?` | `uq_users_email` (UNIQUE) | O(1) lookup, chạy mỗi lần login |
| Dashboard: `WHERE user_id = ?` | `idx_sessions_user_id` | Hiện danh sách session của trẻ |
| Active session: `WHERE status = 'ACTIVE'` | `idx_sessions_status` (PARTIAL) | **Partial index** — chỉ index rows có status = 'ACTIVE' (~1% table). Tiết kiệm 99% dung lượng index |
| Replay: `WHERE session_id = ? ORDER BY timestamp` | `idx_mouse_events_session_ts` (COMPOSITE) | **Composite index** — tìm events theo session VÀ sắp xếp theo thời gian trong 1 lần scan |
| Balance: `WHERE child_id = ?` | `idx_tokens_child_id` | Aggregate SUM(amount) nhanh |
| Latest report: `WHERE child_id = ? ORDER BY period_start DESC` | `idx_reports_child_period` (COMPOSITE DESC) | Tìm báo cáo mới nhất |

### Index KHÔNG tạo (và tại sao)

| Cột | Tại sao không index? |
|------|---------------------|
| `users.display_name` | Không bao giờ query `WHERE display_name = ?` |
| `reading_content.body` | Full-text search → dùng `tsvector` + GIN index **sau này** nếu cần |
| `mouse_events.velocity` | ML extract toàn bộ events theo session, không filter by velocity |
| `tokens.reason` | Text mô tả, chỉ hiển thị, không query |

### CREATE INDEX CONCURRENTLY

Theo skill **postgres-migration-safety**: mọi index phải tạo bằng `CREATE INDEX CONCURRENTLY` để không lock bảng:

```sql
-- ✅ Đúng: không lock bảng, production-safe
CREATE INDEX CONCURRENTLY idx_sessions_user_id ON reading_sessions (user_id);

-- ❌ Sai: lock toàn bộ bảng trong khi tạo index
CREATE INDEX idx_sessions_user_id ON reading_sessions (user_id);
```

---

## 4. Cascade Delete Strategy (COPPA Compliance)

### Bối cảnh quy định

ReadEase xử lý dữ liệu trẻ em → phải tuân thủ **COPPA** (Children's Online Privacy Protection Act). Phụ huynh có quyền **yêu cầu xóa toàn bộ dữ liệu** của trẻ.

### Chiến lược: Hybrid (Soft Delete + Hard Delete)

```
Xóa người dùng thường: → Soft Delete (set deleted_at)
Yêu cầu COPPA erasure: → Hard Delete (CASCADE toàn bộ)
```

### Chi tiết ON DELETE cho từng FK

| FK | ON DELETE | Lý do |
|----|-----------|-------|
| `children_profiles.user_id` → `users.id` | **CASCADE** | Xóa user → xóa profile. Không có ý nghĩa khi profile tồn tại mà không có user |
| `guardian_children.guardian_id/child_id` → `users.id` | **CASCADE** | Xóa user → xóa liên kết. Tuân thủ COPPA erasure |
| `mouse_events.session_id` → `reading_sessions.id` | **CASCADE** | Xóa session → xóa tất cả mouse data. **Quan trọng nhất** vì COPPA yêu cầu xóa dữ liệu tracking |
| `session_replay_events.session_id` → `reading_sessions.id` | **CASCADE** | Tương tự mouse_events |
| `reports.child_id` → `users.id` | **CASCADE** | Xóa user → xóa reports. Báo cáo chứa PII |
| `reading_sessions.user_id` → `users.id` | **NO ACTION** | ⚠️ **Chặn xóa** nếu còn session. Admin phải xóa sessions trước → đảm bảo không xóa nhầm |
| `tokens.child_id` → `users.id` | **NO ACTION** | Chặn xóa nếu còn token. Cần audit trail trước khi xóa |
| `redemptions.child_id` → `users.id` | **NO ACTION** | Chặn xóa nếu còn redemption history |

### COPPA Erasure Flow

```
Phụ huynh yêu cầu xóa dữ liệu trẻ
  ↓
1. Xóa sessions (CASCADE → xóa mouse_events, replay_events, tokens liên quan)
2. Xóa tokens còn lại (BONUS/SPEND không có session_id)
3. Xóa redemptions
4. Xóa reports (CASCADE tự động)
5. Xóa guardian_children (CASCADE tự động)
6. Xóa children_profiles (CASCADE tự động)
7. Hard DELETE user record
```

---

## 5. Soft Delete vs Hard Delete

### Quyết định: ✅ Soft Delete cho dữ liệu business, Hard Delete cho COPPA

| Bảng | Soft Delete? | Lý do |
|------|-------------|-------|
| `users` | ✅ Có (`deleted_at`) | Audit trail, có thể restore, admin disable |
| `reading_content` | ✅ Có (`deleted_at`) | Ẩn bài đọc nhưng giữ session history |
| `children_profiles` | ❌ Không | CASCADE từ users |
| `reading_sessions` | ❌ Không | Historical data, không cần xóa |
| `mouse_events` | ❌ Không | Volume quá lớn, dùng CASCADE |
| `tokens` | ❌ Không | Ledger — không bao giờ xóa |
| `rewards` | ❌ Không (`is_active` thay thế) | Dùng `is_active = false` thay vì soft delete |

### Tradeoff

```
Soft Delete (+):
  ✅ Dữ liệu vẫn còn, có thể restore
  ✅ Audit trail đầy đủ
  ✅ FK integrity không bị ảnh hưởng

Soft Delete (-):
  ⚠️ Mọi query phải thêm WHERE deleted_at IS NULL
  ⚠️ Index lớn hơn (chứa cả deleted rows)
  ⚠️ COPPA erasure phải Hard DELETE (soft delete KHÔNG đủ)
```

---

## 6. Naming Convention Verification

Đối chiếu với `naming-conventions.md`:

| Quy tắc | Đúng/Sai | Ví dụ |
|---------|----------|-------|
| Table: `snake_case` | ✅ | `reading_sessions`, `mouse_events`, `guardian_children` |
| Column: `snake_case` | ✅ | `user_id`, `created_at`, `effort_score` |
| PK: `id` | ✅ | Tất cả bảng dùng `id` |
| FK: `<table>_id` | ✅ | `user_id`, `session_id`, `content_id`, `child_id`, `reward_id` |
| Index: `idx_<table>_<cols>` | ✅ | `idx_sessions_user_id`, `idx_mouse_events_session_ts` |
| Unique: `uq_<table>_<cols>` | ✅ | `uq_users_email` |
| Enum: `UPPER_SNAKE` | ✅ | `ROLE_CHILD`, `FLUENT`, `EARN` |
| Junction: `<table1>_<table2>` | ✅ | `guardian_children` |

---

## 7. Tổng kết quyết định

| # | Quyết định | Lý do chính |
|---|-----------|------------|
| 1 | UUID cho PK (trừ high-volume) | Bảo mật API, anti-IDOR |
| 2 | BIGSERIAL cho mouse_events | Performance INSERT + index size |
| 3 | JSONB cho semi-structured data | Linh hoạt, ít ALTER TABLE |
| 4 | Partial indexes | Tiết kiệm storage, chỉ index dữ liệu cần |
| 5 | Composite indexes | Cover query pattern bằng 1 index scan |
| 6 | CASCADE cho child data | COPPA erasure compliance |
| 7 | NO ACTION cho financial data | Chặn xóa nhầm, cần audit trail |
| 8 | Soft delete cho users + content | Restore + audit capability |
| 9 | `is_active` cho rewards | Đơn giản hơn soft delete cho catalog |
