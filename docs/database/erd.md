# ReadEase — Entity Relationship Diagram (ERD)

> **Version**: 2.0.0 | **Database**: PostgreSQL 16 | **Last Updated**: 2026-03-10

---

## Sơ đồ ERD (Mermaid)

```mermaid
erDiagram
    users {
        UUID id PK "gen_random_uuid()"
        VARCHAR email UK "NOT NULL, UNIQUE"
        VARCHAR password_hash "NOT NULL"
        VARCHAR display_name "NULL"
        VARCHAR role "NOT NULL, CHECK"
        BOOLEAN is_active "DEFAULT true"
        TIMESTAMPTZ last_login_at "NULL"
        TIMESTAMPTZ created_at "DEFAULT NOW()"
        TIMESTAMPTZ updated_at "DEFAULT NOW()"
        TIMESTAMPTZ deleted_at "NULL, soft delete"
    }

    children_profiles {
        UUID id PK "gen_random_uuid()"
        UUID user_id FK,UK "NOT NULL, UNIQUE"
        DATE date_of_birth "NULL"
        INTEGER grade_level "NULL"
        JSONB baseline_json "NULL"
        JSONB preferences "DEFAULT '{}'"
        TIMESTAMPTZ created_at "DEFAULT NOW()"
        TIMESTAMPTZ updated_at "DEFAULT NOW()"
    }

    guardian_children {
        UUID guardian_id PK,FK "NOT NULL"
        UUID child_id PK,FK "NOT NULL"
        TIMESTAMPTZ consent_given_at "NOT NULL"
        VARCHAR consent_type "DEFAULT 'COPPA_PARENTAL'"
    }

    reading_content {
        UUID id PK "gen_random_uuid()"
        VARCHAR title "NOT NULL"
        TEXT body "NOT NULL"
        VARCHAR difficulty "CHECK EASY/MEDIUM/HARD"
        VARCHAR age_group "NULL"
        INTEGER word_count "NOT NULL"
        UUID created_by FK "NULL"
        TIMESTAMPTZ created_at "DEFAULT NOW()"
        TIMESTAMPTZ updated_at "DEFAULT NOW()"
        TIMESTAMPTZ deleted_at "NULL, soft delete"
    }

    reading_sessions {
        UUID id PK "gen_random_uuid()"
        UUID user_id FK "NOT NULL"
        UUID content_id FK "NOT NULL"
        VARCHAR status "DEFAULT 'ACTIVE'"
        TIMESTAMPTZ started_at "DEFAULT NOW()"
        TIMESTAMPTZ ended_at "NULL"
        DECIMAL effort_score "DEFAULT 0.0"
        JSONB cognitive_state_summary "DEFAULT '{}'"
        JSONB settings "DEFAULT '{}'"
        TIMESTAMPTZ created_at "DEFAULT NOW()"
    }

    mouse_events {
        BIGSERIAL id PK "auto-increment"
        UUID session_id FK "NOT NULL"
        SMALLINT x "NOT NULL"
        SMALLINT y "NOT NULL"
        BIGINT timestamp "NOT NULL, Unix ms"
        INTEGER word_index "NULL"
        REAL velocity "NULL"
        REAL acceleration "NULL"
        REAL curvature "NULL"
        REAL dwell_time "NULL"
        TIMESTAMPTZ created_at "DEFAULT NOW()"
    }

    session_replay_events {
        BIGSERIAL id PK "auto-increment"
        UUID session_id FK "NOT NULL"
        VARCHAR event_type "NOT NULL"
        JSONB payload "NOT NULL"
        VARCHAR cognitive_state "NULL"
        VARCHAR intervention_type "NULL"
        BIGINT timestamp "NOT NULL, Unix ms"
        TIMESTAMPTZ created_at "DEFAULT NOW()"
    }

    tokens {
        UUID id PK "gen_random_uuid()"
        UUID child_id FK "NOT NULL"
        INTEGER amount "NOT NULL"
        VARCHAR type "CHECK EARN/SPEND/BONUS"
        VARCHAR reason "NULL"
        DECIMAL effort_score "NULL"
        UUID session_id FK "NULL"
        TIMESTAMPTZ created_at "DEFAULT NOW()"
    }

    rewards {
        UUID id PK "gen_random_uuid()"
        VARCHAR name "NOT NULL"
        TEXT description "NULL"
        INTEGER cost "NOT NULL"
        VARCHAR image_url "NULL"
        BOOLEAN is_active "DEFAULT true"
        TIMESTAMPTZ created_at "DEFAULT NOW()"
    }

    redemptions {
        UUID id PK "gen_random_uuid()"
        UUID child_id FK "NOT NULL"
        UUID reward_id FK "NOT NULL"
        INTEGER cost "NOT NULL, snapshot"
        TIMESTAMPTZ redeemed_at "DEFAULT NOW()"
    }

    reports {
        UUID id PK "gen_random_uuid()"
        UUID child_id FK "NOT NULL"
        VARCHAR report_type "DEFAULT 'WEEKLY'"
        TEXT content "NOT NULL"
        VARCHAR ai_model "NULL"
        TEXT ai_disclaimer "DEFAULT disclaimer"
        DATE period_start "NOT NULL"
        DATE period_end "NOT NULL"
        TIMESTAMPTZ created_at "DEFAULT NOW()"
    }

    %% ── Relationships ──
    users ||--|| children_profiles : "1:1 has profile"
    users ||--o{ reading_sessions : "1:N reads in"
    users ||--o{ tokens : "1:N earns/spends"
    users ||--o{ redemptions : "1:N redeems"
    users ||--o{ reports : "1:N has reports"
    users }o--o{ users : "N:M via guardian_children"
    reading_content ||--o{ reading_sessions : "1:N used in"
    reading_content }o--|| users : "N:1 created by"
    reading_sessions ||--o{ mouse_events : "1:N contains"
    reading_sessions ||--o{ session_replay_events : "1:N records"
    reading_sessions ||--o{ tokens : "1:N earns"
    rewards ||--o{ redemptions : "1:N redeemed as"
```

