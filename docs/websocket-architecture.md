# 🔌 WebSocket Architecture — ReadEase Tracking System

> **Mục đích:** Tài liệu này mô tả toàn bộ cơ chế WebSocket được sử dụng trong hệ thống ReadEase,
> bao gồm authentication, luồng dữ liệu, các events, và cách hệ thống đưa ra can thiệp
> (intervention) theo thời gian thực trong khi trẻ đọc bài.

---

## 1. Kiến trúc tổng quan

```
Frontend (React / Mobile App)
          │
          │  ws://server/tracking?token=<JWT>
          │
          ▼
    TrackingGateway  ← NestJS WebSocket Gateway (path: /tracking)
          │
          ├──► TrajectoryBufferService   gom điểm chuột, lưu tạm Redis
          ├──► MlClientService           gọi Python ML Engine phân loại trạng thái
          ├──► LexicalService            Gemini đơn giản hóa từ khó (S3-T02)
          ├──► InterventionRouter        quyết định gửi event gì về FE
          ├──► ReplayStorageService      lưu DB cho clinician replay
          └──► TokenService             tính điểm thưởng khi kết thúc phiên
```

---

## 2. Kết nối & Authentication

### URL kết nối

```
ws://localhost:3000/tracking?token=<JWT_ACCESS_TOKEN>
```

> ⚠️ JWT được truyền qua **query string** (không phải HTTP header) vì trình duyệt
> không hỗ trợ custom header trong WebSocket API chuẩn.

### Quy trình xác thực

Khi client kết nối, `handleConnection()` chạy ngay lập tức:

```
1. Parse token từ URL query string
2. Verify JWT signature → giải mã { user_id, session_id }
3. Gán vào client.user_id và client.session_id
4. Nếu token không hợp lệ → client.close() ngay
```

---

## 3. Danh sách Events

### 3a. Frontend → Backend (Inbound)

| Event | Khi nào gửi | Handler |
|-------|------------|---------|
| `session:start` | Trẻ bắt đầu đọc bài | `handleSessionStart()` |
| `mouse:batch` | Gửi định kỳ ~100ms khi đang đọc | `handleMouseBatch()` |
| `calibration:data` | Kết thúc mini-game calibration 30s | `handleCalibrationData()` |
| `session:end` | Trẻ kết thúc phiên đọc | `handleSessionEnd()` |
| `tooltip:show` | FE xác nhận tooltip đã hiển thị | `handleTooltipShow()` |

### 3b. Backend → Frontend (Outbound)

| Event | Ý nghĩa | Trigger |
|-------|---------|---------|
| `adaptation:trigger` | Thay đổi CSS (giãn chữ, color banding) | ML → REGRESSION hoặc DISTRACTION |
| `tooltip:show` | Hiện popup nghĩa từ đơn giản | ML → REGRESSION (có từ cụ thể) |
| `intervention:reset` | Reset toàn bộ UI về trạng thái gốc | Bắt đầu bài mới |
| `calibration:ack` | Xác nhận nhận calibration, trả baseline | Sau `calibration:data` |

---

## 4. Pipeline Chính — `mouse:batch` → ML → Intervention

Đây là core flow quan trọng nhất của hệ thống.

### 4a. Dữ liệu FE gửi lên

```json
{
  "event": "mouse:batch",
  "data": {
    "points": [
      { "x": 120, "y": 45, "timestamp": 1714200000, "word_index": 3, "word": "caterpillar" },
      { "x": 135, "y": 45, "timestamp": 1714200016 },
      { "x": 118, "y": 45, "timestamp": 1714200032 }
    ]
  }
}
```

### 4b. Luồng xử lý

