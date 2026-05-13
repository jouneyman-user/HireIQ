# Deployment

> Environment setup and deployment process for HireIQ. Read alongside [`SECURITY.md`](./SECURITY.md) and [`VERSION_MANAGEMENT.md`](./VERSION_MANAGEMENT.md).

---

## Environments

| Environment | Purpose | Database | URL |
|-------------|---------|----------|-----|
| **Local development** | Feature development and testing | SQLite (`backend/hireiq.db`) | `localhost:5173` (frontend) / `localhost:8000` (API) |
| **Staging** | Pre-release validation | TBD (M2+) | TBD |
| **Production** | Live system | TBD (M2+) | TBD |

At M1, only local development is in scope. Staging and production environments are future milestone work.

---

## Prerequisites

Install these before running anything:

| Tool | Minimum version | Install |
|------|----------------|---------|
| Python | 3.10 | [python.org](https://www.python.org/downloads/) or `pyenv install 3.10` |
| Node.js | 18 | [nodejs.org](https://nodejs.org/) or `nvm install 18` |
| npm | 8+ | Bundled with Node.js |
| GNU Make | Any | macOS: `xcode-select --install` · Linux: `apt install make` · Windows: Git Bash or `winget install GnuWin32.Make` |

**Verify:**

```bash
python3 --version   # must be >= 3.10
node --version      # must be >= 18
npm --version       # must be >= 8
make --version
```

---

## Local Setup

### Quick start (recommended)

```bash
# 1. Clone the repository
git clone https://github.com/jouneyman-user/HireIQ.git
cd HireIQ

# 2. Install all dependencies (backend + frontend)
make install

# 3. Configure environment (copy template, edit if needed)
cp backend/.env.example backend/.env

# 4. Initialise the database
make migrate

# 5. Start development servers
make dev
```

After `make dev`:
- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API docs (Swagger): http://localhost:8000/docs
- API docs (ReDoc): http://localhost:8000/redoc

### Manual setup (if make is unavailable)

```bash
# Backend
cd backend
python3 -m venv .venv          # optional but recommended
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
python -m migrations.init_db    # initialise SQLite
uvicorn app.main:app --reload --port 8000

# Frontend (in a second terminal)
cd frontend
npm install
npm run dev
```

---

## Build Process

### Backend

FastAPI with Uvicorn has no separate build step for development. For production deployment (future milestone), the artifact is the Python source tree + installed packages.

```bash
# No build step for local dev
# Production: package with Docker or deploy source directly
```

### Frontend

```bash
cd frontend
npm run build   # outputs to frontend/dist/
```

The `dist/` directory contains the production-optimised static files. In a future production setup, these would be served by a CDN or a reverse proxy (nginx).

---

## CI/CD Pipeline

No CI/CD pipeline exists at M1. The following is the **planned pipeline** for M2:

```
┌─────────────────────────────────────────────────────────┐
│ On push to any branch:                                  │
│  1. Lint (ruff for backend, eslint for frontend)        │
│  2. Type check (mypy for backend, tsc for frontend)     │
│  3. Tests (pytest + vitest)                             │
│  4. Coverage gate (≥80%)                                │
│                                                         │
│ On push to main:                                        │
│  + Build frontend artifact                              │
│  + Deploy to staging (future)                           │
└─────────────────────────────────────────────────────────┘
```

---

## Environment Variables

All environment variables are documented in `backend/.env.example`. Never commit actual values.

### Backend

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `DATABASE_URL` | `sqlite:///./hireiq.db` | No | SQLAlchemy-compatible database URL |

> **Important:** `DATABASE_URL` uses a path relative to the `backend/` directory where uvicorn is run from. Do not run uvicorn from the repo root.

### Frontend

Vite exposes environment variables prefixed with `VITE_` to the browser. No frontend env vars are required at M1.

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `VITE_API_URL` | (proxied via Vite) | No | Only needed if not using Vite proxy |

---

## Database Migrations

### Running migrations

```bash
# Via Makefile (preferred)
make migrate

# Manually
cd backend && python -m migrations.init_db
```

`init_db.py` is **idempotent** — safe to run multiple times. It uses `Base.metadata.create_all()` which creates tables that don't exist and leaves existing tables unchanged.

### Schema changes (M2+)

When schema changes are needed, the project will migrate from raw `create_all` to **Alembic**:

```bash
# Future: Alembic workflow
alembic revision --autogenerate -m "add candidates table"
alembic upgrade head
```

### Rollback procedure (M1)

At M1, SQLite is the only database and there is no Alembic. To rollback:

1. Stop the backend server
2. Delete `backend/hireiq.db`
3. Re-run `make migrate` to recreate from scratch

> **Warning:** This destroys all data. At M1, the database contains only schema (no production data), so this is acceptable. At M2+, proper Alembic `downgrade` scripts must be written for any rollback.

---

## Health Checks

### After starting the development server

```bash
# Verify backend is running
curl http://localhost:8000/health
# Expected: {"status":"ok","timestamp":"2026-05-13T...Z"}

# Verify frontend is running
open http://localhost:5173
# Expected: HireIQ page showing "API status: ok"
```

### Port conflict resolution

If port 8000 or 5173 is already in use:

```bash
# Find and kill the process on port 8000
kill $(lsof -ti:8000)

# Find and kill the process on port 5173
kill $(lsof -ti:5173)

# Or use different ports
BACKEND_PORT=8001 uvicorn app.main:app --reload --port $BACKEND_PORT
# (Update vite.config.ts proxy target to match)
```

---

## Rollback Procedure

### Rolling back a development change

```bash
# Undo last commit (keep changes staged)
git reset HEAD~1

# Or discard entirely
git reset --hard HEAD~1
```

### Rolling back the database (M1)

See "Rollback procedure" under Database Migrations above.

---

## Claude Code in CI/CD

No Claude Code integration in CI/CD at M1. When introduced:

- Pipeline stages that invoke Claude Code should run with `--print` (non-interactive mode)
- Tool permissions must be minimal: read-only tools for analysis stages
- Human approval gates must exist before any AI-generated code can merge to `main`
- Model selection: use cheaper/faster models (Haiku) for routine checks; Sonnet for code review

---

## Runbook — Common Issues

### `make dev` — uvicorn background process not stopped by Ctrl+C

**Symptom:** `Ctrl+C` stops the Vite dev server but uvicorn keeps running. Next `make dev` fails with "port 8000 already in use."

**Fix:**

```bash
kill $(lsof -ti:8000)
```

**Root cause:** `make dev` starts uvicorn with `&` (background), then runs Vite in the foreground. Ctrl+C kills the foreground process (Vite) but not the background process.

---

### `python -m migrations.init_db` — `ModuleNotFoundError: No module named 'app'`

**Symptom:** Running `init_db.py` fails with a module not found error.

**Fix:** Always run the migration from inside the `backend/` directory:

```bash
cd backend && python -m migrations.init_db
# NOT: python backend/migrations/init_db.py
```

**Root cause:** Python resolves `from app.database import ...` relative to the current directory. Running from outside `backend/` means `app` is not on the Python path.

---

### Vite proxy — `CORS error` when calling `/api/*`

**Symptom:** Browser console shows CORS error when the frontend calls the API.

**Fix:** Ensure uvicorn is running on port 8000 AND the proxy target in `vite.config.ts` matches:

```typescript
proxy: {
  '/api': {
    target: 'http://localhost:8000',  // must match uvicorn port
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api/, ''),
  },
},
```

**Root cause:** CORS errors in development usually mean the Vite proxy is not running (Vite not started) or the target port is wrong. The proxy eliminates CORS entirely — CORS errors mean the proxy is bypassed.

---

### SQLite — `OperationalError: database is locked`

**Symptom:** FastAPI returns 500 with "database is locked" after running multiple requests.

**Fix:** Ensure `check_same_thread=False` is set in the SQLAlchemy engine:

```python
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False}
)
```

**Root cause:** SQLite's default threading model rejects connections from non-creator threads. FastAPI's async model uses multiple threads; this flag relaxes the restriction.

---

### TypeScript — `npm run build` fails with type errors

**Symptom:** Local `npm run dev` works but `npm run build` fails.

**Fix:** Run `npm run type-check` to see the errors, then fix them:

```bash
cd frontend && npx tsc --noEmit
```

**Root cause:** Vite's dev server is more lenient with TypeScript errors than the production build. Always run type-check before opening a PR.

---

*Last updated: 2026-05-13 — M1 foundation scaffold.*