---

## Tổng quan 11 bảng

| # | Bảng | PK Type | Mục đích | FK đến |
|---|------|---------|----------|--------|
| 1 | `users` | UUID | Tất cả user (CHILD, CLINICIAN, GUARDIAN) | — |
| 2 | `children_profiles` | UUID | Hồ sơ trẻ em: tuổi, lớp, baseline, preferences | `users.id` |
| 3 | `guardian_children` | Composite | Liên kết N:M phụ huynh ↔ trẻ (COPPA) | `users.id` × 2 |
| 4 | `reading_content` | UUID | Bài đọc với độ khó + nhóm tuổi | `users.id` |
| 5 | `reading_sessions` | UUID | Phiên đọc: start → end, effort, cognitive | `users.id`, `reading_content.id` |
| 6 | `mouse_events` | BIGSERIAL | Tọa độ chuột (volume lớn nhất) | `reading_sessions.id` |
| 7 | `session_replay_events` | BIGSERIAL | Sự kiện quan trọng để replay | `reading_sessions.id` |
| 8 | `tokens` | UUID | Giao dịch token economy | `users.id`, `reading_sessions.id` |
| 9 | `rewards` | UUID | Catalog phần thưởng | — |
| 10 | `redemptions` | UUID | Lịch sử đổi thưởng | `users.id`, `rewards.id` |
| 11 | `reports` | UUID | Báo cáo AI hàng tuần | `users.id` |

---

## Chi tiết Foreign Key

| # | Bảng chứa FK | Cột FK | → Bảng | → Cột | Quan hệ | Bắt buộc | ON DELETE |
|---|-------------|--------|--------|-------|---------|----------|-----------|
| 1 | `children_profiles` | `user_id` | `users` | `id` | 1:1 | ✅ | CASCADE |
| 2 | `guardian_children` | `guardian_id` | `users` | `id` | N:M | ✅ | CASCADE |
| 3 | `guardian_children` | `child_id` | `users` | `id` | N:M | ✅ | CASCADE |
| 4 | `reading_content` | `created_by` | `users` | `id` | N:1 | ❌ | SET NULL |
| 5 | `reading_sessions` | `user_id` | `users` | `id` | N:1 | ✅ | NO ACTION |
| 6 | `reading_sessions` | `content_id` | `reading_content` | `id` | N:1 | ✅ | NO ACTION |
| 7 | `mouse_events` | `session_id` | `reading_sessions` | `id` | N:1 | ✅ | CASCADE |
| 8 | `session_replay_events` | `session_id` | `reading_sessions` | `id` | N:1 | ✅ | CASCADE |
| 9 | `tokens` | `child_id` | `users` | `id` | N:1 | ✅ | NO ACTION |
| 10 | `tokens` | `session_id` | `reading_sessions` | `id` | N:1 | ❌ | SET NULL |
| 11 | `redemptions` | `child_id` | `users` | `id` | N:1 | ✅ | NO ACTION |
| 12 | `redemptions` | `reward_id` | `rewards` | `id` | N:1 | ✅ | NO ACTION |
| 13 | `reports` | `child_id` | `users` | `id` | N:1 | ✅ | CASCADE |

---

## Indexes

| Index | Bảng | Cột | Loại | Lý do |
|-------|------|-----|------|-------|
| `uq_users_email` | `users` | `email` | UNIQUE | Login lookup O(1) |
| `idx_users_role` | `users` | `role` | Partial (WHERE deleted_at IS NULL) | Filter active users by role |
| `idx_sessions_user_id` | `reading_sessions` | `user_id` | B-Tree | Dashboard query |
| `idx_sessions_status` | `reading_sessions` | `status` | Partial (WHERE status = 'ACTIVE') | Find active sessions |
| `idx_mouse_events_session_ts` | `mouse_events` | `session_id, timestamp` | B-Tree composite | Replay timeline |
| `idx_replay_session_ts` | `session_replay_events` | `session_id, timestamp` | B-Tree composite | Clinician replay |
| `idx_tokens_child_id` | `tokens` | `child_id` | B-Tree | Balance calculation |
| `idx_reports_child_period` | `reports` | `child_id, period_start` | B-Tree composite (DESC) | Latest report |