```
handleMouseBatch()
        │
        ├─► TrajectoryBufferService.push()
        │         Lưu tạm các điểm vào Redis buffer (theo session_id)
        │         → dùng sau khi session kết thúc để flush toàn bộ
        │
        └─► (nếu nhận được ≥ 3 điểm) → classifyAndRoute()  [async, non-blocking]
                  │
                  ▼
            MlClientService.classify(session_id, points)
                  │
                  │  Bước 1: extractFeatures(points)
                  │    → Tính 12 kinematic features:
                  │      velocity, acceleration, jerk,
                  │      direction_changes, regression_count,
                  │      path_efficiency, dwell_time, ...
                  │
                  │  Bước 2: POST /classify → Python ML Engine
                  │    → { state: 'REGRESSION', confidence: 0.87 }
                  │
                  │  Fallback (khi ML timeout/lỗi):
                  │    regression_count ≥ 3          → REGRESSION
                  │    direction_changes ≥ 5 & eff<0.5 → DISTRACTION
                  │    otherwise                     → FLUENT
                  │
                  ▼
            [Nếu state === 'REGRESSION' VÀ có word trong lastPoint]
            LexicalService.simplifyWord(word, contextSentence)
                  │
                  ├─► Check Redis cache (key: lexical:{word})
                  │     Cache HIT  → trả về ngay (source: 'cache')
                  │     Cache MISS → gọi Gemini API
                  │                    → lưu vào Redis TTL = 24h
                  │                    → (source: 'gemini')
                  │     Gemini lỗi/quota → trả original word (source: 'fallback')
                  │
                  ▼
            routeIntervention(client, mlResult, lastPoint)
                  │
                  ├─ REGRESSION  → gửi 2 events về FE:
                  │     • adaptation:trigger  (VISUAL: giãn chữ + color banding)
                  │     • tooltip:show        (SEMANTIC: hiển thị nghĩa đơn giản)
                  │
                  ├─ DISTRACTION → gửi 1 event:
                  │     • adaptation:trigger  (VISUAL only: giãn chữ nhẹ)
                  │
                  └─ FLUENT      → không gửi gì
                  │
                  ▼
            ReplayStorageService.storeEvents()
                  Lưu vào bảng session_replay_events để clinician replay sau
```

---

## 5. Nội dung các Events Outbound

### `adaptation:trigger` — Thay đổi giao diện đọc

```json
// REGRESSION mode
{
  "event": "adaptation:trigger",
  "data": {
    "type": "VISUAL",
    "mode": "DUAL_INTERVENTION",
    "state": "REGRESSION",
    "confidence": 0.87,
    "params": {
      "letterSpacing": "0.08em",
      "colorBanding": true,
      "transition": { "durationMs": 200, "easing": "ease-in-out" }
    }
  }
}

// DISTRACTION mode
{
  "event": "adaptation:trigger",
  "data": {
    "type": "VISUAL",
    "mode": "VISUAL_ONLY",
    "state": "DISTRACTION",
    "params": {
      "letterSpacing": "0.05em",
      "colorBanding": false
    }
  }
}
```

### `tooltip:show` — Popup nghĩa từ đơn giản

```json
{
  "event": "tooltip:show",
  "data": {
    "type": "SEMANTIC",
    "mode": "DUAL_INTERVENTION",
    "state": "REGRESSION",
    "wordIndex": 3,
    "cursorX": 120,
    "cursorY": 45,
    "original": "caterpillar",
    "simplified": "Đây là con sâu nhỏ sống trong vườn.",
    "confidence": 0.87
  }
}
```

### `intervention:reset` — Reset UI

```json
{
  "event": "intervention:reset",
  "data": {
    "sessionId": "sess-uuid",
    "contentId": "content-uuid",
    "reason": "NEW_CONTENT"
  }
}
```

### `calibration:ack` — Xác nhận calibration

```json
{
  "event": "calibration:ack",
  "data": {
    "status": "received",
    "baseline": {
      "motor_profile": "SLOW",
      "velocity_baseline": 0.24,
      "calibrated_at": "2026-04-27T10:00:00Z"
    }
  }
}
```

---

## 6. Calibration Flow (Mini-game 30 giây)

```
Trẻ chơi mini-game (bắt bóng / target tracking 30s)
        │
        │  FE gửi calibration:data
        ▼
handleCalibrationData()
        │
        ├─► Lưu events vào session_replay_events (type: 'calibration')
        │
        ├─► MlClientService.calibrate(childId, events)
        │         POST /calibrate → Python ML Engine
        │         → { baseline: { motor_profile: "SLOW", velocity_baseline: 0.24 } }
        │
        │         Fallback (ML lỗi): tự tính avgVelocity
        │           avgVelocity < 0.3  → motor_profile: "SLOW"
        │           avgVelocity > 1.0  → motor_profile: "FAST"
        │           otherwise          → motor_profile: "NORMAL"
        │
        ├─► UPDATE children_profiles SET baseline_json = { ... }
        │         Baseline này ML dùng để cá nhân hóa ngưỡng phân loại
        │
        └─► Gửi calibration:ack về FE
```

---

## 7. Session End Flow

