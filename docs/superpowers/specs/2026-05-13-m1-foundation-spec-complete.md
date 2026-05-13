# 🔍 Technical Specification — Milestone 1: Monorepo Foundation Scaffold

> **Issue:** [#1 — Project setup — FastAPI backend, SQLite DB, and React frontend scaffold](https://github.com/jouneyman-user/HireIQ/issues/1)
> **Skill used:** `superpowers:brainstorming` (Super Skills — autonomous analysis, no user interaction)
> **Date:** 2026-05-13
> **Effort:** S (Small)
> **Milestone:** M1 — Foundation
> **Status:** ✅ Approved for implementation

---

## 🔎 Problem Summary

The HireIQ repository is currently a clean slate — two commits deep (`Initial commit` + spec docs), with only a stub `README.md` and existing spec documents. **No runnable code exists yet.**

Milestone 1 requires bootstrapping a **working monorepo scaffold** so that every subsequent feature can be developed without environment friction. The target state is:

| Layer | Technology | URL |
|-------|------------|-----|
| Backend API | FastAPI (Python ≥ 3.10) | `http://localhost:8000` |
| Database | SQLite (auto-initialised on first run) | `backend/hireiq.db` |
| Frontend | React + TypeScript (Vite) | `http://localhost:5173` |

**Acceptance criteria (verbatim from issue):**

| # | Criterion | Done? |
|---|-----------|-------|
| 1 | FastAPI app runs on `localhost:8000` with a `/health` endpoint returning 200 | ⬜ |
| 2 | SQLite database initialises automatically on first run with migration script | ⬜ |
| 3 | React app runs on `localhost:5173` and proxies `/api` calls to FastAPI | ⬜ |
| 4 | README documents setup steps for both frontend and backend | ⬜ |

The effort is rated **Small** — the solution must be lean, with minimal prerequisites and maximum developer ergonomics on first clone.

---

## 💡 Options Considered

### Option 1 — Minimal Flat Monorepo + Makefile Orchestration ✅ *(Recommended)*

Two sibling directories (`backend/`, `frontend/`) at the repo root, orchestrated by a root `Makefile`. No container runtime required; zero extra tooling beyond Python and Node.

**Pros:**
- Zero extra tooling prerequisites beyond Python ≥ 3.10 and Node ≥ 18
- `make install && make migrate && make dev` satisfies **all four** acceptance criteria in one line
- Instant hot-reload on both sides — no image builds, no container overhead
- `make` is universally understood; available on Windows via Git Bash, Chocolatey, or `winget`
- SQLite file lives alongside backend code — trivial path resolution, no volume mapping complexity
- Aligns perfectly with "S" (Small) effort rating — fewest moving parts

**Cons:**
- Local Python/Node versions must match prerequisites manually (no OS-level lockfile enforcement)
- No built-in environment parity guarantee across machines (mitigated by explicit README prerequisites section)
- Background `&` pattern in `make dev` requires manual process cleanup on Windows Git Bash

---

### Option 2 — Docker Compose Dev Environment

Backend and frontend each containerised; a `docker-compose.yml` at the repo root orchestrates both services alongside a shared network.

**Pros:**
- Fully reproducible environment across all developer machines — no version mismatch issues
- Easy to add services (Redis, PostgreSQL, pgAdmin) in future milestones without changing the dev workflow
- No local Python or Node installation required after initial Docker setup

**Cons:**
- Requires Docker Desktop (~4 GB install) — significant friction for a *foundation* milestone
- SQLite volume mounts introduce file-locking edge cases on Linux/macOS/Windows
- Slower hot-reload cycle inside containers (bind-mount overhead vs. native filesystem)
- Overkill for "S" effort rating; environment parity isn't a pain point until the team grows

---

### Option 3 — Poetry + PNPM Workspaces + `concurrently`

Full monorepo workspace tooling: Poetry for Python dependency management, PNPM workspaces for JavaScript packages, `concurrently` for a unified dev process from the repo root.

**Pros:**
- Modern, strict lockfiles on both sides (`poetry.lock`, `pnpm-lock.yaml`) — deterministic installs
- Scales cleanly as the project grows into multiple frontend packages or Python microservices
- Single `pnpm run dev` from repo root starts everything — polished DX

**Cons:**
- PNPM workspace config is unnecessary complexity with only one frontend package at M1
- Poetry is non-standard; adds a learning curve for developers unfamiliar with it
- More setup steps directly contradicts the "without environment friction" acceptance criterion
- `pnpm` is not universally installed — adds a new prerequisite on top of Node

---

## ✅ Recommended Approach

**Option 1 — Minimal Flat Monorepo + Makefile.**

The acceptance criteria explicitly value *friction-free setup*. The effort is rated Small. Docker adds prerequisites and complexity; workspace tooling is premature with a single backend and single frontend. A flat `backend/` + `frontend/` layout with a `Makefile` achieves all four acceptance criteria with the least moving parts. This approach does not lock us out of future evolution — it can be upgraded to Docker Compose or workspace tooling in a later milestone when environment parity or multi-package structure becomes a genuine concern.

---

## ⚙️ Implementation Steps

### Step 1 — Repository Structure

```
HireIQ/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py              # FastAPI app factory + CORS config
│   │   ├── database.py          # SQLAlchemy engine + session factory
│   │   └── routers/
│   │       ├── __init__.py
│   │       └── health.py        # GET /health → {"status":"ok","timestamp":"<ISO-8601>"}
│   ├── migrations/
│   │   └── init_db.py           # Idempotent Base.metadata.create_all(engine)
│   ├── requirements.txt         # fastapi, uvicorn[standard], sqlalchemy, python-dotenv
│   └── .env.example             # DATABASE_URL=sqlite:///./hireiq.db
├── frontend/
│   ├── src/
│   │   ├── main.tsx             # React root entrypoint
│   │   └── App.tsx              # Minimal component that fetches /api/health
│   ├── vite.config.ts           # proxy /api → http://localhost:8000 (with rewrite)
│   ├── package.json
│   ├── tsconfig.json
│   └── index.html
├── Makefile                     # install | migrate | dev | lint | help targets
├── .gitignore                   # hireiq.db, __pycache__, node_modules, dist, .env
└── README.md                    # Full setup documentation
```

---

### Step 2 — Backend (`backend/`)

#### `app/main.py` — Application factory

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import health

app = FastAPI(title="HireIQ API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
```

**Why explicit `allow_origins`?** Prevents accidental wildcard CORS in dev and ensures any mis-configuration is immediately visible rather than silently permissive.

#### `app/database.py` — Database configuration

```python
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./hireiq.db")

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()
```

**Why `check_same_thread=False`?** Required by SQLite when using FastAPI's async request handling — SQLite's default threading check would otherwise raise an error.

#### `app/routers/health.py` — Health endpoint

```python
from datetime import datetime, timezone
from fastapi import APIRouter

router = APIRouter()

@router.get("/health", status_code=200)
def health_check():
    return {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
```

#### `migrations/init_db.py` — Database initialiser

```python
import sys
import os

# Ensure the backend/ directory is on sys.path when run as a module
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.database import Base, engine
import app.main  # noqa: F401 — registers all models with Base

if __name__ == "__main__":
    Base.metadata.create_all(bind=engine)
    print("✅ Database initialised successfully.")
```

**Why import `app.main`?** Without it, `Base.metadata` is empty and `create_all` creates no tables. Importing `app.main` triggers all model registrations as a side effect.

**Why idempotent?** `create_all` only creates tables that don't exist — safe to re-run at any time.

#### `requirements.txt`

```
fastapi>=0.111.0
uvicorn[standard]>=0.29.0
sqlalchemy>=2.0.0
python-dotenv>=1.0.0
```

**Start command:** `uvicorn app.main:app --reload --port 8000` (run from `backend/`)

---

### Step 3 — Frontend (`frontend/`)

Bootstrap via:
```bash
npm create vite@latest frontend -- --template react-ts
```

#### `vite.config.ts` — Proxy configuration

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
```

**Why rewrite the `/api` prefix?** The React frontend calls `/api/health` (namespaced to avoid path collisions). The proxy strips `/api` so FastAPI sees `GET /health` — keeping backend routes clean and prefix-free.

#### `src/App.tsx` — Minimal scaffold component

```tsx
import { useEffect, useState } from 'react'

function App() {
  const [status, setStatus] = useState<string>('loading…')

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((d) => setStatus(d.status))
      .catch(() => setStatus('unreachable'))
  }, [])

  return (
    <div style={{ fontFamily: 'sans-serif', padding: '2rem' }}>
      <h1>HireIQ</h1>
      <p>API status: <strong>{status}</strong></p>
    </div>
  )
}

export default App
```

**Start command:** `npm run dev` (Vite binds to port 5173 by default)

---

### Step 4 — Makefile

```makefile
.PHONY: install dev migrate lint help

help:        ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

install:     ## Install all dependencies (backend Python + frontend Node)
	cd backend && pip install -r requirements.txt
	cd frontend && npm install

migrate:     ## Initialise / migrate the SQLite database (idempotent)
	cd backend && python migrations/init_db.py

dev:         ## Start backend (background) + frontend (foreground) concurrently
	cd backend && uvicorn app.main:app --reload --port 8000 &
	cd frontend && npm run dev

lint:        ## Lint backend (ruff) and frontend (eslint)
	cd backend && ruff check .
	cd frontend && npm run lint
```

> **Windows note:** Use [Git Bash](https://git-scm.com/downloads) to run `make` targets, or execute each `cd ... && ...` command manually in PowerShell.

---

### Step 5 — `.gitignore`

```gitignore
# Python
__pycache__/
*.pyc
*.pyo
.env
backend/hireiq.db
backend/.venv/
.pytest_cache/
*.egg-info/

# Node
frontend/node_modules/
frontend/dist/
frontend/.env.local
frontend/.env

# OS
.DS_Store
Thumbs.db
```

---

### Step 6 — README.md Structure

```markdown
# HireIQ

> AI-powered hiring intelligence platform.

## Prerequisites
- Python ≥ 3.10
- Node.js ≥ 18
- `make` (Linux/macOS pre-installed; Windows: Git Bash or `winget install GnuWin32.Make`)

## Quick Start
```bash
make install    # install all dependencies
make migrate    # initialise the SQLite database
make dev        # start backend on :8000 + frontend on :5173
```

## Backend Manual Setup
[virtualenv instructions, env vars, running standalone]

## Frontend Manual Setup
[npm install, npm run dev, npm run build]

## Project Structure
[annotated directory tree]

## API Reference
GET /health → 200 {"status":"ok","timestamp":"..."}

## Contributing
[branch naming, PR process]
```

---

## ⚠️ Risks / Edge Cases

| Risk | Mitigation |
|------|-----------|
| Port 8000 or 5173 already in use | Document `BACKEND_PORT`/`VITE_PORT` env var overrides in README; add `kill $(lsof -ti:8000)` cleanup command |
| Python version mismatch (`< 3.10`) | Document prerequisite prominently in README; `declarative_base` import changed in SQLAlchemy 2.0 — pin versions |
| SQLite file permission errors | Store `hireiq.db` inside `backend/` (not repo root); add to `.gitignore` |
| CORS errors during development | Explicitly whitelist `http://localhost:5173` in `CORSMiddleware`; avoid wildcard `*` |
| `make` unavailable on Windows | Document Git Bash alternative + manual command equivalents for each target |
| Vite proxy `/api` prefix mismatch | Explicit `rewrite` rule in `vite.config.ts` strips `/api` before forwarding to FastAPI |
| `init_db.py` run before models registered | Import `app.main` at top of `init_db.py` to trigger all model registrations before `create_all` |
| `uvicorn` background process leak on `Ctrl+C` | Document `kill $(lsof -ti:8000)` cleanup; acceptable trade-off for M1 simplicity |
| `create_all` vs Alembic migrations | `Base.metadata.create_all` is correct and sufficient for M1; migrate to Alembic at first breaking schema change in M2+ |
| `check_same_thread=False` SQLite flag | Required by FastAPI's async threading model; well-documented SQLAlchemy pattern, not a security concern |
| Missing `__init__.py` in `routers/` | Include `routers/__init__.py` to ensure Python treats it as a package; avoids `ModuleNotFoundError` |

---

## 📌 Assumptions

1. **Python ≥ 3.10** and **Node.js ≥ 18** are available in all developer environments.
2. No domain models (candidates, jobs, interviews) are needed at M1 — infrastructure skeleton only. The first domain model comes in M2+.
3. **TypeScript** is used for the React frontend (Vite `react-ts` template) — better DX and type safety from day one.
4. **SQLite** is the sole database for all M1 environments; a migration to PostgreSQL is a future milestone concern.
5. No authentication, CI/CD pipeline, or deployment configuration is in scope for M1.
6. The `/health` endpoint is a **public liveness probe** — no authentication required.
7. `hireiq.db` is git-ignored; `init_db.py` is the sole source of truth for schema initialisation.
8. CORS is configured permissively for `localhost` origins only in development; production hardening (specific domain allow-list) is deferred.
9. `make dev` uses a simple background `&` pattern rather than `concurrently` to avoid adding an extra Node dependency at M1.
10. No virtualenv management tool (venv, pyenv, conda) is prescribed — developers use their preferred Python environment manager.
11. The `ruff` linter is chosen for backend over `flake8`/`pylint` for its speed and zero-config defaults; it can be added to `requirements.txt` as a dev dependency.

---

*Spec produced autonomously by the Super Skills brainstorming agent (`superpowers:brainstorming`) — no user interaction required for this analysis.*
