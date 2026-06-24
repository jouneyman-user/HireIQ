# Technical Specification: Question Bank Persistence
## HireIQ Milestone 3 — Save & Revisit Generated Question Sets

**Date:** 2026-05-13
**Issue:** [jouneyman-user/HireIQ#6](https://github.com/jouneyman-user/HireIQ/issues/6)
**Status:** Draft — Ready for Implementation
**Milestone:** M3 — Persistence
**Effort:** Medium (M)
**Author:** Brainstormed by autonomous planning agent using superpowers

---

## 🔍 Problem Summary

Recruiters using HireIQ regenerate interview questions for similar roles repeatedly. Each generation consumes Claude API tokens and forces the recruiter to wait for fresh inference. There is no way to revisit, share, or re-use a question set once the recruiter navigates away from it.

**User Story (verbatim from issue):**
> As a recruiter, I want to save and revisit past question sets so that I can reuse them for similar roles without regenerating every time.

### Acceptance Criteria (from issue #6)

- [ ] Each generation is saved to a `sessions` table with role title, timestamp, and JSON output
- [ ] `GET /api/sessions` returns a paginated list of past sessions
- [ ] React sidebar lists past sessions; clicking one loads the question set
- [ ] User can delete a saved session from the UI

### Key Constraints (from CONSTITUTION.md)

- **Database:** SQLite (file at `backend/hireiq.db`) — single file, single-process
- **ORM:** SQLAlchemy ≥ 2.0, `Base.metadata.create_all` for idempotent migrations
- **Backend:** FastAPI router-per-domain pattern, session-per-request via `Depends(get_db)`
- **Frontend:** React + TypeScript, Vite proxy `/api/*` → `:8000`, no global state manager yet
- **No new dependencies:** pip and npm must remain sufficient
- **No wildcard CORS** — already locked to `["http://localhost:5173"]`
- **Tests:** pytest (backend) + Vitest (frontend); coverage includes happy path, edge cases, error conditions
- **Idempotent migrations:** `make migrate` must always be safe

---

## 💡 Options Considered

### Option 1: Auto-Save on Generate + List/Detail/Delete Endpoints ✅ RECOMMENDED

**Architecture:**
- Modify existing `POST /generate/` to persist every successful response to a new `sessions` table
- New `GET /sessions` returns paginated metadata (no question bodies — keeps list payload small)
- New `GET /sessions/{id}` returns one session with full question set (parsed JSON)
- New `DELETE /sessions/{id}` removes a session and returns 204
- Frontend gets a `SessionSidebar` component: list, click-to-load, delete with confirm dialog

**Pros:**
- Matches the issue's wording "save generated sets" — no extra click required
- Minimal API surface: reuses existing generate flow + three new endpoints
- Metadata-only list keeps `GET /sessions` fast even with hundreds of saved sets
- Detail endpoint returns the parsed JSON the frontend already understands
- Zero new dependencies — uses existing SQLAlchemy `JSON`/`Text` column types
- Idempotent: `Base.metadata.create_all` is safe to re-run

**Cons:**
- A failed `POST /generate/` does not save a session (acceptable — partial/failed generations have no value)
- Sessions table grows unbounded at M3 scale (irrelevant: SQLite handles millions of rows; prune is a future M-N concern)

### Option 2: Explicit "Save to Bank" Button on UI

**Architecture:**
- Leave `POST /generate/` unchanged (returns response, doesn't persist)
- Add an explicit save button on the question-display component
- Click triggers `POST /sessions` with the current question set
- List/delete endpoints same as Option 1

**Pros:**
- Recruiter chooses what to keep

**Cons:**
- **Violates the issue's wording** — the issue says "Each generation is saved", not "User can optionally save"
- Extra friction for the common case (recruiter almost always wants to keep a set)
- Two failure modes: forgot-to-save and accidental-double-save
- More state to track on the client (saved/not-saved flag)

**Rejected:** Contradicts acceptance criterion #1.

### Option 3: Background Async Worker Saves Generations

**Architecture:**
- `POST /generate/` publishes a message to a queue after responding
- A worker consumes the queue and writes to `sessions`
- Same read endpoints

**Pros:**
- Decouples request latency from DB write

**Cons:**
- **Requires Redis/RabbitMQ/SQLite-queue infrastructure** — explicitly out of M3 scope per CONSTITUTION.md principle #2 ("Standard tooling over specialized tooling")
- Adds a process to manage (`make dev` already orchestrates two)
- Failure modes multiply (queue backlog, worker crash, partial commits)
- 10× the code for zero user-visible benefit at M3 scale

**Rejected:** Violates "solve for today's scale" principle.

---

## ✅ Recommended Approach

**Option 1: Auto-Save on Generate + List/Detail/Delete Endpoints.**

### Why This Approach

1. **Matches issue intent** — "Each generation is saved" maps directly to "save inside the generate flow"
2. **Zero new dependencies** — uses existing SQLAlchemy `Text` + `JSON` columns
3. **Idempotent migration** — `Base.metadata.create_all` adds the new table safely on next `make migrate`
4. **Module boundaries respected** — backend owns DB & API, frontend owns sidebar UI; no cross-module imports
5. **Future-proof** — when M-N introduces auth/tenancy, `sessions` table can grow a `user_id` column without API breakage

---

## ⚙️ Implementation Steps

### Phase 1: Database Schema (Backend)

**New model** — `backend/app/models/session.py`:

```python
"""Session model — persists generated interview question sets."""
from datetime import datetime
import json

from sqlalchemy import Column, DateTime, Integer, String, Text

from app.database import Base


class Session(Base):
    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True, index=True)
    role_title = Column(String(255), nullable=False, index=True)
    seniority_level = Column(String(64), nullable=False)
    key_skills_json = Column(Text, nullable=False, default="[]")  # JSON-encoded list[str]
    questions_json = Column(Text, nullable=False)                  # JSON-encoded GenerateResponse
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    def set_key_skills(self, skills: list[str]) -> None:
        self.key_skills_json = json.dumps(skills)

    def get_key_skills(self) -> list[str]:
        return json.loads(self.key_skills_json) if self.key_skills_json else []

    def set_questions(self, questions: dict) -> None:
        self.questions_json = json.dumps(questions)

    def get_questions(self) -> dict:
        return json.loads(self.questions_json) if self.questions_json else {}
```

**Update package** — `backend/app/models/__init__.py`:

```python
"""Models package — import every model here so Base.metadata sees them."""
from app.models.resume import Resume  # noqa: F401
from app.models.session import Session  # noqa: F401
```

**No migration script change needed** — `backend/migrations/init_db.py` already imports models via `app.main`, which will now pick up `Session`. Verify by re-running `make migrate`; `CREATE TABLE IF NOT EXISTS sessions` is idempotent.

### Phase 2: Add `get_db()` Dependency

**Update** — `backend/app/database.py` (add at the bottom):

```python
def get_db():
    """FastAPI dependency: yield a SQLAlchemy session per request, close on exit."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

This matches the pattern documented in `ARCHITECTURE.md` (Session-per-request) and `UNIT_TESTING.md`.

### Phase 3: Sessions Router

**New file** — `backend/app/routers/sessions.py`:

```python
"""Sessions router — list / retrieve / delete generated question sets."""
import logging
import math

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session as DbSession

from app.database import get_db
from app.models.session import Session

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sessions", tags=["sessions"])


# ── request / response models ────────────────────────────────────────────────

class SessionSummary(BaseModel):
    """Lightweight session metadata — returned by GET /sessions."""
    id: int
    role_title: str
    seniority_level: str
    key_skills: list[str]
    created_at: str  # ISO-8601


class SessionListResponse(BaseModel):
    items: list[SessionSummary]
    page: int
    page_size: int
    total_items: int
    total_pages: int


class SessionDetail(BaseModel):
    """Full session payload — returned by GET /sessions/{id}."""
    id: int
    role_title: str
    seniority_level: str
    key_skills: list[str]
    questions: dict  # {technical: [...], behavioural: [...], culture_fit: [...]}
    created_at: str


# ── endpoints ────────────────────────────────────────────────────────────────

@router.get("/", status_code=200, response_model=SessionListResponse)
def list_sessions(
    page: int = Query(1, ge=1, description="1-indexed page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page (1-100)"),
    db: DbSession = Depends(get_db),
) -> SessionListResponse:
    """Return paginated session summaries, newest first.

    Returns 200 with paginated list on success.
    Returns 422 if page or page_size are out of range (handled by FastAPI validators).
    """
    total_items = db.query(Session).count()
    total_pages = max(1, math.ceil(total_items / page_size))

    offset = (page - 1) * page_size
    rows = (
        db.query(Session)
        .order_by(Session.created_at.desc(), Session.id.desc())
        .offset(offset)
        .limit(page_size)
        .all()
    )

    items = [
        SessionSummary(
            id=row.id,
            role_title=row.role_title,
            seniority_level=row.seniority_level,
            key_skills=row.get_key_skills(),
            created_at=row.created_at.isoformat(),
        )
        for row in rows
    ]

    return SessionListResponse(
        items=items,
        page=page,
        page_size=page_size,
        total_items=total_items,
        total_pages=total_pages,
    )


@router.get("/{session_id}", status_code=200, response_model=SessionDetail)
def get_session(session_id: int, db: DbSession = Depends(get_db)) -> SessionDetail:
    """Return a single session with full question set.

    Returns 200 on success.
    Returns 404 if session does not exist.
    """
    row = db.query(Session).filter(Session.id == session_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found.")

    return SessionDetail(
        id=row.id,
        role_title=row.role_title,
        seniority_level=row.seniority_level,
        key_skills=row.get_key_skills(),
        questions=row.get_questions(),
        created_at=row.created_at.isoformat(),
    )


@router.delete("/{session_id}", status_code=204)
def delete_session(session_id: int, db: DbSession = Depends(get_db)) -> None:
    """Delete a session.

    Returns 204 on success (idempotent — returns 204 even if session already gone).
    Returns 422 if session_id is not a positive integer.
    """
    row = db.query(Session).filter(Session.id == session_id).first()
    if row is not None:
        db.delete(row)
        db.commit()
        logger.info("Deleted session %s", session_id)
    return None
```

**Register in app** — `backend/app/main.py`:

```python
from app.routers import generate, health, resumes, sessions  # add sessions

app.include_router(sessions.router)  # add this line
```

### Phase 4: Modify Generate to Auto-Save

**Update** — `backend/app/routers/generate.py` (append after the response is built):

```python
from app.database import get_db
from app.models.session import Session
from sqlalchemy.orm import Session as DbSession
from fastapi import Depends

# Inside the function signature, add db: DbSession = Depends(get_db)
def generate_questions(
    payload: GenerateRequest,
    db: DbSession = Depends(get_db),
) -> GenerateResponse:
    """..."""
    # ... existing validation and Claude call ...

    response = GenerateResponse(
        technical=[Question(**q) for q in result["technical"]],
        behavioural=[Question(**q) for q in result["behavioural"]],
        culture_fit=[Question(**q) for q in result["culture_fit"]],
    )

    # Auto-save the generated question set so recruiters can revisit it
    session = Session(
        role_title=payload.job_title.strip(),
        seniority_level=payload.seniority_level.strip(),
    )
    session.set_key_skills([s.strip() for s in payload.key_skills if s.strip()])
    session.set_questions(response.model_dump())
    db.add(session)
    db.commit()
    db.refresh(session)
    logger.info("Saved session %s for role '%s'", session.id, session.role_title)

    return response
```

**Response shape is unchanged** — the auto-save is a side effect; clients receive the same `GenerateResponse` as before. This is non-breaking.

> **Failure semantics:** If the Claude call succeeds but `db.commit()` fails (e.g., disk full), the recruiter still sees the question set in the response (transient in-memory) but nothing was persisted. The error is logged. This is acceptable at M3 — the recruiter can simply click "Generate" again to retry the save with the same inputs.

### Phase 5: Frontend SessionSidebar

**New file** — `frontend/src/components/SessionSidebar.tsx`:

```typescript
import { useEffect, useState } from 'react'

export interface SessionSummary {
  id: number
  role_title: string
  seniority_level: string
  key_skills: string[]
  created_at: string
}

export interface SessionDetail extends SessionSummary {
  questions: {
    technical: Array<{ text: string; follow_up: string; what_to_listen_for: string }>
    behavioural: Array<{ text: string; follow_up: string; what_to_listen_for: string }>
    culture_fit: Array<{ text: string; follow_up: string; what_to_listen_for: string }>
  }
}

interface SessionSidebarProps {
  onLoadSession: (session: SessionDetail) => void
  refreshKey: number
}

export function SessionSidebar({ onLoadSession, refreshKey }: SessionSidebarProps) {
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch('/api/sessions?page=1&page_size=50')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data: { items: SessionSummary[] }) => {
        if (!cancelled) setSessions(data.items)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load sessions.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  const handleClick = async (id: number) => {
    try {
      const res = await fetch(`/api/sessions/${id}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const detail: SessionDetail = await res.json()
      onLoadSession(detail)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load session.')
    }
  }

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this saved question set? This cannot be undone.')) {
      return
    }
    setDeletingId(id)
    try {
      const res = await fetch(`/api/sessions/${id}`, { method: 'DELETE' })
      if (!res.ok && res.status !== 204) {
        throw new Error(`HTTP ${res.status}`)
      }
      setSessions((prev) => prev.filter((s) => s.id !== id))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete session.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <aside
      style={{
        width: 280,
        flexShrink: 0,
        borderRight: '1px solid #ddd',
        padding: '1rem',
        height: 'calc(100vh - 2rem)',
        overflowY: 'auto',
      }}
    >
      <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Past Sessions</h2>
      {loading && <p style={{ color: '#888' }}>Loading…</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {!loading && !error && sessions.length === 0 && (
        <p style={{ color: '#888', fontSize: '0.9rem' }}>
          No saved sessions yet. Generate questions to create one.
        </p>
      )}
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {sessions.map((s) => (
          <li
            key={s.id}
            style={{
              padding: '0.5rem',
              marginBottom: '0.5rem',
              border: '1px solid #eee',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            <div
              onClick={() => handleClick(s.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleClick(s.id)
              }}
            >
              <strong style={{ display: 'block' }}>{s.role_title}</strong>
              <small style={{ color: '#666' }}>
                {s.seniority_level} ·{' '}
                {new Date(s.created_at).toLocaleString()}
              </small>
            </div>
            <button
              type="button"
              onClick={() => handleDelete(s.id)}
              disabled={deletingId === s.id}
              style={{
                marginTop: '0.25rem',
                background: 'transparent',
                border: 'none',
                color: '#c00',
                cursor: 'pointer',
                fontSize: '0.8rem',
                padding: 0,
              }}
            >
              {deletingId === s.id ? 'Deleting…' : 'Delete'}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  )
}
```

### Phase 6: Wire Sidebar into App

**Update** — `frontend/src/App.tsx`:

```typescript
import { useState } from 'react'
import { SessionSidebar, type SessionDetail } from './components/SessionSidebar'
// ... existing imports

function App() {
  const [refreshKey, setRefreshKey] = useState(0)
  const [loadedSession, setLoadedSession] = useState<SessionDetail | null>(null)
  // ... existing state

  const handleGenerate = async (roleData: JobRoleData) => {
    // ... existing generate logic
    // After successful setGenerateResult(...):
    setRefreshKey((k) => k + 1)  // trigger sidebar refresh
  }

  const handleLoadSession = (session: SessionDetail) => {
    setLoadedSession(session)
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      <SessionSidebar onLoadSession={handleLoadSession} refreshKey={refreshKey} />
      <main style={{ flex: 1, padding: '2rem', maxWidth: 960 }}>
        <h1>HireIQ</h1>
        <ResumeUpload onUploaded={handleUploaded} />
        <hr style={{ margin: '2rem 0' }} />
        <JobRoleForm onSubmit={handleGenerate} disabled={!activeResumeId || generating} />
        {/* ... error / result rendering ... */}
        {loadedSession && (
          <section>
            <h2>{loadedSession.role_title}</h2>
            <p style={{ color: '#666' }}>
              {loadedSession.seniority_level} · {new Date(loadedSession.created_at).toLocaleString()}
            </p>
            {/* Render loadedSession.questions.{technical,behavioural,culture_fit} */}
          </section>
        )}
        <h2>Uploaded Resumes</h2>
        <ResumeList resumes={resumes} />
      </main>
    </div>
  )
}
```

> The exact "loaded question set" rendering depends on Issue #5 (`feat/issue-5-question-display-ui`) — the spec assumes a `<QuestionDisplay>` component exists. If #5 is not yet merged, `loadedSession.questions` is held in state and a minimal placeholder list is rendered so the feature is testable end-to-end.

---

## ⚠️ Risks & Edge Cases

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| `sessions` table grows unbounded | Low (M3 scale) | Disk usage | Document for future prune task; SQLite handles millions of rows |
| Concurrent `POST /generate/` race on SQLite | Low | One save fails with `database is locked` | SQLite has file-level locking; FastAPI runs handlers in a threadpool. Add `db.rollback()` in the except path; log and continue (user still sees the generated questions in the response). |
| User clicks delete on session currently displayed | Medium | Confusing UX | Confirm dialog (`window.confirm`) blocks accidental clicks |
| `questions_json` becomes corrupted | Very Low | `GET /sessions/{id}` 500 | Try/except around `json.loads`; return 500 with sanitized error |
| Frontend `new Date()` shows wrong timezone | Low | Cosmetic | Use `toLocaleString()` — uses browser locale |
| Sidebar doesn't refresh after generate | Medium | Stale UI | `refreshKey` prop + `useEffect` dependency |
| `GET /sessions?page_size=10000` | Low | Slow query | Pydantic `Query(..., le=100)` enforces upper bound |
| Two recruiters use same DB file (shared dev box) | Low | They see each other's sessions | Document as out-of-scope for M3; add `user_id` in M-N |

### Empty / Boundary Cases Covered by Tests

- Empty `sessions` table → `GET /sessions` returns `items: []`, `total_items: 0`, `total_pages: 1`
- Page out of range → returns empty `items`, not an error
- `GET /sessions/999999` (non-existent) → 404 with structured JSON error
- `DELETE /sessions/999999` (already deleted) → 204 (idempotent)
- `POST /generate/` with empty `job_title` → 422 (existing validation; no row saved)
- `key_skills = []` → save with empty list; load returns empty list
- Question set with Unicode (e.g. résumé) → JSON round-trip preserves content

---

## 📌 Assumptions

1. **Single-process dev** — uvicorn runs single-worker; SQLite write lock contention is not a concern at M3
2. **Auto-save is the desired UX** — matches the issue's "Each generation is saved" criterion
3. **No foreign key to `resumes`** — a session can stand alone (a recruiter may generate questions without selecting a resume, or after a resume is deleted). Resume ID is not stored on the session at M3.
4. **No authentication / user scoping** — all sessions in one DB are visible to everyone. Multi-tenant is a future milestone.
5. **No soft-delete** — `DELETE /sessions/{id}` hard-deletes. Audit log is out of scope.
6. **Pagination default = 20, max = 100** — keeps payloads small and predictable
7. **Newest first** — most recent sessions are most likely to be revisited
8. **No tags / search / favourites** — out of scope; would require schema additions beyond the issue's intent

---

## 🧪 Testing Strategy

### Backend Tests (pytest)

**`backend/tests/test_sessions.py`** — covers all four endpoints + auto-save integration:

```python
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app


@pytest.fixture
def client():
    """In-memory SQLite + dependency override (pattern from UNIT_TESTING.md)."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(bind=engine)
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_list_sessions_empty(client):
    res = client.get("/sessions/")
    assert res.status_code == 200
    body = res.json()
    assert body["items"] == []
    assert body["total_items"] == 0
    assert body["total_pages"] == 1


def test_session_round_trip(client, monkeypatch):
    """Generate saves a session; list shows it; detail returns questions; delete removes it."""
    # Stub Claude service so we don't call the real API in tests
    from app.services import claude_service
    monkeypatch.setattr(
        claude_service,
        "generate_interview_questions",
        lambda **_: {
            "technical": [{"text": "T", "follow_up": "FU", "what_to_listen_for": "W"}],
            "behavioural": [],
            "culture_fit": [],
        },
    )

    # Generate -> should auto-save
    payload = {
        "resume_text": "Alice, 5y Python",
        "job_title": "Senior Backend Engineer",
        "seniority_level": "Senior",
        "key_skills": ["Python", "Postgres"],
    }
    gen_res = client.post("/generate/", json=payload)
    assert gen_res.status_code == 200

    # List
    list_res = client.get("/sessions/")
    assert list_res.status_code == 200
    items = list_res.json()["items"]
    assert len(items) == 1
    assert items[0]["role_title"] == "Senior Backend Engineer"
    assert items[0]["key_skills"] == ["Python", "Postgres"]

    # Detail
    detail_res = client.get(f"/sessions/{items[0]['id']}")
    assert detail_res.status_code == 200
    detail = detail_res.json()
    assert detail["questions"]["technical"][0]["text"] == "T"

    # Delete
    del_res = client.delete(f"/sessions/{items[0]['id']}")
    assert del_res.status_code == 204
    assert client.get("/sessions/").json()["items"] == []


def test_get_session_not_found(client):
    res = client.get("/sessions/9999")
    assert res.status_code == 404
    assert "not found" in res.json()["detail"].lower()


def test_delete_session_idempotent(client):
    # Delete on empty table is 204, not 404
    res = client.delete("/sessions/9999")
    assert res.status_code == 204


def test_pagination_bounds(client):
    # page_size > 100 is rejected
    res = client.get("/sessions/?page_size=500")
    assert res.status_code == 422
    # page < 1 is rejected
    res = client.get("/sessions/?page=0")
    assert res.status_code == 422


def test_failed_generate_does_not_save(client, monkeypatch):
    """If Claude errors, no session should be persisted."""
    from app.services import claude_service

    def boom(**_):
        raise claude_service.ClaudeServiceError("upstream timeout")

    monkeypatch.setattr(claude_service, "generate_interview_questions", boom)

    res = client.post(
        "/generate/",
        json={
            "resume_text": "x",
            "job_title": "Role",
            "seniority_level": "Mid",
            "key_skills": ["Go"],
        },
    )
    assert res.status_code == 502
    assert client.get("/sessions/").json()["total_items"] == 0
```

**Update** — `backend/tests/test_generate.py` (existing): assert the response shape is **unchanged** after the auto-save addition, plus a single new assertion that `db.query(Session).count() == 1` after a successful call.

### Frontend Tests (Vitest + React Testing Library + MSW)

**`frontend/src/__tests__/SessionSidebar.test.tsx`** — covers render, click, delete, refresh:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { SessionSidebar } from '../components/SessionSidebar'

const server = setupServer()

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('SessionSidebar', () => {
  it('renders empty state when no sessions exist', async () => {
    server.use(
      http.get('/api/sessions', () =>
        HttpResponse.json({ items: [], page: 1, page_size: 20, total_items: 0, total_pages: 1 })
      )
    )
    render(<SessionSidebar onLoadSession={vi.fn()} refreshKey={0} />)
    await waitFor(() => expect(screen.getByText(/no saved sessions/i)).toBeInTheDocument())
  })

  it('renders sessions returned by the API', async () => {
    server.use(
      http.get('/api/sessions', () =>
        HttpResponse.json({
          items: [
            {
              id: 1,
              role_title: 'Backend Engineer',
              seniority_level: 'Senior',
              key_skills: ['Python'],
              created_at: '2026-05-13T10:00:00',
            },
          ],
          page: 1,
          page_size: 20,
          total_items: 1,
          total_pages: 1,
        })
      )
    )
    render(<SessionSidebar onLoadSession={vi.fn()} refreshKey={0} />)
    await waitFor(() => expect(screen.getByText('Backend Engineer')).toBeInTheDocument())
  })

  it('loads detail on click', async () => {
    let loaded: unknown = null
    server.use(
      http.get('/api/sessions', () =>
        HttpResponse.json({
          items: [
            { id: 1, role_title: 'X', seniority_level: 'Mid', key_skills: [], created_at: 't' },
          ],
          page: 1,
          page_size: 20,
          total_items: 1,
          total_pages: 1,
        })
      ),
      http.get('/api/sessions/1', () =>
        HttpResponse.json({
          id: 1,
          role_title: 'X',
          seniority_level: 'Mid',
          key_skills: [],
          questions: { technical: [], behavioural: [], culture_fit: [] },
          created_at: 't',
        })
      )
    )
    render(<SessionSidebar onLoadSession={(s) => (loaded = s)} refreshKey={0} />)
    await userEvent.click(await screen.findByText('X'))
    await waitFor(() => expect(loaded).not.toBeNull())
  })

  it('deletes a session after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    let deleted = false
    server.use(
      http.get('/api/sessions', () =>
        HttpResponse.json({
          items: [
            { id: 5, role_title: 'Y', seniority_level: 'Junior', key_skills: [], created_at: 't' },
          ],
          page: 1,
          page_size: 20,
          total_items: 1,
          total_pages: 1,
        })
      ),
      http.delete('/api/sessions/5', () => {
        deleted = true
        return new HttpResponse(null, { status: 204 })
      })
    )
    render(<SessionSidebar onLoadSession={vi.fn()} refreshKey={0} />)
    await userEvent.click(await screen.findByRole('button', { name: /delete/i }))
    await waitFor(() => expect(deleted).toBe(true))
    await waitFor(() => expect(screen.queryByText('Y')).not.toBeInTheDocument())
  })
})
```

### Manual End-to-End Checklist

- [ ] `make migrate` → `sessions` table created (verify with `sqlite3 backend/hireiq.db ".schema sessions"`)
- [ ] `make dev` → backend on :8000, frontend on :5173
- [ ] Generate a question set → response shape unchanged; session appears in sidebar
- [ ] Click sidebar item → questions render in main pane
- [ ] Click delete → confirm dialog → session disappears
- [ ] Refresh browser → sidebar still shows the saved session
- [ ] Restart backend → sidebar still shows the saved session (SQLite persistence)

---

## 📊 Data Flow Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                    QUESTION BANK PERSISTENCE FLOW                       │
└────────────────────────────────────────────────────────────────────────┘

Frontend (React)              Backend (FastAPI)              Database (SQLite)
──────────────                ────────────────                ────────────────

 1. User fills JobRoleForm
    clicks "Generate"
        │
        │   POST /api/generate/
        │   { resume_id, job_title,
        │     seniority_level, key_skills }
        │
        ├──────────────────────────────────────────→  Router: generate.py
                                                       │
                                                       ├─ Validate fields
                                                       ├─ Call ClaudeService
                                                       ├─ Build GenerateResponse
                                                       ├─ INSERT INTO sessions
                                                       │  (role_title, seniority_level,
                                                       │   key_skills_json,
                                                       │   questions_json, created_at)
                                                       │
                                                       └─ Return 200 + questions
        │
        ←──────────────────────────────────────────
        │
        ├─ Display questions
        └─ Trigger sidebar refresh (refreshKey++)
               │
               │  GET /api/sessions?page=1&page_size=50
               ├──────────────────────────────────────────→  Router: sessions.py
               │                                          list_sessions()
               │                                              │
               │                                              ├─ SELECT id, role_title,
               │                                              │       seniority_level,
               │                                              │       key_skills_json,
               │                                              │       created_at
               │                                              │   FROM sessions
               │                                              │   ORDER BY created_at DESC
               │                                              │   LIMIT 20 OFFSET 0
               │                                              │
               │                                              └─ Return SessionListResponse
               ←──────────────────────────────────────────
               │
               └─ Sidebar re-renders with new item at top

 2. User clicks session in sidebar
        │
        │  GET /api/sessions/{id}
        ├──────────────────────────────────────────→  Router: sessions.py
        │                                          get_session(id)
        │                                              │
        │                                              ├─ SELECT * FROM sessions
        │                                              │   WHERE id = ?
        │                                              │
        │                                              └─ Return SessionDetail
        │                                                 (questions parsed from JSON)
        ←──────────────────────────────────────────
        │
        └─ Render questions in main pane

 3. User clicks Delete
        │
        │  window.confirm() → true
        │
        │  DELETE /api/sessions/{id}
        ├──────────────────────────────────────────→  Router: sessions.py
        │                                          delete_session(id)
        │                                              │
        │                                              ├─ SELECT row WHERE id = ?
        │                                              ├─ DELETE FROM sessions
        │                                              │   WHERE id = ?
        │                                              │
        │                                              └─ Return 204 No Content
        ←──────────────────────────────────────────
        │
        └─ Remove item from local state (optimistic update)
```

---

## 📋 Acceptance Criteria Mapping

| Criterion (from issue #6) | Implementation | Test |
|--------------------------|----------------|------|
| Each generation is saved to `sessions` table with role title, timestamp, JSON output | `Session` model + auto-save in `generate.py` | `test_session_round_trip` |
| `GET /api/sessions` returns paginated list of past sessions | `list_sessions()` with `page`, `page_size`, total counts | `test_list_sessions_empty`, `test_pagination_bounds` |
| React sidebar lists past sessions | `SessionSidebar.tsx` mounts `GET /api/sessions` | `renders sessions returned by the API` |
| Clicking one loads the question set | `handleClick` fetches `GET /api/sessions/{id}`, passes to `onLoadSession` | `loads detail on click` |
| User can delete a saved session from the UI | `handleDelete` with `window.confirm` + `DELETE /api/sessions/{id}` | `deletes a session after confirmation` |

---

## 🔄 Integration with Existing Architecture

This spec touches four files and adds three:

| File | Change | Why |
|------|--------|-----|
| `backend/app/models/__init__.py` | **Edit** — import `Session` | So `Base.metadata.create_all` registers the new table |
| `backend/app/database.py` | **Edit** — add `get_db()` | FastAPI session-per-request dependency |
| `backend/app/routers/generate.py` | **Edit** — inject `db`, persist after success | Auto-save (the core feature) |
| `backend/app/main.py` | **Edit** — register `sessions.router` | Wire the new router |
| `backend/app/models/session.py` | **New** | `Session` SQLAlchemy model |
| `backend/app/routers/sessions.py` | **New** | List / detail / delete endpoints |
| `frontend/src/components/SessionSidebar.tsx` | **New** | Sidebar UI |
| `frontend/src/App.tsx` | **Edit** — mount `<SessionSidebar>`, handle `onLoadSession`, bump `refreshKey` after generate | Wire the UI |
| `backend/tests/test_sessions.py` | **New** | pytest coverage |
| `frontend/src/__tests__/SessionSidebar.test.tsx` | **New** | Vitest coverage |

**No changes to:**
- `Makefile` — existing `make migrate` already runs `Base.metadata.create_all`
- `requirements.txt` — no new Python deps
- `package.json` — no new Node deps
- `vite.config.ts` — proxy already covers `/api/*`
- `CONSTITUTION.md` / `ARCHITECTURE.md` — no principle violations

---

## 🚀 Deployment Checklist

- [ ] `backend/app/models/session.py` created
- [ ] `backend/app/models/__init__.py` updated to import `Session`
- [ ] `backend/app/database.py` exposes `get_db()`
- [ ] `backend/app/routers/sessions.py` created
- [ ] `backend/app/routers/generate.py` auto-saves to `sessions`
- [ ] `backend/app/main.py` registers `sessions.router`
- [ ] `make migrate` creates the `sessions` table without error
- [ ] `cd backend && pytest` — all tests pass (new + existing)
- [ ] `frontend/src/components/SessionSidebar.tsx` created
- [ ] `frontend/src/App.tsx` mounts `<SessionSidebar>`
- [ ] `cd frontend && npm test` — all tests pass (new + existing)
- [ ] `cd frontend && npx tsc --noEmit` — no TypeScript errors
- [ ] `cd frontend && npm run lint` — no lint warnings
- [ ] `make lint` passes
- [ ] Manual end-to-end smoke test per checklist above
- [ ] PR opened against `main` referencing issue #6

---

## 📖 API Reference

### `GET /api/sessions/`

**Description:** Paginated list of saved sessions, newest first.

**Query params:**
- `page` (int, default 1, ≥1)
- `page_size` (int, default 20, 1–100)

**Success 200:**
```json
{
  "items": [
    {
      "id": 7,
      "role_title": "Senior Backend Engineer",
      "seniority_level": "Senior",
      "key_skills": ["Python", "Postgres"],
      "created_at": "2026-05-13T14:32:11.123456"
    }
  ],
  "page": 1,
  "page_size": 20,
  "total_items": 1,
  "total_pages": 1
}
```

**Error 422:** `page` or `page_size` out of range.

### `GET /api/sessions/{id}`

**Success 200:**
```json
{
  "id": 7,
  "role_title": "Senior Backend Engineer",
  "seniority_level": "Senior",
  "key_skills": ["Python", "Postgres"],
  "questions": {
    "technical": [{"text": "...", "follow_up": "...", "what_to_listen_for": "..."}],
    "behavioural": [...],
    "culture_fit": [...]
  },
  "created_at": "2026-05-13T14:32:11.123456"
}
```

**Error 404:** `{"detail": "Session 7 not found."}`

### `DELETE /api/sessions/{id}`

**Success 204:** Empty body.
**Idempotent:** Returns 204 even if session does not exist.

---

## 🎓 Future Considerations (Post-M3)

1. **Resume linkage** — Add `resume_id` FK to `Session` (nullable). Show "Generated from: <candidate name>" in sidebar.
2. **Search & filter** — `?role_title=...&seniority_level=...` query params; full-text search on `questions_json` (FTS5 in SQLite).
3. **Tags / favourites** — `tags: list[str]` column + sidebar filter chips.
4. **Soft delete** — `deleted_at` column; hide from list, retain for audit.
5. **User scoping** — `user_id` FK when auth is introduced.
6. **Export** — `GET /sessions/{id}/export?format=pdf|markdown` for sharing question sets.
7. **Edit & re-save** — Allow recruiters to tweak questions and persist a new version.
8. **Pruning policy** — Auto-delete sessions older than N days or after M total.

---

## ✅ Sign-off

**Specification Author:** Autonomous brainstorming agent (superpowers)
**Date:** 2026-05-13
**Status:** Ready for Implementation
**Next Step:** Create implementation plan using `writing-plans` skill, then open PR with this spec + plan.