```
session:end
        │
        ├─► TrajectoryBufferService.flushSession()
        │         Flush toàn bộ điểm còn trong Redis buffer → lưu vào DB
        │
        ├─► SessionService.endSession()
        │         UPDATE reading_sessions SET status='COMPLETED', ended_at=now()
        │         Tính cognitive_state_summary (đếm FLUENT/REGRESSION/DISTRACTION)
        │         Tính effort_score = (FLUENT×1 + REGRESSION×0.75 + DISTRACTION×0.2) / total
        │
        └─► TokenService.earnFromSession()
                  INSERT INTO tokens:
                    type='EARN'  amount=floor(effortScore × 100)  reason='EFFORT_SESSION_EARN'
                    type='BONUS' amount=20  reason='STREAK_BONUS_N'  (nếu streak ≥ 3 sessions)
```

---

## 8. Toàn bộ vòng đời 1 phiên đọc

```
[CONNECT]  ws://server/tracking?token=JWT
               → Verify JWT → gán user_id + session_id

[session:start]
               → ensureSession() → tạo/kiểm tra reading_sessions
               → gửi intervention:reset về FE (xóa UI cũ)

[mouse:batch]  × N lần (mỗi ~100ms khi đang đọc)
               → buffer điểm vào Redis
               → (nếu ≥ 3 điểm) classify → route intervention
                   REGRESSION → Gemini simplify → tooltip:show + adaptation:trigger
                   DISTRACTION → adaptation:trigger
                   FLUENT → (im lặng)

[calibration:data]  (chỉ 1 lần sau mini-game)
               → tính motor baseline → lưu DB → calibration:ack

[tooltip:show]  (FE confirm)
               → lưu TOOLTIP_SHOWN event vào session_replay_events

[session:end]
               → flush buffer → endSession() → tính token → lưu DB

[DISCONNECT]
```

---

## 9. Bảng tóm tắt DB được ghi trong 1 phiên

| Bảng | Khi nào ghi | Nội dung |
|------|------------|---------|
| `reading_sessions` | `session:start` + `session:end` | Metadata phiên đọc, effort_score |
| `mouse_events` | Flush khi `session:end` | Toàn bộ điểm chuột raw |
| `session_replay_events` | Mỗi lần có cognitive state / tooltip | COGNITIVE_STATE, TOOLTIP_SHOWN, calibration |
| `children_profiles` | Sau `calibration:data` | baseline_json (motor profile) |
| `tokens` | `session:end` | EARN + BONUS tokens |

---

*Tài liệu được tạo tự động từ codebase — 2026-04-27*

---

## 10. Redis trong hệ thống ReadEase

Redis được sử dụng ở **3 nơi độc lập**, mỗi nơi có một Redis client riêng và phục vụ mục đích khác nhau.

### 10a. Tổng quan 3 Redis Client

| Client | Inject Token | Dùng ở | Mục đích |
|--------|-------------|--------|---------|
| `TrajectoryBuffer Redis` | *(tạo thẳng trong constructor)* | `TrajectoryBufferService` | Buffer điểm chuột real-time |
| `REDIS_OTP_CLIENT` | `'REDIS_OTP_CLIENT'` | `OtpService` | Lưu OTP + brute-force protection |
| `REDIS_LEXICAL_CLIENT` | `'REDIS_LEXICAL_CLIENT'` | `LexicalService` | Cache nghĩa từ Gemini TTL 24h |

---

### 10b. Redis #1 — Trajectory Buffer (WebSocket)

**File:** `tracking/services/trajectory-buffer.service.js`

**Vấn đề cần giải quyết:**
Frontend gửi điểm chuột mỗi ~100ms. Nếu INSERT thẳng vào PostgreSQL mỗi lần nhận → **database sẽ quá tải**. Redis đóng vai trò **write buffer** — gom dữ liệu lại rồi flush theo batch.

#### Key schema
```
trajectory:{session_id}   →  Redis List (RPUSH)
```

#### Các lệnh Redis được dùng

| Lệnh | Khi nào | Tác dụng |
|------|---------|---------|
| `RPUSH` | Mỗi lần nhận `mouse:batch` | Append điểm chuột vào cuối list |
| `LRANGE key 0 -1` | Khi flush session | Lấy toàn bộ điểm trong list |
| `DEL key` | Sau khi flush thành công | Xóa buffer đã xử lý |
| `SCAN MATCH trajectory:*` | Mỗi 5 giây (interval) | Tìm tất cả session đang buffer |

#### Pipeline pattern — gom nhiều RPUSH thành 1 round-trip

