# Implementation Plan: M1 — Monorepo Foundation Scaffold

> **Version:** 1.0 — Draft
> **Date:** 2026-05-14
> **Owner:** jouneyman-user
> **Issue:** [#1 — Project setup — FastAPI backend, SQLite DB, and React frontend scaffold](https://github.com/jouneyman-user/HireIQ/issues/1)
> **Spec:** `docs/superpowers/specs/2026-05-13-monorepo-foundation-scaffold-design.md`
> **Status:** 🟡 Draft

---

## 1. Executive Summary

This plan delivers the HireIQ **Milestone 1 — Foundation** scaffold: a minimal, friction-free monorepo wiring a **FastAPI backend** (Python ≥ 3.10), a **SQLite database** (auto-initialised on first run via `migrations/init_db.py`), and a **React + TypeScript frontend** (Vite) together under a single root `Makefile`. The primary success outcome is that any developer can execute `make install && make migrate && make dev` and immediately reach a live `GET /health → HTTP 200` endpoint proxied cleanly through the Vite dev server — with zero CORS configuration required in the browser. Effort is rated **Small**; the target delivery window is **2–3 developer-days**. The sole critical constraint is that Python ≥ 3.10 and Node.js ≥ 18 must be available in the developer environment — no container runtime or workspace tooling is required.

---

## 2. Goals & Non-Goals

### Goals
- [ ] `GET /health` on `http://localhost:8000` returns HTTP 200 with `{"status": "ok", "timestamp": <ISO-8601>}`
- [ ] SQLite database (`backend/hireiq.db`) initialises automatically via `migrations/init_db.py` on first run — idempotent, safe to re-run
- [ ] React app (`http://localhost:5173`) proxies all `/api/*` calls to FastAPI — no CORS configuration required in the browser
- [ ] `README.md` documents prerequisites, quick-start, manual setup (backend + frontend), project structure, API reference, and contributing notes
- [ ] Root `Makefile` exposes `install`, `dev`, `migrate`, `lint`, and `help` targets
- [ ] `.gitignore` excludes `hireiq.db`, `__pycache__`, `node_modules`, `dist`, and `.env`

### Non-Goals (explicitly out of scope)
- No authentication, authorisation, or session management
- No CI/CD pipeline or deployment configuration
- No Docker / container runtime
- No domain models (candidates, jobs, etc.) — infrastructure skeleton only
- No migration to PostgreSQL (SQLite only for M1)
- No production CORS hardening (localhost-only allow-list sufficient for M1)
- No Alembic — raw `Base.metadata.create_all` is used; Alembic deferred to first schema-change milestone
- No Poetry or PNPM workspaces — plain `pip` + `npm` for zero prerequisite overhead

---

## 3. Assumptions & Constraints

| # | Assumption / Constraint | Impact if Wrong |
|---|------------------------|----------------|
| 1 | Python ≥ 3.10 available in all developer environments | Backend install fails; blocks Phase 2 |
| 2 | Node.js ≥ 18 available in all developer environments | Frontend scaffold fails; blocks Phase 3 |
| 3 | `make` is available (Git Bash on Windows as fallback) | Makefile targets unusable; manual commands documented as fallback |
| 4 | Ports 8000 and 5173 are free on the developer machine | Dev server startup fails; env-var overrides documented in README |
| 5 | No breaking changes to monorepo layout introduced mid-milestone | Downstream feature branches avoid merge conflicts |
| 6 | `hireiq.db` is git-ignored; `init_db.py` is sole schema source of truth | Database state not accidentally committed |
| 7 | Single developer owns all roles for M1 | No handoff delays; all decisions made by jouneyman-user |

---

## 4. Stakeholders & Roles

| Role | Name / Team | Responsibility |
|------|------------|---------------|
| Project Owner | jouneyman-user | Final decisions, acceptance sign-off |
| Tech Lead | jouneyman-user | Architecture, code review, merge to `main` |
| Engineering | jouneyman-user | Build, test, wire all components |
| QA | jouneyman-user | Smoke-test all four acceptance criteria before close |

> ℹ️ *Single-developer project — all roles held by the same person for M1.*

---

## 5. High-Level Timeline

```
Phase 1: Repo Structure & Tooling      ██░░░░░░  Day 1 (morning)     ~2–3 h
Phase 2: Backend Implementation        ░░████░░  Day 1–2             ~4–6 h
Phase 3: Frontend Implementation       ░░░░██░░  Day 2 (afternoon)   ~3–4 h
Phase 4: Integration, Docs & Close     ░░░░░░██  Day 3               ~2–3 h
```

**Total estimated effort:** 2–3 developer-days

---

## 6. Phases & Tasks

### Phase 1 — Repo Structure & Tooling
**Goal:** Establish the canonical directory layout, root tooling files, and a clean `main` branch starting point.
**Duration:** ~2–3 hours
**Owner:** jouneyman-user

#### Tasks
- [ ] Create `backend/` directory with `app/`, `app/routers/`, `migrations/` sub-directories and `__init__.py` stubs
- [ ] Create `frontend/` placeholder directory (populated in Phase 3 via Vite scaffold)
- [ ] Add `.gitignore` (Python artifacts, SQLite DB, Node modules, Vite dist, `.env`)
- [ ] Add root `Makefile` with `install`, `dev`, `migrate`, `lint`, and `help` targets (using `&` background pattern for `dev`)
- [ ] Add `backend/.env.example` with `DATABASE_URL=sqlite:///./hireiq.db`
- [ ] Add stub `README.md` (full content completed in Phase 4)
- [ ] Commit baseline structure to `main` (message: `chore: bootstrap monorepo directory scaffold`)

**Deliverables:**
- Committed directory skeleton on `main`
- `.gitignore` and `Makefile` in place and committed

---

### Phase 2 — Backend Implementation
**Goal:** Deliver a runnable FastAPI service with SQLite auto-init and the `/health` endpoint.
**Duration:** ~4–6 hours
**Owner:** jouneyman-user

#### Tasks — Application Code
- [ ] Write `backend/app/database.py` — SQLAlchemy engine (`sqlite:///./hireiq.db`), `SessionLocal`, `Base`; reads `DATABASE_URL` from env via `python-dotenv` fallback
- [ ] Write `backend/app/routers/health.py` — `GET /health` returning `{"status": "ok", "timestamp": <UTC ISO-8601>}` with `status_code=200`
- [ ] Write `backend/app/main.py` — FastAPI app factory with `CORSMiddleware` allowing `http://localhost:5173`; includes `health.router`
- [ ] Write `backend/migrations/init_db.py` — idempotent `Base.metadata.create_all(engine)`; imports `app.main` to register all models before `create_all`
- [ ] Write `backend/requirements.txt` — pin `fastapi>=0.111.0`, `uvicorn[standard]>=0.29.0`, `sqlalchemy>=2.0.0`, `python-dotenv>=1.0.0`, `ruff>=0.4.0`

#### File Reference — `backend/app/main.py`
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

#### File Reference — `backend/app/routers/health.py`
```python
from fastapi import APIRouter
from datetime import datetime, timezone

router = APIRouter()

@router.get("/health", status_code=200)
def health_check():
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}
```

#### File Reference — `backend/migrations/init_db.py`
```python
from app.database import Base, engine
import app.main  # noqa: F401 — triggers model imports so Base knows about all tables

if __name__ == "__main__":
    Base.metadata.create_all(bind=engine)
    print("Database initialised.")
```

#### Tasks — Verification
- [ ] `pip install -r backend/requirements.txt` in a clean virtual environment — confirm no errors
- [ ] `python -m migrations.init_db` from `backend/` — confirm `"Database initialised."` output and `hireiq.db` created
- [ ] `uvicorn app.main:app --reload --port 8000` from `backend/` — confirm server starts
- [ ] `curl http://localhost:8000/health` — confirm `{"status":"ok","timestamp":"..."}` with HTTP 200
- [ ] Re-run `python -m migrations.init_db` — confirm idempotency (no error, no data loss)

**Deliverables:**
- `GET /health` returning HTTP 200 on `localhost:8000`
- `hireiq.db` auto-created on `make migrate`
- All backend files committed

---

### Phase 3 — Frontend Implementation
**Goal:** Deliver a Vite + React + TypeScript app that proxies `/api/*` to FastAPI and displays live API status.
**Duration:** ~3–4 hours
**Owner:** jouneyman-user

#### Tasks — Scaffold & Config
- [ ] Bootstrap Vite project: `npm create vite@latest frontend -- --template react-ts` (run from repo root)
- [ ] Replace generated `vite.config.ts` with proxy config: `'/api'` → `http://localhost:8000`, `changeOrigin: true`, `rewrite: path.replace(/^\/api/, '')`
- [ ] Update `src/App.tsx` with minimal scaffold component: `useEffect` fetching `/api/health`, renders `API status: <strong>{status}</strong>`
- [ ] Verify `package.json` has `dev`, `build`, and `lint` scripts (Vite template provides by default)
- [ ] Remove unnecessary boilerplate files not needed for M1

#### File Reference — `frontend/vite.config.ts`
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

#### File Reference — `frontend/src/App.tsx`
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
    <div>
      <h1>HireIQ</h1>
      <p>API status: <strong>{status}</strong></p>
    </div>
  )
}

