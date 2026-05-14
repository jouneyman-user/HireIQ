# Implementation Plan: M2 — Resume Upload

> **Version:** 1.0 — Draft
> **Date:** 2026-05-14
> **Owner:** jouneyman-user
> **Issue:** [#2 — Resume Upload — Upload and store candidate resumes](https://github.com/jouneyman-user/HireIQ/issues/2)
> **Spec:** `docs/superpowers/specs/2026-05-14-resume-upload-design.md`
> **Status:** 🟡 Draft

---

## 1. Executive Summary

This plan delivers **HireIQ Milestone 2 — Resume Upload**: the platform's first domain feature, built on top of the M1 foundation scaffold. The feature enables hiring teams to upload candidate resumes (PDF or DOCX, ≤ 10 MB) via a drag-and-drop React UI, stores files on the local filesystem under `backend/uploads/resumes/` using UUID-based filenames, and persists metadata to a new `resumes` SQLite table. Three REST endpoints are introduced — `POST /resumes/`, `GET /resumes/`, and `GET /resumes/{id}` — following the established router-per-domain pattern. The primary success outcome is that a user can open `localhost:5173`, drag a PDF onto the upload form, and see the uploaded resume appear in the list view within seconds — with full backend validation and error feedback. Effort is rated **Medium**; target delivery is **3–5 developer-days**. The sole critical prerequisite is a working M1 scaffold (`make dev` starts without errors).

---

## 2. Goals & Non-Goals

### Goals
- [ ] `POST /resumes/` accepts PDF and DOCX files (≤ 10 MB), validates content-type, stores file to `backend/uploads/resumes/<uuid>.<ext>`, persists metadata to `resumes` table, returns HTTP 201 with resume JSON
- [ ] `GET /resumes/` returns all resumes ordered by upload time (newest first), HTTP 200
- [ ] `GET /resumes/{id}` returns a single resume by ID or HTTP 404
- [ ] `make migrate` creates the `resumes` table and `uploads/resumes/` directory (idempotent)
- [ ] `make test` passes: all backend tests green (upload, list, get, reject-invalid, file-too-large, 404)
- [ ] Frontend `ResumeUpload` component: drag-and-drop + click-to-browse, client-side type/size validation, progress state, success/error feedback
- [ ] Frontend `ResumeList` component: tabular display of all uploaded resumes (name, email, filename, size, timestamp)
- [ ] `backend/uploads/` added to `.gitignore`
- [ ] `python-multipart` added to `requirements.txt`
- [ ] `make lint` passes: no ruff errors, no TypeScript type errors

### Non-Goals (explicitly out of scope)
- No authentication or authorization — upload is unauthenticated at M2
- No resume text extraction or AI parsing — deferred to M3
- No cloud/S3/MinIO storage — local filesystem only
- No `Candidate` entity or normalization — `candidate_name`/`candidate_email` are denormalized on `Resume`
- No Alembic migrations — `Base.metadata.create_all` remains the strategy
- No file download endpoint — metadata only at M2
- No search or filter capabilities — deferred to M3
- No frontend unit tests for `ResumeList` — listed as P2 (nice-to-have)
- No pagination on `GET /resumes/` — deferred until volume justifies it
- No duplicate-resume detection — UUID filenames prevent path collisions; semantic deduplication is M3+

---

## 3. Assumptions & Constraints

| # | Assumption / Constraint | Impact if Wrong |
|---|------------------------|----------------|
| 1 | M1 is merged and `make dev` runs cleanly on the target machine | Phase 1 blocked entirely |
| 2 | `backend/.env` exists (copied from `.env.example`) | `DATABASE_URL` defaults to SQLite; migration and app start fine |
| 3 | Python ≥ 3.10 and Node.js ≥ 18 are available | Dependencies won't install |
| 4 | `backend/uploads/resumes/` is writable by the process running uvicorn | Upload fails with permission error |
| 5 | No authentication introduced mid-M2 | All endpoints remain public; auth added in a future milestone |
| 6 | `hireiq.db` schema from M1 is compatible (no column conflicts) | Unlikely — M1 has no `resumes` table |
| 7 | Single developer owns all roles | No handoff delays; all decisions by jouneyman-user |
| 8 | `make test` runs pytest from `backend/` — working directory is `backend/` | `UPLOAD_DIR` relative path resolves correctly |

---

## 4. Stakeholders & Roles

| Role | Name / Team | Responsibility |
|------|------------|---------------|
| Project Owner | jouneyman-user | Final decisions, acceptance sign-off |
| Tech Lead | jouneyman-user | Architecture, code review, merge to `main` |
| Engineering | jouneyman-user | Build, test, wire all components |
| QA | jouneyman-user | Smoke-test all acceptance criteria before close |

> ℹ️ *Single-developer project — all roles held by the same person for M2.*

---

## 5. High-Level Timeline

```
Phase 1: Data Model & Migration        ████░░░░░░░░  Day 1 (morning)     ~2 h
Phase 2: Backend Router & Upload API   ░░░░████████  Day 1–2             ~5 h
Phase 3: Backend Tests                 ░░░░░░░░████  Day 2 (afternoon)   ~3 h
Phase 4: Frontend Components           ░░░░░░░░░░██  Day 3–4             ~5 h
Phase 5: Integration, Docs & Close     ░░░░░░░░░░░░  Day 4–5             ~2 h
```

**Total estimated effort:** 3–5 developer-days

---

## 6. Phases & Tasks

### Phase 1 — Data Model & Migration
**Goal:** Add the `Resume` SQLAlchemy model, register it with `Base`, and ensure `make migrate` creates the `resumes` table and `uploads/resumes/` directory idempotently.
**Duration:** ~2 hours
**Owner:** jouneyman-user

#### Tasks
- [ ] Create `backend/app/models/` package: add `__init__.py`
- [ ] Create `backend/app/models/resume.py` with the `Resume` model (see spec §Phase 1 — Step 1.1)
- [ ] Import model in `backend/app/main.py`: `from app.models import resume  # noqa: F401`
- [ ] Add `os.makedirs("uploads/resumes", exist_ok=True)` to `backend/migrations/init_db.py`
- [ ] Add `backend/uploads/` to `.gitignore`
- [ ] Run `make migrate` — verify `resumes` table created in `hireiq.db` (use `sqlite3 backend/hireiq.db ".schema resumes"`)
- [ ] Re-run `make migrate` — verify idempotency (no error)

**Deliverables:**
- `resumes` table present in SQLite after `make migrate`
- `backend/uploads/resumes/` directory created by migration
- `backend/uploads/` excluded from git

---

### Phase 2 — Backend Router & Upload API
**Goal:** Implement the three resume endpoints (`POST`, `GET /`, `GET /{id}`), wire them into the FastAPI app, and add `python-multipart` to requirements.
**Duration:** ~5 hours
**Owner:** jouneyman-user

#### Tasks — Dependencies
- [ ] Add `python-multipart>=0.0.9` to `backend/requirements.txt`
- [ ] Run `pip install -r backend/requirements.txt` — confirm clean install

#### Tasks — Application Code
- [ ] Create `backend/app/routers/resumes.py` with `upload_resume`, `list_resumes`, `get_resume` (see spec §Phase 2 — Step 2.1)
- [ ] Add `get_db` dependency function (session-per-request pattern) to `resumes.py`
- [ ] Define `UPLOAD_DIR = "uploads/resumes"`, `ALLOWED_TYPES`, `MAX_FILE_BYTES` constants at module top
- [ ] Register router in `backend/app/main.py`: `from app.routers import health, resumes` and `app.include_router(resumes.router)`
- [ ] Add `os.makedirs(UPLOAD_DIR, exist_ok=True)` guard at module level in `resumes.py` (defence-in-depth if migration hasn't run)

#### Tasks — Manual Verification
- [ ] Start server: `make dev`
- [ ] `curl -F "candidate_name=Alice" -F "candidate_email=alice@test.com" -F "file=@/path/to/test.pdf" http://localhost:8000/resumes/` → HTTP 201 + JSON
- [ ] `curl http://localhost:8000/resumes/` → HTTP 200 + JSON array with one entry
- [ ] `curl http://localhost:8000/resumes/1` → HTTP 200 + single resume JSON
- [ ] `curl http://localhost:8000/resumes/99999` → HTTP 404
- [ ] Upload a `.txt` file → HTTP 415
- [ ] Confirm `backend/uploads/resumes/` contains a UUID-named file

**File Reference — `backend/app/routers/resumes.py` (critical sections)**

```python
UPLOAD_DIR = "uploads/resumes"
ALLOWED_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
MAX_FILE_BYTES = 10 * 1024 * 1024  # 10 MB

router = APIRouter(prefix="/resumes", tags=["resumes"])
```

> **Note:** All routes are defined without the `/api` prefix. The Vite proxy rewrites `/api/resumes/` → `/resumes/`. Defining `/api/resumes/` in FastAPI would result in the browser calling `/api/api/resumes/`.

**Deliverables:**
- Three working endpoints verified via curl
- `python-multipart` in `requirements.txt`
- Files written to `backend/uploads/resumes/`
- All changes committed

---

### Phase 3 — Backend Tests
**Goal:** Achieve ≥ 80% coverage on the resumes router; all tests green in `make test`.
**Duration:** ~3 hours
**Owner:** jouneyman-user

#### Tasks
- [ ] Add `httpx>=0.27.0` to `backend/requirements.txt` (required by FastAPI `TestClient`; may already be present from M1)
- [ ] Create `backend/tests/test_resumes.py` with test fixtures and test cases (see spec §Phase 3 — Step 3.1)
- [ ] Implement `reset_db` autouse fixture: use `monkeypatch.setattr` to redirect `UPLOAD_DIR` to `tmp_path`; run `create_all` before yield, `drop_all` after
- [ ] Write test cases:
  - [ ] `test_upload_returns_201` — valid PDF upload
  - [ ] `test_upload_returns_resume_metadata` — verify all fields in response JSON
  - [ ] `test_upload_rejects_invalid_type` — `.txt` file → HTTP 415
  - [ ] `test_upload_rejects_large_file` — file > 10 MB → HTTP 413
  - [ ] `test_list_resumes` — list returns uploaded resume
  - [ ] `test_list_resumes_ordered` — newest resume appears first
  - [ ] `test_get_resume_by_id` — correct resume returned by ID
  - [ ] `test_get_resume_404` — non-existent ID returns 404
- [ ] Run `make test` — all tests green
- [ ] Run `make lint` (ruff) on `backend/` — zero errors

**File structure after Phase 3:**

```
backend/tests/
├── __init__.py
├── test_health.py     ← M1 (unchanged)
└── test_resumes.py    ← M2 (new)
```

**Deliverables:**
- 8+ test cases passing in CI
- `make test` green
- `make lint` green for backend

---

### Phase 4 — Frontend Components
**Goal:** Deliver `ResumeUpload` and `ResumeList` components wired into `App.tsx`; verify end-to-end upload flow in browser.
**Duration:** ~5 hours
**Owner:** jouneyman-user

#### Tasks — Component Scaffold
- [ ] Create `frontend/src/components/` directory
- [ ] Create `frontend/src/components/ResumeUpload.tsx` (see spec §Phase 4 — Step 4.1)
  - [ ] Implement drag-and-drop drop zone with `onDragOver`, `onDragLeave`, `onDrop`
  - [ ] Implement click-to-browse via hidden `<input type="file">` and ref
  - [ ] Client-side validation: content-type and file size
  - [ ] Upload state machine: `idle | uploading | success | error`
  - [ ] `onUploaded` callback prop to notify parent on successful upload
- [ ] Create `frontend/src/components/ResumeList.tsx` (see spec §Phase 4 — Step 4.2)
  - [ ] Tabular display: name, email, filename, size (KB), timestamp
  - [ ] Empty state: "No resumes uploaded yet."
- [ ] Update `frontend/src/App.tsx` to compose `ResumeUpload` + `ResumeList` (see spec §Phase 4 — Step 4.3)
  - [ ] `useEffect` on mount to `GET /api/resumes/` and populate initial list
  - [ ] `handleUploaded` appends new resume to list without re-fetching

#### Tasks — TypeScript & Lint
- [ ] Define shared `Resume` type in `frontend/src/types/resume.ts` (or inline per component — keep simple for M2)
- [ ] Run `npx tsc --noEmit` from `frontend/` — zero TypeScript errors
- [ ] Run `make lint` — zero eslint errors

#### Tasks — Manual Verification
- [ ] `make dev` — both servers running
- [ ] Open `http://localhost:5173` — page loads with upload form and empty list
- [ ] Drag a PDF onto the drop zone — file name appears in the drop zone
- [ ] Fill in candidate name and email; click "Upload Resume"
- [ ] Upload button shows "Uploading..." during request
- [ ] On success: form resets, success message shown, resume appears in list
- [ ] Upload a `.txt` file — client-side error: "Only PDF and DOCX files are accepted."
- [ ] Attempt upload without selecting a file — submit button remains disabled

**Deliverables:**
- `ResumeUpload` component with full drag-and-drop UX
- `ResumeList` rendering all uploaded resumes
- `App.tsx` wires both components end-to-end
- Zero TypeScript + lint errors
- All components committed

---

### Phase 5 — Integration, Documentation & Close
**Goal:** Validate end-to-end flow via `make` commands from a fresh terminal; update `ARCHITECTURE.md`; close Issue #2.
**Duration:** ~2 hours
**Owner:** jouneyman-user

#### Tasks — Integration Smoke Test
- [ ] In a **fresh terminal** (no running services), run `make install` — backend and frontend install clean
- [ ] Run `make migrate` — `resumes` table created; `uploads/resumes/` directory created
- [ ] Run `make dev` — uvicorn and Vite both start; no errors
- [ ] Full end-to-end upload test: drag PDF → fill form → upload → verify in list
- [ ] Run `make test` — all 8+ resume tests + M1 health test pass
- [ ] Run `make lint` — backend and frontend both clean

#### Tasks — Documentation
- [ ] Update `ARCHITECTURE.md`:
  - Add `app/models/resume.py` to annotated directory tree
  - Add `app/routers/resumes.py` to annotated directory tree
  - Add `uploads/resumes/` to directory tree
  - Add `Resume` model description to State Management §Server State table
  - Update External Integrations note (still none at M2)
- [ ] Update `README.md`:
  - Add `POST /resumes/` and `GET /resumes/` to API Reference table
  - Add note about `uploads/` directory (created automatically, gitignored)
- [ ] Update `backend/.env.example` if any new env vars were added (none at M2 — no changes)

#### Tasks — Acceptance Verification & Close
- [ ] Verify all M2 acceptance criteria:
  - [ ] `POST /resumes/` accepts PDF → HTTP 201 ✅
  - [ ] `POST /resumes/` accepts DOCX → HTTP 201 ✅
  - [ ] `POST /resumes/` rejects non-PDF/DOCX → HTTP 415 ✅
  - [ ] `POST /resumes/` rejects > 10 MB → HTTP 413 ✅
  - [ ] File written to `uploads/resumes/<uuid>` ✅
  - [ ] `GET /resumes/` returns list ✅
  - [ ] `GET /resumes/{id}` returns metadata or 404 ✅
  - [ ] `make migrate` idempotent ✅
  - [ ] `make test` all green ✅
  - [ ] Frontend drag-and-drop upload works ✅
  - [ ] Frontend list displays uploaded resumes ✅
- [ ] Final commit: `feat: M2 resume upload — backend API + frontend components`
- [ ] Push `main` to remote
- [ ] Close Issue #2 with summary comment

**Deliverables:**
- All acceptance criteria verified green
- `ARCHITECTURE.md` updated
- `README.md` updated
- Issue #2 closed
- `main` pushed to remote

---

## 7. Dependencies

| Dependency | Type | Owner | Due Date | Risk if Late |
|-----------|------|-------|----------|-------------|
| M1 scaffold complete and merged | Internal (prerequisite) | jouneyman-user | Before Day 1 | Blocks all phases |
| `python-multipart>=0.0.9` | Python package | Phase 2 | Day 1 | `UploadFile`/`Form` parsing fails entirely |
| `httpx>=0.27.0` | Python package (test) | Phase 3 | Day 2 | `TestClient` won't work |
| `backend/uploads/resumes/` writable | Environment | Developer machine | Phase 1 | File write fails at runtime |
| `hireiq.db` accessible | Environment | Phase 1 | Day 1 | All DB operations fail |

---

## 8. Risk Register

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|-----------|--------|-----------|
| R1 | `uploads/resumes/` missing when first upload attempted | Medium | High | `os.makedirs(..., exist_ok=True)` in both `init_db.py` and `resumes.py` module-level code |
| R2 | `python-multipart` missing from `requirements.txt` | Medium | High | Explicitly add to requirements; FastAPI emits clear error if missing |
| R3 | MIME type spoofing (client sends `application/pdf` for a `.txt` file) | Medium | Medium | M2 accepts the risk; add magic-byte validation in M3 security hardening |
| R4 | File size limit bypass via streaming / chunked client | Low | Medium | Read entire content into memory before write; limits to 10 MB at M2 scale |
| R5 | Test isolation failures (tests writing to shared `uploads/`) | Medium | Medium | `monkeypatch.setattr(r, "UPLOAD_DIR", str(tmp_path))` per test |
| R6 | `make test` path issue: pytest run from wrong directory | Low | High | Makefile explicitly `cd backend && pytest tests/ -v`; `UPLOAD_DIR` is relative to `backend/` |
| R7 | TypeScript errors in `ResumeUpload` due to drag-event types | Low | Low | Use `React.DragEvent<HTMLDivElement>` throughout |
| R8 | Vite proxy double-prefix (`/api/api/resumes/`) | Low | High | Backend routes defined as `/resumes/` — never `/api/resumes/`; follow M1 pattern |
| R9 | `uploads/` accidentally committed to git | Medium | Low | `.gitignore` update in Phase 1; verify with `git status` before final commit |
| R10 | SQLite WAL contention with concurrent test runs | Very Low | Low | M2 is single-process; not a concern at this scale |

---

## 9. KPIs & Success Metrics

| Metric | Target | Measurement Method |
|--------|--------|--------------------|
| All acceptance criteria met | 14 / 14 | Manual smoke test in Phase 5 |
| Backend test cases passing | ≥ 8 | `make test` output |
| Backend test coverage (resumes router) | ≥ 80% | `pytest --cov=app/routers/resumes` |
| `make lint` (backend ruff) | 0 errors | `make lint` output |
| `make lint` (frontend tsc) | 0 TypeScript errors | `make lint` output |
| `POST /resumes/` p95 latency | < 500 ms for a 1 MB PDF | Manual `curl` with timing |
| Delivery within effort budget | ≤ 5 developer-days | Wall-clock time |

---

## 10. Communication Plan

> ℹ️ *Single-developer project — no formal comms cadence required.*

| Event | Action |
|-------|--------|
| Phase complete | Commit with descriptive message; push to `main` |
| Blocker encountered | Note in Issue #2 comment |
| All criteria met | Close Issue #2 with summary comment |

---

## 11. Definition of Done

A task is "done" when ALL of the following are true:
- [ ] Code written and manually verified to work as described
- [ ] Changes committed to `main` with a descriptive commit message
- [ ] No uncommitted changes remain for that task
- [ ] Relevant documentation (README / ARCHITECTURE / inline comments) updated
- [ ] `make test` and `make lint` pass after the change

The milestone is "done" when **all 14 acceptance criteria** from §2 Goals are verified green in Phase 5.

---

## 12. Open Questions

| # | Question | Owner | Due Date |
|---|----------|-------|----------|
| 1 | Should `GET /resumes/` support filtering by `candidate_email` query param at M2? | jouneyman-user | Before Phase 2 |
| 2 | Should `POST /resumes/` validate email format server-side (e.g. using Pydantic `EmailStr`)? | jouneyman-user | Before Phase 2 |
| 3 | Should frontend tests (Vitest) be introduced at M2, or deferred to M3? | jouneyman-user | Before Phase 4 |
| 4 | Should `GET /resumes/{id}/download` (file download) be in M2 or M3? | jouneyman-user | Before Phase 5 |

---

## 13. Appendix

### A. Glossary

| Term | Definition |
|------|-----------|
| Resume | A candidate's CV/résumé document — PDF or DOCX format |
| `UPLOAD_DIR` | `backend/uploads/resumes/` — local directory for stored resume files |
| UUID filename | A `uuid4()`-generated string used as the stored file name, preventing collisions |
| Content-type | HTTP MIME type sent by the client; used to validate that only PDF/DOCX is accepted |
| Session-per-request | FastAPI dependency injection pattern: `get_db()` yields a `SessionLocal` instance, closed after response |
| `python-multipart` | FastAPI runtime dependency that enables `UploadFile` and `Form` parsing of `multipart/form-data` requests |
| M2 | Milestone 2 — Resume Upload (this milestone) |
| M1 | Milestone 1 — Foundation Scaffold (complete prerequisite) |

### B. Architecture Decisions

Three design dimensions were evaluated in the spec. Decisions:

| Dimension | Chosen Option | Rationale |
|-----------|--------------|-----------|
| File storage | A1 — Local filesystem (UUID-named) | Zero external dependencies; consistent with M1 |
| Text extraction | B1 — No extraction at M2 | Out of scope; deferred to M3 AI feature |
| Database model | C1 — Minimal `Resume` (denormalized) | `Candidate` entity undefined at M2; normalization deferred |

Full rationale: `docs/superpowers/specs/2026-05-14-resume-upload-design.md` §Options Considered.

### C. Repository Target Structure After M2

```
HireIQ/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py              # Updated: imports resumes router + resume model
│   │   ├── database.py          # Unchanged from M1
│   │   ├── models/              # NEW: domain models package
│   │   │   ├── __init__.py
│   │   │   └── resume.py        # Resume SQLAlchemy model
│   │   └── routers/
│   │       ├── __init__.py
│   │       ├── health.py        # Unchanged from M1
│   │       └── resumes.py       # NEW: POST/GET /resumes/ + GET /resumes/{id}
│   ├── migrations/
│   │   └── init_db.py           # Updated: os.makedirs("uploads/resumes")
│   ├── uploads/                 # NEW: gitignored; created by migration
│   │   └── resumes/             # UUID-named PDF/DOCX files stored here
│   ├── tests/
│   │   ├── __init__.py
│   │   ├── test_health.py       # Unchanged from M1
│   │   └── test_resumes.py      # NEW: 8+ test cases for resumes router
│   └── requirements.txt         # Updated: + python-multipart>=0.0.9
├── frontend/
│   ├── src/
│   │   ├── main.tsx             # Unchanged from M1
│   │   ├── App.tsx              # Updated: composes ResumeUpload + ResumeList
│   │   └── components/          # NEW: React component library starts here
│   │       ├── ResumeUpload.tsx  # Drag-and-drop + form + upload logic
│   │       └── ResumeList.tsx    # Tabular resume list view
│   └── vite.config.ts           # Unchanged from M1
├── .gitignore                   # Updated: + backend/uploads/
├── ARCHITECTURE.md              # Updated: models/, resumes router, uploads/
└── README.md                    # Updated: + API reference for /resumes/
```

### D. API Reference (M2)

| Method | Path | Request | Response | Notes |
|--------|------|---------|----------|-------|
| `POST` | `/resumes/` | `multipart/form-data`: `candidate_name`, `candidate_email`, `file` | `201` Resume JSON | Stores file + metadata |
| `GET` | `/resumes/` | — | `200` `[Resume]` ordered newest-first | List all |
| `GET` | `/resumes/{id}` | Path param `id: int` | `200` Resume JSON or `404` | Single resume |
| `GET` | `/health` | — | `200` `{"status":"ok","timestamp":"..."}` | M1 (unchanged) |

### E. Reference Links

| Resource | Link |
|----------|------|
| Spec / Design | `docs/superpowers/specs/2026-05-14-resume-upload-design.md` |
| GitHub Issue | https://github.com/jouneyman-user/HireIQ/issues/2 |
| Repository | https://github.com/jouneyman-user/HireIQ |
| M1 Implementation Plan | `docs/superpowers/specs/2026-05-14-monorepo-foundation-scaffold-implementation-plan.md` |
| FastAPI File Uploads | https://fastapi.tiangolo.com/tutorial/request-files/ |
| FastAPI Form Data | https://fastapi.tiangolo.com/tutorial/request-form-and-files/ |
| SQLAlchemy `create_all` | https://docs.sqlalchemy.org/en/20/core/metadata.html#sqlalchemy.schema.MetaData.create_all |

### F. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-05-14 | jouneyman-user | Initial draft — generated from spec `2026-05-14-resume-upload-design.md` |