```js
// Thay vì gọi RPUSH N lần riêng lẻ → tốn N round-trips
// Dùng pipeline: gom tất cả commands → gửi 1 lần duy nhất
const pipeline = this.redis.pipeline();

for (const point of points) {
  pipeline.rpush(key, JSON.stringify({ type: 'mouse_move', ...point }));
}

await pipeline.exec();   // ← chỉ 1 round-trip dù có 50 điểm
```

> 💡 **Đây là tối ưu quan trọng nhất**: Nếu FE gửi 50 điểm/batch mà không dùng pipeline → 50 lần gọi Redis riêng lẻ. Với pipeline → chỉ 1 lần.

#### Auto-flush mỗi 5 giây

```js
// Chạy ngay khi service khởi động, không cần trigger thủ công
setInterval(() => this.flushAll(), 5000);

// flushAll() dùng SCAN để không block Redis:
//   SCAN 0 MATCH trajectory:* COUNT 100
//   → lấy tối đa 100 key mỗi lần
//   → lặp cursor cho đến khi cursor = '0'
```

Điều này đảm bảo dữ liệu không bị mất nếu client mất kết nối đột ngột mà chưa kịp gọi `session:end`.

#### Luồng đầy đủ

```
mouse:batch (50 điểm)
    │
    ▼
RPUSH trajectory:{session_id}  ×50  (1 pipeline call)
    │
    ▼  (mỗi 5s OR khi session:end)
LRANGE trajectory:{session_id} 0 -1
    │
    ▼
ReplayStorageService.storeEvents()  →  INSERT vào PostgreSQL (bulk)
    │
    ▼
DEL trajectory:{session_id}
```

---

### 10c. Redis #2 — OTP Storage & Brute-force Protection

**File:** `auth/services/otp.service.js`

**Vấn đề cần giải quyết:**
OTP trước đây lưu vào PostgreSQL → cần query DB để check, xóa sau khi dùng, không tự expire. Chuyển sang Redis để tận dụng **TTL tự động expire** và **atomic increment**.

#### Key schema — 3 loại key

```
otp:{userId}:{type}            →  "123456"   TTL = 300s  (OTP hết hạn sau 5 phút)
otp:attempts:{userId}:{type}   →  "3"        TTL = 900s  (lock 15 phút sau 5 lần sai)
otp:cooldown:{userId}:{type}   →  "1"        TTL = 60s   (không cho resend trong 60s)
```

Ví dụ key thực tế:
```
otp:550e8400-e29b-41d4-a716-446655440000:EMAIL_VERIFY
otp:attempts:550e8400-e29b-41d4-a716-446655440000:EMAIL_VERIFY
otp:cooldown:550e8400-e29b-41d4-a716-446655440000:FORGOT_PASSWORD
```

#### Các lệnh Redis được dùng

| Lệnh | Khi nào | Tác dụng |
|------|---------|---------|
| `SET key value EX ttl` | Tạo OTP mới | Lưu code + set TTL tự expire |
| `GET key` | Verify OTP | Lấy code đã lưu |
| `DEL key` | OTP đúng | Xóa OTP + attempts ngay lập tức |
| `TTL key` | Check cooldown | Còn bao nhiêu giây trước khi được resend |
| `INCR key` | OTP sai | Tăng bộ đếm sai lên 1 (atomic) |
| `EXPIRE key ttl` | Sau INCR | Đặt TTL cho attempts counter |

#### Tại sao dùng `INCR` thay vì `GET` rồi `SET`?

`INCR` là **atomic** — không có race condition. Nếu dùng `GET` → tính toán → `SET` và có 2 request đồng thời → có thể cả 2 đọc giá trị cũ rồi cùng set lại → bộ đếm sai.

```js
// ✅ Atomic: đảm bảo chính xác dù nhiều request đồng thời
const newCount = await this.redis.incr(attemptsKey);
await this.redis.expire(attemptsKey, 900);  // reset TTL mỗi lần sai
```

#### Luồng tạo OTP

```
createOTP(userId, type)
    │
    ├─► TTL(cooldownKey) > 0 ?  →  throw 429 "Vui lòng chờ Xs"
    │
    ├─► SET otpKey "123456" EX 300
    ├─► DEL attemptsKey           (reset bộ đếm cho code mới)
    └─► SET cooldownKey "1" EX 60
```

#### Luồng verify OTP

