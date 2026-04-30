# ReadEase Backend

> Adaptive reading platform for children with Dyslexia — Backend API, ML Engine & Infrastructure.

[![CI/CD](https://github.com/ngoNguyenTruongAn/ReadEase-Backend/actions/workflows/ci.yml/badge.svg)](https://github.com/ngoNguyenTruongAn/ReadEase-Backend/actions)
![Node.js](https://img.shields.io/badge/Node.js-22.x-339933?logo=node.js)
![NestJS](https://img.shields.io/badge/NestJS-11.x-E0234E?logo=nestjs)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql)
![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis)
![Python](https://img.shields.io/badge/Python-3.11-3776AB?logo=python)

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Tech Stack & Versions](#tech-stack--versions)
- [Prerequisites](#prerequisites)
- [Project Structure](#project-structure)
- [Quick Start (Docker)](#quick-start-docker)
- [Manual Setup (Without Docker)](#manual-setup-without-docker)
- [Environment Variables](#environment-variables)
- [Database Migrations](#database-migrations)
- [Available Scripts](#available-scripts)
- [API Modules](#api-modules)
- [Testing](#testing)
- [CI/CD Pipeline](#cicd-pipeline)
- [Troubleshooting](#troubleshooting)

---

## Architecture Overview

```
┌────────────┐     ┌────────────────────┐     ┌──────────────┐
│  Frontend   │────▶│  NestJS API (:3000) │────▶│ PostgreSQL 16│
│  (React)    │     │  JavaScript/ES2022  │     │   (:5432)    │
└────────────┘     └────────┬───────────┘     └──────────────┘
                            │
                   ┌────────┼────────┐
                   │        │        │
              ┌────▼───┐ ┌──▼───┐ ┌──▼──────────┐
              │Redis 7 │ │ML Eng│ │ Gemini AI    │
              │(:6379) │ │(:8000│ │ (Google API) │
              │OTP,    │ │Python│ │ Reports &    │
              │Cache   │ │FastAPI│ │ Lexical     │
              └────────┘ └──────┘ └─────────────┘
```

---

## Tech Stack & Versions

### Backend (NestJS)

| Technology | Version | Purpose |
|---|---|---|
| **Node.js** | `22.x` | Runtime (CI uses 22.x) |
| **NestJS** | `11.0.1` | Framework (Controllers, Guards, Pipes, Interceptors) |
| **TypeORM** | `0.3.28` | ORM — PostgreSQL migrations & entities |
| **PostgreSQL** | `16-alpine` | Primary database |
| **Redis** | `7-alpine` | OTP storage, lexical cache, WebSocket buffer |
| **ioredis** | `5.10.0` | Redis client for NestJS |
| **Socket.IO** | `11.1.16` | Real-time mouse/eye tracking via WebSocket |
| **Passport + JWT** | `0.7.0` / `11.0.2` | Authentication & RBAC |
| **bcrypt** | `6.0.0` | Password hashing |
| **Joi** | `18.0.2` | Request validation & env var schema |
| **Winston** | `3.19.0` | Structured JSON logging |
| **@google/generative-ai** | `0.24.1` | Gemini AI SDK (Reports & Lexical) |
| **Nodemailer** | `8.0.2` | OTP email delivery |
| **Supabase JS** | `2.99.2` | Object storage for reading content |
| **Multer** | `2.1.1` | File upload handling |

### ML Service (Python)

| Technology | Version | Purpose |
|---|---|---|
| **Python** | `3.11` | Runtime |
| **FastAPI** | `0.115.0` | REST API for ML predictions |
| **Uvicorn** | `0.44.0` | ASGI server |
| **scikit-learn** | `1.5.0` | RandomForest classifier (cognitive state) |
| **NumPy** | `2.4.4` | Numerical computation |
| **Pandas** | `3.0.2` | Data processing |
| **Underthesea** | `≥6.8.0` | Vietnamese NLP word segmentation |

### Dev Tools

| Tool | Version | Purpose |
|---|---|---|
| **ESLint** | `9.18.0` | Linting (auto-fix on pre-commit) |
| **Prettier** | `3.4.2` | Code formatting |
| **Jest** | `30.0.0` | Unit testing framework |
| **Husky** | `9.1.7` | Git hooks (lint + test on pre-commit) |
| **Nodemon** | `3.1.14` | Hot-reload in development |
| **Docker Compose** | `v2` | Container orchestration |

---

## Prerequisites

### Required

| Tool | Min Version | Install |
|---|---|---|
| **Docker Desktop** | `4.x` | [docker.com/get-started](https://www.docker.com/get-started/) |
| **Docker Compose** | `v2` | Included with Docker Desktop |
| **Git** | `2.x` | [git-scm.com](https://git-scm.com/) |

### Optional (for local development without Docker)

| Tool | Min Version | Install |
|---|---|---|
| **Node.js** | `18.x` (recommended `22.x`) | [nodejs.org](https://nodejs.org/) |
| **npm** | `9.x+` | Included with Node.js |
| **Python** | `3.11` | [python.org](https://www.python.org/) |
| **PostgreSQL** | `16` | [postgresql.org](https://www.postgresql.org/) |
| **Redis** | `7` | [redis.io](https://redis.io/) |

---

## Project Structure

```
ReadEase-Backend/
├── backend/                      # NestJS API (JavaScript)
│   ├── src/
│   │   ├── main.js               # Entry point
│   │   ├── app.module.js         # Root module
│   │   ├── config/               # Env validation & config factories
│   │   ├── common/               # Logger, interceptors, filters
│   │   ├── database/             # TypeORM data-source & migrations
│   │   └── modules/
│   │       ├── analytics/        # Heatmap, trends, session replay
│   │       ├── auth/             # Register, login, OTP, JWT, RBAC
│   │       ├── email/            # Nodemailer transporter
│   │       ├── gamification/     # Tokens, rewards, redemptions
│   │       ├── guardian/         # COPPA: export, erase, link child
│   │       ├── health/           # Health check (DB + Redis)
│   │       ├── lexical/          # Gemini word simplification
│   │       ├── reading/          # Content CRUD + segmentation
│   │       ├── reports/          # AI weekly reports (Gemini)
│   │       ├── storage/          # Supabase file upload
│   │       ├── tracking/         # WebSocket + calibration
│   │       └── users/            # User entity
│   ├── package.json
│   └── Dockerfile.dev
│
├── ml-service/                   # Python ML Engine
│   ├── app/
│   │   ├── main.py               # FastAPI entry
│   │   ├── classifier.py         # RandomForest cognitive state
│   │   └── calibration.py        # Motor profile classification
│   ├── requirements.txt
│   └── Dockerfile.dev
│
├── docker-compose.yml            # Development orchestration
├── docker-compose.prod.yml       # Production orchestration
├── .github/workflows/ci.yml      # CI/CD pipeline
├── .env.example                  # Environment template
└── README.md                     # ← You are here
```

---

## Quick Start (Docker)

This is the **recommended** approach — ensures all team members have identical environments.

```bash
# 1. Clone the repository
git clone https://github.com/ngoNguyenTruongAn/ReadEase-Backend.git
cd ReadEase-Backend

# 2. Create environment file
cp .env.example .env
# Edit .env if needed (defaults work for local development)

# 3. Start all services
docker compose up --build
```

Docker will automatically start:
- **readease_api** — NestJS on `http://localhost:3000`
- **readease_db** — PostgreSQL on `localhost:5432`
- **readease_redis** — Redis on `localhost:6379`
- **readease_ml** — Python ML on `http://localhost:8000`

### Verify

```bash
# Health check
curl http://localhost:3000/api/v1/health
```

---

## Manual Setup (Without Docker)

### 1. Install PostgreSQL 16

```bash
# Windows: Download from https://www.postgresql.org/download/windows/
# Create database:
psql -U postgres
CREATE USER readease_app WITH PASSWORD 'devpassword';
CREATE DATABASE readease OWNER readease_app;
\q
```

### 2. Install Redis 7

```bash
# Windows: Use WSL or download from https://github.com/tporadowski/redis/releases
# macOS: brew install redis && brew services start redis
# Linux: sudo apt install redis-server
```

### 3. Install Backend Dependencies

```bash
cd backend
npm install
```

### 4. Configure Environment

```bash
# From project root
cp .env.example .env

# Edit .env — change these for local (non-Docker):
# DB_HOST=localhost      (not "postgres")
# REDIS_HOST=localhost   (not "redis")
# ML_ENGINE_URL=http://localhost:8000
```

### 5. Run Database Migrations

```bash
cd backend
npm run migration:run
```

### 6. Start the Backend

```bash
# Development (hot-reload)
npm run start:dev

# Production
npm run start:prod
```

### 7. Start ML Service (Optional)

```bash
cd ml-service
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

---

## Environment Variables

Create a `.env` file in the project root. All variables are documented below:

### Required Variables

| Variable | Default | Description |
|---|---|---|
| `DB_HOST` | `postgres` | PostgreSQL host (`localhost` without Docker) |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_NAME` | `readease` | Database name |
| `DB_USER` | `readease_app` | Database username |
| `DB_PASSWORD` | `devpassword` | Database password |
| `REDIS_HOST` | `redis` | Redis host (`localhost` without Docker) |
| `REDIS_PORT` | `6379` | Redis port |
| `JWT_SECRET` | *(change in prod)* | Secret for signing JWT tokens |
| `JWT_ACCESS_TTL` | `900` | Access token TTL in seconds (15min) |
| `JWT_REFRESH_TTL` | `604800` | Refresh token TTL in seconds (7 days) |

### Optional Variables

| Variable | Default | Description |
|---|---|---|
| `APP_PORT` | `3000` | API server port |
| `APP_ENV` | `development` | Environment (`development` / `production`) |
| `LOG_LEVEL` | `debug` | Winston log level |
| `GEMINI_API_KEY` | *(empty)* | Google Gemini API key ([Get one free](https://aistudio.google.com/apikey)) |
| `GEMINI_MODEL` | `gemini-2.0-flash` | Gemini model name |
| `ML_ENGINE_URL` | `http://ml-engine:8000` | ML service URL |
| `ML_TIMEOUT_MS` | `5000` | ML request timeout |

> **Note:** If `GEMINI_API_KEY` is not set, Reports and Lexical modules will operate in **fallback mode** (local template generation instead of AI).

---

## Database Migrations

TypeORM migrations are stored in `backend/src/database/migrations/`.

```bash
cd backend

# Run pending migrations
npm run migration:run

# Revert last migration
npm run migration:revert

# Generate a new migration from entity changes
npm run migration:generate -- src/database/migrations/YourMigrationName
```

### Current Tables (11)

| Table | Description |
|---|---|
| `users` | User accounts (ROLE_CHILD, ROLE_GUARDIAN, ROLE_CLINICIAN) |
| `children_profiles` | Extended child profile data |
| `guardian_children` | Guardian ↔ Child link table |
| `reading_content` | Reading materials (title, body_url, grade) |
| `reading_sessions` | Session tracking (start, end, effort_score) |
| `mouse_events` | Cursor tracking (x, y, velocity, dwell_time) |
| `session_replay_events` | ML-classified events (cognitive_state) |
| `tokens` | Gamification token transactions |
| `rewards` | Available rewards catalog |
| `redemptions` | Token ↔ Reward redemption records |
| `reports` | AI-generated weekly reading reports |

---

## Available Scripts

Run from the `backend/` directory:

| Script | Command | Description |
|---|---|---|
| **Dev server** | `npm run start:dev` | Hot-reload with nodemon |
| **Production** | `npm run start:prod` | No hot-reload |
| **Debug** | `npm run start:debug` | Node inspector enabled |
| **Lint** | `npm run lint` | ESLint with auto-fix |
| **Format** | `npm run format` | Prettier formatting |
| **Unit tests** | `npm test` | Run all Jest tests |
| **Test watch** | `npm run test:watch` | Jest in watch mode |
| **Test coverage** | `npm run test:cov` | Generate coverage report |
| **Migrate** | `npm run migration:run` | Execute pending migrations |
| **Migrate revert** | `npm run migration:revert` | Rollback last migration |

---

## API Modules

Base URL: `http://localhost:3000/api/v1`

| Module | Prefix | Endpoints | Auth | Description |
|---|---|---|---|---|
| **Health** | `/health` | 1 | Public | Server + DB + Redis status |
| **Auth** | `/auth` | 11 | Mixed | Register, login, OTP, JWT, password |
| **Content** | `/content` | 4 | JWT | Reading content CRUD |
| **Upload** | `/upload` | 4 | JWT | File upload (Supabase storage) |
| **Tracking** | `/calibrate` | 1 | JWT | Motor calibration mini-game |
| **Gamification** | `/tokens`, `/rewards` | 4 | JWT + RBAC | Token balance, rewards, redeem |
| **Analytics** | `/analytics` | 2 | JWT + RBAC | Heatmap, trends |
| **Sessions** | `/sessions` | 2 | JWT + RBAC | Replay, session list |
| **Guardian** | `/guardian` | 4 | JWT + RBAC | Export, erase, children, link |
| **Reports** | `/reports` | 3 | JWT + RBAC | AI weekly reports (Gemini) |
| **Lexical** | `/lexical` | 1 | JWT | Word simplification (Gemini) |
| **WebSocket** | `ws:///tracking` | 5 events | JWT handshake | Real-time mouse tracking |

**Total: 42 endpoints** (37 REST + 5 WebSocket events)

---

## Testing

```bash
cd backend

# Run all unit tests
npm test

# Run with coverage
npm run test:cov

# Run specific module
npx jest src/modules/reports/tests/reports.service.spec.js

# Run integration tests (requires running DB)
npm run test:guardian:integration
```

### Test Coverage Summary

| Module | Test File | Tests |
|---|---|---|
| Auth | `auth.service.spec.js`, `auth.rbac.spec.js` | 20+ |
| Analytics | `analytics.service.spec.js`, `analytics.controller.spec.js` | 15+ |
| Gamification | `gamification.service.spec.js`, `gamification.controller.spec.js` | 20+ |
| Guardian | `guardian.service.spec.js`, `guardian.controller.spec.js` | 15+ |
| Reading | `content.service.spec.js`, `content.controller.spec.js` | 15+ |
| Reports | `reports.service.spec.js` | 14 |
| Lexical | `lexical.service.spec.js` | 10 |
| Tracking | `tracking.controller.spec.js` | 10+ |

**Total: 180+ unit tests across 17 test suites**

---

## CI/CD Pipeline

Defined in `.github/workflows/ci.yml`:

```
Push/PR to main or develop
        │
        ▼
┌─── Stage 1: Test ───┐
│ • Node 22.x setup    │
│ • npm ci + lint       │
│ • Jest unit tests     │
│ • Python 3.11 setup   │
│ • pip install + pytest│
└──────────┬───────────┘
           │ (only on push to main)
           ▼
┌─── Stage 2: Deploy ─┐
│ • SSH to VPS         │
│ • git pull origin    │
│ • docker compose up  │
│ • Run migrations     │
│ • Health check       │
└──────────────────────┘
```

---

## Troubleshooting

### Port conflicts

```bash
# Check if port 5432 is already in use (Windows PowerShell)
Get-NetTCPConnection -LocalPort 5432

# Kill process on port 3000
npx kill-port 3000
```

### Docker build is slow (transferring context)

Ensure `backend/.dockerignore` excludes `node_modules`:

```
node_modules
dist
coverage
.git
```

### Database connection refused

- **Docker:** Service depends_on uses healthcheck — wait for `readease_db` to be healthy
- **Local:** Ensure `DB_HOST=localhost` (not `postgres`) in `.env`

### Redis connection refused

- **Docker:** Automatically managed
- **Local:** Start Redis manually: `redis-server` or `brew services start redis`

### Gemini API returns fallback

- Check `GEMINI_API_KEY` is set in `.env`
- Free tier limit: 15 RPM, 1M tokens/day
- Get a key at [Google AI Studio](https://aistudio.google.com/apikey)

### Pre-commit hook fails

Husky runs `lint` + `test` before every commit. Fix lint errors first:

```bash
cd backend
npm run lint      # auto-fix what it can
npm test          # ensure tests pass
```

---

## Team & License

**Project:** ReadEase — Capstone Project (C2SE31)  
**Team:** ReadEase Team  
**License:** UNLICENSED (Private)