export default App
```

#### Tasks — Verification
- [ ] `npm install` from `frontend/` — confirm clean install with no audit errors blocking startup
- [ ] `npm run dev` from `frontend/` — confirm Vite starts on `http://localhost:5173`
- [ ] With backend running, open `http://localhost:5173` — confirm `API status: ok` displayed
- [ ] Check browser Network tab — confirm `/api/health` proxied to `http://localhost:8000/health` with no CORS errors

**Deliverables:**
- React app live at `localhost:5173` displaying live API status
- Vite proxy confirmed working end-to-end
- All frontend files committed

---

### Phase 4 — Integration, Documentation & Close
**Goal:** Validate the full `make`-driven workflow end-to-end, complete README, and close Issue #1.
**Duration:** ~2–3 hours
**Owner:** jouneyman-user

#### Tasks — Integration Smoke Test
- [ ] In a **fresh terminal with no running services**, run `make install` — confirm both backend pip install and frontend npm install complete without errors
- [ ] Run `make migrate` — confirm `hireiq.db` created (or exists idempotently on re-run)
- [ ] Run `make dev` — confirm uvicorn (background) and Vite (foreground) both start; `curl localhost:8000/health` returns 200; browser at `localhost:5173` shows `ok`
- [ ] Run `make lint` — confirm ruff and eslint pass with zero errors
- [ ] Run `make help` — confirm target descriptions printed correctly