```
verifyOTP(userId, code, type)
    │
    ├─► GET otpKey == null  →  throw 400 "OTP expired"
    │
    ├─► GET attemptsKey >= 5  →  throw 429 "Tài khoản bị khóa Xp"
    │
    ├─► stored !== code ?
    │     ├─► INCR attemptsKey
    │     ├─► EXPIRE attemptsKey 900
    │     └─► throw 400 "Sai OTP, còn N lần"
    │
    └─► Đúng:
          ├─► DEL otpKey
          └─► DEL attemptsKey
          (cooldownKey GIỮ NGUYÊN → vẫn block resend 60s)
```

---

### 10d. Redis #3 — Lexical Word Cache

**File:** `lexical/lexical.service.js`

**Vấn đề cần giải quyết:**
Gemini API có latency ~1-3s và quota giới hạn. Khi trẻ đọc, có thể gặp lại **cùng từ khó nhiều lần** (trong một bài hoặc nhiều bài). Caching Redis giúp trả lời ngay lập tức từ lần thứ 2 trở đi.

#### Key schema

```
lexical:{word_lowercase_trimmed}   →  JSON string  TTL = 86400s (24 giờ)
```

Ví dụ:
```
lexical:caterpillar   →  {"simplified":"Đây là con sâu nhỏ sống trong vườn."}  TTL=86400
lexical:luminous      →  {"simplified":"Đây là ánh sáng rực rỡ."}               TTL=86400
```

#### Các lệnh Redis được dùng

| Lệnh | Khi nào | Tác dụng |
|------|---------|---------|
| `GET key` | Trước mỗi Gemini call | Check cache hit |
| `SET key value EX 86400` | Sau khi Gemini trả về | Lưu kết quả 24h |

#### Luồng

```
simplifyWord("caterpillar", "The caterpillar...")
    │
    ├─► GET lexical:caterpillar
    │     HIT  →  return { simplified: "...", source: "cache" }
    │     MISS ↓
    │
    ├─► Gemini API generateContent(prompt)
    │     → "Đây là con sâu nhỏ sống trong vườn."
    │
    ├─► SET lexical:caterpillar {"simplified":"..."} EX 86400
    │
    └─► return { simplified: "...", source: "gemini" }
```

#### Tại sao TTL = 24h?

- Nghĩa của từ không thay đổi → không cần invalidate thường xuyên
- 24h đủ để serve trong 1 ngày học, tự expire ban đêm để giải phóng bộ nhớ
- Không cần manual invalidation

---

### 10e. Tổng hợp — Redis Key Namespace toàn hệ thống

```
trajectory:{session_id}              ← List  (điểm chuột buffer)
otp:{userId}:{type}                  ← String (mã OTP 6 số)
otp:attempts:{userId}:{type}         ← String (bộ đếm sai)
otp:cooldown:{userId}:{type}         ← String (guard resend)
lexical:{word}                       ← String (JSON nghĩa từ)
```

### 10f. Tại sao dùng 3 Redis client riêng biệt?

```
REDIS_OTP_CLIENT      ─ inject vào OtpService
REDIS_LEXICAL_CLIENT  ─ inject vào LexicalService
TrajectoryBuffer Redis ─ tạo thẳng trong constructor
```

**Lý do tách biệt:**
- Mỗi service có thể cấu hình độc lập (host, port, DB index khác nhau nếu cần)
- Một client bị lỗi không ảnh hưởng sang service khác
- Dễ monitor/debug riêng từng use-case
- Trong production có thể tách thành các Redis instance riêng nếu tải cao

---

### 10g. Tóm tắt các Redis feature được dùng

| Feature Redis | Lệnh | Dùng ở | Mục đích |
|--------------|------|--------|---------|
| **TTL tự expire** | `SET key val EX ttl` | OTP, Lexical | Không cần job cleanup thủ công |
| **Atomic increment** | `INCR` | OTP attempts | Brute-force counter an toàn |
| **TTL query** | `TTL key` | OTP cooldown | Biết còn bao lâu trước khi hết hạn |
| **List (queue)** | `RPUSH`, `LRANGE`, `DEL` | Trajectory | Write buffer cho mouse events |
| **Pipeline** | `.pipeline().exec()` | Trajectory | Batch nhiều commands = 1 round-trip |
| **Key scan** | `SCAN MATCH pattern` | Trajectory | Flush tất cả session không dùng `KEYS *` |
| **Simple cache** | `GET` / `SET` | Lexical | Cache Gemini response |

> 💡 **Lưu ý về `SCAN` vs `KEYS *`:** `KEYS *` sẽ **block Redis** trong khi scan toàn bộ keyspace (nguy hiểm với production). `SCAN` chia nhỏ thành nhiều lần, không block. Codebase dùng đúng `SCAN` với `COUNT 100`.

