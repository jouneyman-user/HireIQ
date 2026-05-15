# HireIQ Documentation Generation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the `generate-docs.md` spec against HireIQ — fix stale content in two existing docs, create the missing `CHANGELOG.md`, and write the codebase analysis memory file.

**Architecture:** All 8 documentation files from the spec already exist at the repo root (created during M1 foundation work). This plan handles the pre-flight check, extends 2 partial documents with stale M1-era content, and creates 2 missing files (`CHANGELOG.md`, memory file). No files are generated from scratch.

**Tech Stack:** FastAPI 0.111+, SQLAlchemy 2.x, SQLite, React 19 (not 18), TypeScript ~6.0.2, Vite 8.x, pytest 8+, Vitest 3.x, MSW 2.x, GNU Make

---

## Pre-flight Check Results

Scanned: repo root, `docs/`, `.github/`, `.claude/`

| File | Status | Finding |
|------|--------|---------|
| `CONSTITUTION.md` | ⏭️ Exists — skip | Complete. 8 principles with file-level evidence. Accurate. |
| `ARCHITECTURE.md` | ⚠️ Partial — extend | React version wrong: says "18", package.json has `^19.2.6` |
| `CODE_REVIEW.md` | ⏭️ Exists — skip | Complete. Author/reviewer/AI checklists, red flags, merge criteria. |
| `UNIT_TESTING.md` | ⚠️ Partial — extend | Line 349: stale note "Makefile test targets are M1 implementation" — they now exist |
| `DEPLOYMENT.md` | ⏭️ Exists — skip | Complete. Runbook, env vars, rollback procedure. |
| `SECURITY.md` | ⏭️ Exists — skip | Complete. Threat model, AI-specific risks, GDPR/CCPA. |
| `VERSION_MANAGEMENT.md` | ⏭️ Exists — skip | Complete. References `CHANGELOG.md` (to be created in Task 4). |
| `AGENTS.md` | ⚠️ Partial — extend | Line 13: "no source code yet" is wrong — M1 source is fully implemented. Also says "React 18". |
| `CHANGELOG.md` | 🔨 Missing — create | Referenced by `VERSION_MANAGEMENT.md`; not yet created. |
| `docs/superpowers/memory/codebase-analysis.md` | 🔨 Missing — create | Required by generate-docs.md spec (placed in `docs/superpowers/memory/` since `.claude/` is not yet configured). |

**Generation order:** Memory file → ARCHITECTURE.md → UNIT_TESTING.md → AGENTS.md → CHANGELOG.md → verification

---

## File Structure

```
docs/superpowers/memory/
  codebase-analysis.md     NEW — single source of truth for all doc generation

ARCHITECTURE.md            MODIFY — fix React version (18 → 19, TypeScript ≥5.x → ~6.0.2)
UNIT_TESTING.md            MODIFY — remove stale Makefile note (line 349)
AGENTS.md                  MODIFY — fix M1 status ("no source code") + React version
CHANGELOG.md               NEW — M1 release history from git log + [Unreleased] section
README.md                  MODIFY — fix "React 18" → "React 19" in tagline; M1 milestone "🔨 In progress" → "✅ Complete"
```

---

## Task 1: Write Memory File

**Files:**
- Create: `docs/superpowers/memory/codebase-analysis.md`

- [ ] **Step 1: Create the memory directory**

```bash
mkdir -p docs/superpowers/memory
```

Expected: no output, directory created.

- [ ] **Step 2: Write `docs/superpowers/memory/codebase-analysis.md`**

Create the file with this exact content:

```markdown
# HireIQ Codebase Analysis

> Single source of truth for documentation generation. Last updated: 2026-05-14.
> Reference this before writing any documentation to prevent cross-file drift.

---

## Confirmed Tech Stack

### Backend (Python)

| Package | Version (requirements.txt) | Notes |
|---------|---------------------------|-------|
| fastapi | >=0.111.0 | ASGI REST framework |
| uvicorn[standard] | >=0.29.0 | ASGI server, `--reload` in dev |
| sqlalchemy | >=2.0.0 | Declarative Base; `create_all` at M1 |
| python-dotenv | >=1.0.0 | Loads `backend/.env` |
| ruff | >=0.4.0 | Linter (backend CI gate) |
| pytest | >=8.0.0 | Test runner |
| pytest-asyncio | >=0.23.0 | Async test support |
| httpx | >=0.27.0 | HTTP client for TestClient |
| SQLite | built-in | File at `backend/hireiq.db` |
| Python | >=3.10 | Pattern matching, `X \| Y` union types |

### Frontend (Node)

| Package | Version (package.json) | Notes |
|---------|------------------------|-------|
| react | ^19.2.6 | ⚠️ React 19, NOT 18 — several docs had this wrong |
| react-dom | ^19.2.6 | |
| typescript | ~6.0.2 | Strict mode; `tsconfig.app.json` |
| vite | ^8.0.12 | Dev server + proxy; `npm run build` → `frontend/dist/` |
| vitest | ^3.2.3 | Test runner (Vite-native) |
| @testing-library/react | ^16.3.0 | Component testing utilities |
| @testing-library/user-event | ^14.6.1 | Simulates real user input |
| msw | ^2.7.5 | Mock Service Worker — API mocking at network layer |
| @vitest/coverage-v8 | ^3.2.3 | Coverage reporting |
| jsdom | ^26.1.0 | Browser environment simulation for tests |
| eslint | ^10.3.0 | Frontend linter |

### Tooling

| Tool | Version | Purpose |
|------|---------|---------|
| GNU Make | any | Orchestrates install / dev / migrate / lint / test |

---

## Module Boundary Map

```
HireIQ/
├── backend/                 ← Python package boundary (pip install, uvicorn)
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py          ← App factory: FastAPI() + CORSMiddleware + include_router()
│   │   ├── database.py      ← engine, SessionLocal, Base (load_dotenv override=True)
│   │   └── routers/
│   │       ├── __init__.py
│   │       └── health.py    ← GET /health → {status, timestamp}
│   ├── migrations/
│   │   └── init_db.py       ← Base.metadata.create_all(engine) — idempotent
│   ├── tests/
│   │   ├── __init__.py
│   │   └── test_health.py   ← TestClient, 3 tests: 200, status, ISO-8601 timestamp
│   ├── requirements.txt
│   └── .env.example         ← DATABASE_URL=sqlite:///./hireiq.db
│
├── frontend/                ← Node package boundary (npm install, vite)
│   ├── src/
│   │   ├── main.tsx         ← React DOM entry: renders <App />
│   │   ├── App.tsx          ← Root: fetch('/api/health') on mount, shows status
│   │   └── __tests__/
│   │       ├── setup.ts     ← @testing-library/jest-dom import
│   │       └── App.test.tsx ← MSW server, 4 tests: heading, loading, ok, unreachable
│   ├── vite.config.ts       ← proxy: /api/* → localhost:8000 (strips /api prefix)
│   └── package.json
│
├── Makefile                 ← install | migrate | dev | lint | test | test-backend | test-frontend
├── .gitignore               ← excludes hireiq.db, __pycache__, node_modules, .env
└── [8 doc files at root]    ← CONSTITUTION ARCHITECTURE CODE_REVIEW UNIT_TESTING DEPLOYMENT SECURITY VERSION_MANAGEMENT AGENTS
```

---

## Key Patterns Discovered

1. **App factory** — `app/main.py` creates `FastAPI(title="HireIQ API", version="0.1.0")`, registers `CORSMiddleware` with `allow_origins=["http://localhost:5173"]`, then calls `app.include_router(health.router)`. New domains: add router file + one `include_router` call.

2. **Router-per-domain** — `app/routers/health.py` exports a single `router = APIRouter()`. Routes are `@router.get("/health")` — NOT `@router.get("/api/health")` (Vite proxy strips the `/api` prefix).

3. **Idempotent migration** — `migrations/init_db.py` imports `app.main` (to register all models with `Base`) then calls `Base.metadata.create_all(bind=engine)`. Must import models BEFORE `create_all` or tables won't exist.

4. **DB threading** — `engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})`. Required because FastAPI's async context uses multiple threads.

5. **env loading** — `load_dotenv(override=True)` in `database.py`. The `override=True` flag ensures project `.env` wins over any system-level `DATABASE_URL`.

6. **MSW for frontend tests** — `msw/node` + `setupServer()` intercepts `fetch` at the network layer. `beforeAll(server.listen)` / `afterEach(server.resetHandlers)` / `afterAll(server.close)` lifecycle.

7. **TestClient pattern** — Backend tests use `client = TestClient(app)` at module level (no `conftest.py` at M1; DB tests will need `dependency_overrides` pattern from UNIT_TESTING.md).

8. **Vite proxy rewrite** — `vite.config.ts` rewrites `/api/` → `''`. Frontend calls `/api/health`; FastAPI sees `/health`.

---

## Non-Obvious Gotchas

1. **Port leak on `Ctrl+C`** — `make dev` starts uvicorn with `&` (background), then Vite in foreground. `Ctrl+C` stops Vite but NOT uvicorn. Next `make dev` fails with EADDRINUSE. Fix: `kill $(lsof -ti:8000)`.

2. **Double `/api` trap** — Writing `@router.get("/api/health")` in FastAPI results in the effective URL `/api/api/health` because Vite proxy already adds `/api`. Route must be `@router.get("/health")`.

3. **`init_db.py` import order** — `Base.metadata.create_all()` only creates tables for models registered with `Base`. If a new model is defined but not imported before `create_all`, its table won't be created. Always import `app.main` (or each model module) before calling `create_all`.

4. **`hireiq.db` relative path** — `sqlite:///./hireiq.db` resolves relative to cwd. Uvicorn must run from `backend/`. Running from repo root puts `hireiq.db` in the wrong place (and may not be gitignored at that path).

5. **TypeScript errors in dev vs build** — Vite dev server (`npm run dev`) tolerates TS errors. Production build (`npm run build`) uses `tsc -b` which fails on them. Always run `npx tsc --noEmit` before opening a PR.

6. **React 19, not 18** — `package.json` has `"react": "^19.2.6"`. Several docs were written referencing "React 18". This was corrected in AGENTS.md, ARCHITECTURE.md, and README.md.

---

## Current Codebase Status

- **M1: COMPLETE** — source code implemented, tests written and passing
- **Active branch:** `jouneyman-user/hireiq#2/resume-upload-pdf-text_1778764729` (M2 feature: resume upload with PDF text extraction)
- **No `.claude/` directory** configured yet (memory file placed in `docs/superpowers/memory/` as alternative)
- **No CI/CD pipeline** (GitHub Actions planned for M2)
- **No `CHANGELOG.md`** (created by this plan)
- **Version:** `0.1.0` (from `app = FastAPI(..., version="0.1.0")` in `app/main.py`)
```

- [ ] **Step 3: Verify the file was created**

```bash
ls docs/superpowers/memory/codebase-analysis.md
```

Expected output:
```
docs/superpowers/memory/codebase-analysis.md
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/memory/codebase-analysis.md
git commit -m "docs: add codebase analysis memory file for documentation generation"
```

Expected: commit created with message `docs: add codebase analysis memory file for documentation generation`

---

## Task 2: Extend ARCHITECTURE.md — Fix React Version

**Files:**
- Modify: `ARCHITECTURE.md` (line 29)

`package.json` has `"react": "^19.2.6"` and `"typescript": "~6.0.2"`. The tech stack table says "React 18" and "TypeScript ≥ 5.x".

- [ ] **Step 1: Fix React version in the tech stack table**

Find in `ARCHITECTURE.md`:
```
| Frontend framework | React | 18 | Bootstrapped via Vite |
| Language | TypeScript | ≥ 5.x | `react-ts` Vite template |
```

Replace with:
```
| Frontend framework | React | 19 | Bootstrapped via Vite (`react` ^19.2.6) |
| Language | TypeScript | ~6.0.2 | `react-ts` Vite template |
```

- [ ] **Step 2: Run a quick sanity-check that no other "React 18" mentions remain**

```bash
grep -n "React 18\|react.*18\|18.*react" ARCHITECTURE.md
```

Expected: no output (all instances corrected).

- [ ] **Step 3: Commit**

```bash
git add ARCHITECTURE.md
git commit -m "docs(architecture): correct React version from 18 to 19 in tech stack table"
```

---

## Task 3: Extend UNIT_TESTING.md — Remove Stale Note

**Files:**
- Modify: `UNIT_TESTING.md`

Line 349 (inside the "Via Makefile" section) reads:

```
> Note: Makefile `test` targets are part of the M1 implementation. Add them to the Makefile when setting up the scaffold.
```

This note is stale. The Makefile now has `test`, `test-backend`, and `test-frontend` targets. M1 is complete.

- [ ] **Step 1: Remove the stale note**

Find this exact text in `UNIT_TESTING.md`:
```
> Note: Makefile `test` targets are part of the M1 implementation. Add them to the Makefile when setting up the scaffold.
```

Replace with: *(nothing — delete the line entirely)*

- [ ] **Step 2: Verify the note is gone**

```bash
grep -n "part of the M1 implementation" UNIT_TESTING.md
```

Expected: no output.

- [ ] **Step 3: Verify the Makefile commands section still looks correct**

The remaining "Via Makefile" section should read exactly:

```markdown
### Via Makefile

```bash
# Run backend tests
make test-backend

# Run frontend tests
make test-frontend

# Run all tests
make test
```
```

Cross-check against `Makefile` targets:
- `make test-backend` → `cd backend && pytest` ✅
- `make test-frontend` → `cd frontend && npm test` ✅
- `make test` → runs both ✅

- [ ] **Step 4: Commit**

```bash
git add UNIT_TESTING.md
git commit -m "docs(testing): remove stale note about Makefile test targets (M1 complete)"
```

---

## Task 4: Extend AGENTS.md — Fix Stale Status and React Version

**Files:**
- Modify: `AGENTS.md` (lines 13, 8, and footer)

Three issues:
1. Line 13: says `"no source code yet"` — M1 source code is fully implemented
2. Line 8: says `"React 18"` — should be React 19
3. Footer: last updated date and description is stale

- [ ] **Step 1: Fix the Status bullet (line 13)**

Find:
```
- **Status:** Milestone 1 — foundation scaffold (no source code yet; spec is at `docs/superpowers/specs/`)
```

Replace with:
```
- **Status:** Milestone 1 — **complete** (source code implemented and tested; M2 starting on branch `hireiq#2` — resume upload)
```

- [ ] **Step 2: Fix the Stack bullet (line 8)**

Find:
```
- **Stack:** FastAPI (Python 3.10+) + SQLAlchemy + SQLite · React 18 + TypeScript · Vite · GNU Make
```

Replace with:
```
- **Stack:** FastAPI (Python 3.10+) + SQLAlchemy + SQLite · React 19 + TypeScript 6.x · Vite 8.x · GNU Make
```

- [ ] **Step 3: Update the footer**

Find:
```
*Last updated: 2026-05-13 — M1 foundation scaffold. Generated by autonomous documentation agent using Super Skills.*
```

Replace with:
```
*Last updated: 2026-05-14 — M1 complete. Updated to reflect implemented source code and correct React 19 version.*
```

- [ ] **Step 4: Verify all three changes landed**

```bash
grep -n "no source code\|React 18\|2026-05-13" AGENTS.md
```

Expected: no output (all three stale strings gone).

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md
git commit -m "docs(agents): fix stale M1 status and correct React version from 18 to 19"
```

---

## Task 5: Fix README.md — React Version and M1 Milestone Status

**Files:**
- Modify: `README.md` (line 4 and line 285)

Two issues:
1. Line 4 tagline says "React 18" — should be React 19 (only line with a version number)
2. Line 285 Milestone Status table shows M1 as "🔨 In progress" — M1 is complete

- [ ] **Step 1: Fix the tagline on line 4**

Find:
```
> FastAPI · SQLite · React 18 · TypeScript · Vite · GNU Make
```

Replace with:
```
> FastAPI · SQLite · React 19 · TypeScript · Vite · GNU Make
```

- [ ] **Step 2: Fix the M1 milestone status on line 285**

Find:
```
| **M1** | Foundation scaffold — FastAPI + SQLite + React monorepo | 🔨 In progress |
```

Replace with:
```
| **M1** | Foundation scaffold — FastAPI + SQLite + React monorepo | ✅ Complete |
```

- [ ] **Step 3: Verify no other "React 18" mentions remain in README.md**

```bash
grep -n "React 18" README.md
```

Expected: no output.

- [ ] **Step 4: Verify the M1 milestone shows Complete**

```bash
grep "M1" README.md | grep -E "Complete|progress"
```

Expected: `| **M1** | Foundation scaffold — FastAPI + SQLite + React monorepo | ✅ Complete |`

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs(readme): correct React version to 19 and mark M1 milestone complete"
```

---

## Task 6: Create CHANGELOG.md

**Files:**
- Create: `CHANGELOG.md` (repo root)

`VERSION_MANAGEMENT.md` describes and links to `CHANGELOG.md` but the file doesn't exist. Create it with the correct `[Keep a Changelog](https://keepachangelog.com/)` format, populated from the M1 git log.

Git log for M1 (relevant commits):
```
73669b3  Merge pull request #10 — fastapi-sqlite-react-scaffold
6964eb5  docs: complete README and finalize M1 scaffold
7816acf  feat(frontend): scaffold React + TypeScript + Vite app with API proxy
dcfde43  feat(backend): implement FastAPI service with SQLite and /health endpoint
c4f96a6  chore: bootstrap monorepo directory scaffold
c530b3a  docs: add M1 foundation scaffold technical spec (2026-05-14)
```

- [ ] **Step 1: Create `CHANGELOG.md` at repo root**

Create the file with this exact content:

```markdown
# Changelog

All notable changes to HireIQ are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-05-13

### Added

- **FastAPI backend** scaffold with `GET /health` liveness endpoint returning `{"status": "ok", "timestamp": "<ISO-8601 UTC>"}`
- **SQLite database** integration via SQLAlchemy 2.x ORM (`backend/app/database.py` — `engine`, `SessionLocal`, `Base`)
- **Idempotent DB initialisation** via `backend/migrations/init_db.py` using `Base.metadata.create_all` (safe to re-run)
- **React 19 + TypeScript frontend** bootstrapped with Vite 8, polling `/api/health` on mount and displaying live API status
- **Vite proxy** configuration: `/api/*` → `localhost:8000` (strips `/api` prefix so FastAPI routes stay clean)
- **CORS middleware** configured with explicit allowlist `["http://localhost:5173"]` — no wildcard origins
- **GNU Make workflow**: `make install`, `make migrate`, `make dev`, `make lint`, `make test`, `make test-backend`, `make test-frontend`
- **pytest test suite** for backend health endpoint (`backend/tests/test_health.py` — 3 tests: HTTP 200, status field, ISO-8601 timestamp)
- **Vitest + MSW test suite** for frontend App component (`frontend/src/__tests__/App.test.tsx` — 4 tests: heading, loading state, API success, API failure)
- **ESLint 10 + ruff 0.4** linting gates; TypeScript strict-mode type checking via `tsc -b`
- **Complete project documentation**: CONSTITUTION, ARCHITECTURE, CODE_REVIEW, UNIT_TESTING, DEPLOYMENT, SECURITY, VERSION_MANAGEMENT, AGENTS

[Unreleased]: https://github.com/jouneyman-user/HireIQ/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/jouneyman-user/HireIQ/releases/tag/v0.1.0
```

- [ ] **Step 2: Verify the file exists at repo root**

```bash
ls -la CHANGELOG.md
```

Expected: file with non-zero size.

- [ ] **Step 3: Verify the format is correct**

```bash
head -10 CHANGELOG.md
```

Expected first 10 lines:
```
# Changelog

All notable changes to HireIQ are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-05-13
```

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: create CHANGELOG.md with M1 release history"
```

---

## Task 7: Final Verification

**Files:**
- Read: all modified and created files

- [ ] **Step 1: Confirm memory file exists**

```bash
ls docs/superpowers/memory/codebase-analysis.md
```

Expected: file visible.

- [ ] **Step 2: Confirm ARCHITECTURE.md React version fixed**

```bash
grep "React" ARCHITECTURE.md | grep -v "19"
```

Expected: no lines containing "React" without "19" (i.e., all React refs are now React 19).

- [ ] **Step 3: Confirm UNIT_TESTING.md stale note is gone**

```bash
grep -c "part of the M1 implementation" UNIT_TESTING.md
```

Expected: `0`

- [ ] **Step 4: Confirm AGENTS.md status is updated**

```bash
grep "Status:" AGENTS.md
```

Expected: `- **Status:** Milestone 1 — **complete** ...`

- [ ] **Step 5: Confirm README.md tagline and M1 status are correct**

```bash
grep -n "React 18\|In progress" README.md
```

Expected: no output (both stale strings removed).

- [ ] **Step 6: Confirm CHANGELOG.md exists and is well-formed**

```bash
grep "^\[0.1.0\]" CHANGELOG.md
```

Expected: `[0.1.0]: https://github.com/jouneyman-user/HireIQ/releases/tag/v0.1.0`

- [ ] **Step 7: Confirm git log shows all 6 task commits**

```bash
git log --oneline -10
```

Expected last 6 commits to include (in any order):
```
docs: create CHANGELOG.md with M1 release history
docs(agents): fix stale M1 status and correct React version from 18 to 19
docs(readme): correct React version to 19 and mark M1 milestone complete
docs(testing): remove stale note about Makefile test targets (M1 complete)
docs(architecture): correct React version from 18 to 19 in tech stack table
docs: add codebase analysis memory file for documentation generation
```

---

## Completion Report

| File | Status | Key Decisions |
|------|--------|--------------|
| `CONSTITUTION.md` | ⏭️ Skipped — complete | 8 core principles with codebase-traceable evidence |
| `ARCHITECTURE.md` | ✅ Extended | React 18 → 19, TypeScript ≥5.x → ~6.0.2 |
| `CODE_REVIEW.md` | ⏭️ Skipped — complete | Author + reviewer + AI-generated code checklists |
| `UNIT_TESTING.md` | ✅ Extended | Removed stale note about Makefile test targets |
| `DEPLOYMENT.md` | ⏭️ Skipped — complete | Full runbook with 5 common issues and fixes |
| `SECURITY.md` | ⏭️ Skipped — complete | Threat model + AI-specific risks + GDPR/CCPA |
| `VERSION_MANAGEMENT.md` | ⏭️ Skipped — complete | SemVer, GitHub Flow, Conventional Commits, release process |
| `AGENTS.md` | ✅ Extended | M1 status "no source code" → "complete", React 18 → 19 |
| `CHANGELOG.md` | ✅ Created | M1 release populated from git log; [Unreleased] section ready for M2 |
| `docs/superpowers/memory/codebase-analysis.md` | ✅ Created | Tech stack, module map, key patterns, 6 non-obvious gotchas |
| `README.md` | ✅ Extended | React 18 → 19 in tagline; M1 milestone "🔨 In progress" → "✅ Complete" |