#### Tasks — Documentation
- [ ] Complete `README.md` with all eight sections:
  1. Project overview (one-line description of HireIQ)
  2. Prerequisites (Python ≥ 3.10, Node.js ≥ 18, `make`)
  3. Quick start (`make install && make migrate && make dev`)
  4. Backend manual setup (venv creation, env vars, running server)
  5. Frontend manual setup (`npm install`, `npm run dev`, build for production)
  6. Project structure (annotated directory tree)
  7. API reference (`GET /health` endpoint)
  8. Contributing (branch naming, PR process)
- [ ] Add Windows note: `make` via Git Bash or `winget install GnuWin32.Make`; document manual command equivalents
- [ ] Document port-conflict workarounds (`kill $(lsof -ti:8000)`) in README

#### Tasks — Acceptance Verification & Close
- [ ] Verify all four acceptance criteria from Issue #1 are met:
  - [ ] `GET /health` → HTTP 200 ✅
  - [ ] SQLite initialises automatically on first run ✅
  - [ ] React proxies `/api/*` to FastAPI with no CORS errors ✅
  - [ ] README documents setup steps for both backend and frontend ✅
- [ ] Final commit: `docs: complete README and finalize M1 scaffold`
- [ ] Push `main` to remote
- [ ] Close Issue #1 with summary comment linking to relevant commits

**Deliverables:**
- All four acceptance criteria verified green
- Complete `README.md` committed
- Issue #1 closed
- `main` branch pushed to remote

---

## 7. Dependencies

| Dependency | Type | Owner | Notes | Risk if Late |
|-----------|------|-------|-------|-------------|
| Python ≥ 3.10 | Environment | Developer | Pre-existing local install | Blocks Phase 2 entirely |
| Node.js ≥ 18 | Environment | Developer | Pre-existing local install | Blocks Phase 3 entirely |
| `make` (or Git Bash on Windows) | Environment | Developer | Universal on macOS/Linux | Makefile targets unusable; fallback commands documented |
| `ruff` (lint) | Python package | Phase 2 | Added to `requirements.txt` | `make lint` fails for backend |
| FastAPI / Uvicorn / SQLAlchemy | Python packages | Phase 2 | Pinned in `requirements.txt` | Backend won't start |
| Vite + React + TypeScript | npm packages | Phase 3 | Installed via `npm create vite` | Frontend scaffold fails |

---

## 8. Risk Register

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|-----------|--------|-----------|
| R1 | Port 8000 or 5173 already in use on developer machine | Low | Medium | Document env-var overrides; `lsof -ti:8000` kill command in README |
| R2 | Python version < 3.10 on developer machine | Low | High | Document prerequisite prominently in README |
| R3 | SQLite file permission errors (read-only filesystem) | Low | Medium | Store `hireiq.db` inside `backend/`; ensure `.gitignore` excludes it |
| R4 | Vite proxy rewrite strips `/api` unexpectedly | Low | High | Explicit `rewrite` rule in `vite.config.ts`; verify with Network tab in Phase 3 |
| R5 | `make dev` uvicorn background process leaks after `Ctrl+C` | Medium | Low | Document `kill $(lsof -ti:8000)` in README; acceptable for M1 |
| R6 | `init_db.py` run before all models are imported | Low | Medium | Import `app.main` in `init_db.py` to trigger model registrations before `create_all` |
| R7 | `npm create vite` generates boilerplate that breaks lint | Low | Low | Clean up unused generated files; update eslint config if needed |
| R8 | Scope creep toward Docker or workspace tooling in M1 | Low | Medium | Explicitly document Options 2 & 3 as deferred to future milestones |

---

## 9. KPIs & Success Metrics

| Metric | Target | Measurement Method |
|--------|--------|--------------------|
| All acceptance criteria met | 4 / 4 | Manual smoke test in Phase 4 |
| `make install` completes clean | 0 errors | Terminal output |
| `make migrate` idempotency | 0 errors on re-run | Terminal output |
| `GET /health` response | HTTP 200, `{"status":"ok"}` | `curl` or browser DevTools |
| Vite proxy (no CORS errors) | 0 console errors | Browser DevTools — Network tab |
| `make lint` passes | 0 ruff errors, 0 eslint errors | Terminal output |
| Delivery within effort budget | ≤ 3 developer-days | Wall-clock time |

---

## 10. Communication Plan

> ℹ️ *Single-developer project — no formal comms cadence required.*

| Event | Action |
|-------|--------|
| Phase complete | Commit with descriptive message; push to `main` |
| Blocker encountered | Note in Issue #1 comment |
| All criteria met | Close Issue #1 with summary comment |

---

## 11. Definition of Done

A task is "done" when ALL of the following are true:
- [ ] Code written and manually verified to work as described
- [ ] Changes committed to `main` with a descriptive commit message
- [ ] No uncommitted changes remain for that task
- [ ] Relevant documentation (README / inline comments) updated

The milestone is "done" when ALL four acceptance criteria from Issue #1 are verified green in Phase 4.

---

## 12. Open Questions

| # | Question | Owner | Due Date |
|---|----------|-------|----------|
| 1 | Should `ruff` be in `requirements.txt` (dev dep) or a separate `requirements-dev.txt`? | jouneyman-user | Before Phase 2 lint task |
| 2 | Should `make dev` use `concurrently` (npm) for cleaner UX, or keep `&` background pattern for M1? | jouneyman-user | Before Phase 1 Makefile task |
| 3 | Should a virtual environment (`python -m venv .venv`) be prescribed in README, or left to developer preference? | jouneyman-user | Before Phase 4 documentation |

---

## 13. Appendix

### A. Glossary

| Term | Definition |
|------|-----------|
| Monorepo | Single Git repository containing both `backend/` and `frontend/` sub-projects |
| Scaffold | Minimal, runnable skeleton providing the structural foundation for feature development |
| Makefile | GNU Make configuration file providing developer-friendly command aliases |
| CORS | Cross-Origin Resource Sharing — browser security mechanism; bypassed via Vite dev-proxy |
| Vite Proxy | Dev-server reverse proxy that forwards `/api/*` requests to `localhost:8000`, eliminating CORS in development |
| `create_all` | SQLAlchemy method that creates all registered model tables idempotently |
| ISO-8601 | International timestamp format (`YYYY-MM-DDTHH:MM:SS+00:00`) returned by the `/health` endpoint |
| M1 | Milestone 1 — Foundation (this milestone) |

### B. Architecture Decision: Option 1 — Minimal Flat Monorepo + Makefile

Three options were evaluated during the spec phase:

| Option | Approach | Decision |
|--------|----------|----------|
| **1 (Chosen)** | Flat `backend/` + `frontend/` + `Makefile` | Zero extra tooling prerequisites; aligns with "S" effort rating |
| 2 | Docker Compose dev environment | Deferred — adds Docker prerequisite, SQLite volume edge cases |
| 3 | Poetry + PNPM Workspaces + `concurrently` | Deferred — premature for a single backend + single frontend at M1 |

Full rationale: see spec `docs/superpowers/specs/2026-05-13-monorepo-foundation-scaffold-design.md` §Options Considered.

### C. Repository Target Structure

```
HireIQ/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py              # FastAPI app factory + CORS config
│   │   ├── database.py          # SQLAlchemy engine + session factory
│   │   └── routers/
│   │       └── health.py        # GET /health → {"status": "ok", "timestamp": <ISO-8601>}
│   ├── migrations/
│   │   └── init_db.py           # Idempotent Base.metadata.create_all(engine)
│   ├── requirements.txt         # fastapi, uvicorn[standard], sqlalchemy, ruff
│   └── .env.example             # DATABASE_URL=sqlite:///./hireiq.db
├── frontend/
│   ├── src/
│   │   ├── main.tsx
│   │   └── App.tsx              # Minimal component that fetches /api/health
│   ├── vite.config.ts           # proxy: { '/api': 'http://localhost:8000' }
│   ├── package.json
│   ├── tsconfig.json
│   └── index.html
├── Makefile                     # install | dev | migrate | lint | help targets
├── .gitignore                   # backend/hireiq.db, __pycache__, node_modules, dist
└── README.md                    # Full setup documentation
```

### D. Makefile Reference

```makefile
.PHONY: install dev migrate lint help

help:           ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

install:        ## Install all dependencies (backend + frontend)
	cd backend && pip install -r requirements.txt
	cd frontend && npm install

migrate:        ## Initialise / migrate the SQLite database
	cd backend && python -m migrations.init_db

dev:            ## Start backend and frontend concurrently
	cd backend && uvicorn app.main:app --reload --port 8000 &
	cd frontend && npm run dev

lint:           ## Lint backend (ruff) and frontend (eslint)
	cd backend && ruff check .
	cd frontend && npm run lint
```

### E. Reference Links

| Resource | Link |
|----------|------|
| Spec / Design | `docs/superpowers/specs/2026-05-13-monorepo-foundation-scaffold-design.md` |
| GitHub Issue | https://github.com/jouneyman-user/HireIQ/issues/1 |
| Repository | https://github.com/jouneyman-user/HireIQ |
| FastAPI Docs | https://fastapi.tiangolo.com |
| Vite Proxy Config | https://vitejs.dev/config/server-options.html#server-proxy |
| SQLAlchemy `create_all` | https://docs.sqlalchemy.org/en/20/core/metadata.html#sqlalchemy.schema.MetaData.create_all |

### F. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-05-14 | jouneyman-user | Initial draft — generated from spec `2026-05-13-monorepo-foundation-scaffold-design.md` |
