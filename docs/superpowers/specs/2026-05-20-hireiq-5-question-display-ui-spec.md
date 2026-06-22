# 🔍 Technical Specification — HireIQ #5: Question Display UI

> **Issue:** [#5 — Question display UI — render categorised questions with follow-ups and tips](https://github.com/jouneyman-user/HireIQ/issues/5)
> **Skill used:** `superpowers:brainstorming` (autonomous analysis, no user interaction required)
> **Date:** 2026-05-20
> **Effort:** M (Medium)
> **Milestone:** M2 — Core Agent
> **Labels:** `frontend`
> **Status:** ✅ Approved for implementation (supersedes `docs/spec/HireIQ-5-2026-05-20.md` with added Options-Considered depth)

---

## 🔎 Problem Summary

Milestone 2's `POST /api/generate/` (Issue #4) returns structured interview questions, but the React frontend has no meaningful UI to render them. The current `App.tsx` displays only a plain-text success message using a **stale type** and **wrong payload**, causing every generate request to fail with HTTP 422 in production. Even if the request succeeded, there is no copy-to-clipboard, no loading skeleton, and no per-category collapsible structure.

### Issue Acceptance Criteria (verbatim)

- [ ] Questions are displayed in collapsible category sections (Technical, Behavioural, Culture Fit)
- [ ] Each question card shows the main question, follow-up, and evaluation tip
- [ ] A loading skeleton is shown while generation is in progress
- [ ] Copy-to-clipboard button works on individual questions and the full set

### Key Constraints (from `CONSTITUTION.md`, `ARCHITECTURE.md`, `AGENTS.md`)

- **No new CSS frameworks** — the project uses inline styles throughout; introducing Tailwind / CSS-in-JS requires explicit justification
- **No `dangerouslySetInnerHTML`** without sanitization (`SECURITY.md`)
- **No `allow_origins=["*"]`** — CORS must remain explicit
- **Module boundary** — `backend/` and `frontend/` communicate only via HTTP; no shared imports
- **Standard tooling** — `pip`, `npm`, `make` suffice; no new managers
- **TDD preferred** — tests written before or alongside implementation (see `UNIT_TESTING.md`)
- **MSW for frontend tests** — mock API calls at the network layer, not via component props
- **No secrets in code, comments, or commit messages**

---

## 💡 Options Considered

### Architectural Option Set

This issue has **four** independent architectural decisions. Each is considered below.

---

### Decision 1 — How does the frontend get the resume text into `POST /api/generate/`?

#### Option A — Two-step: new `GET /api/resumes/{id}/text` endpoint ✅ RECOMMENDED

Add a new backend endpoint that opens the stored PDF and returns `{ resume_text: string }`. Frontend calls this first, then POSTs to `/api/generate/`.

**Pros:**
- Clean separation of concerns — generation service is decoupled from the filesystem
- Reusable — future endpoints (preview, search) can also call `/text`
- No DB migration required — existing `resumes` table stays untouched
- `pdfplumber` is already in `requirements.txt` (per Issue #2)
- Preserves the existing API contract for `/generate/`

**Cons:**
- Two round-trips from the frontend (~50–100ms extra latency)
- Text is not cached — re-extraction on every generate (acceptable: ~0.5–2s extraction)

#### Option B — Modify `/generate/` to accept `resume_id`

Backend reads the file from disk and extracts text internally inside `/generate/`.

**Pros:**
- One API call from the frontend — simpler client code

**Cons:**
- Couples the generation service to the filesystem (violates single-responsibility)
- `/generate/` would need both upload-time *and* generate-time behaviour, complicating tests
- Any future caller of `/generate/` (CLI, alternate UI) must also have access to the file path — not portable

#### Option C — Persist extracted text at upload time (new DB column)

Add `resume_text TEXT` to the `resumes` table; populate on upload.

**Pros:**
- Fastest at generate time (no re-extraction)

**Cons:**
- Requires a migration and changes the upload flow (Issue #2 is already merged — would be a breaking change)
- Duplicates derived state in the DB (cache invalidation if extractor changes)
- Larger SQLite rows for text-heavy resumes
- Out of scope: the issue's AC explicitly says "render generated questions", not "persist resume text"

**Decision:** **Option A.** Adds a single small endpoint, doesn't touch the schema, doesn't change upload-time behaviour, and is fully reversible if we later move to Option C.

---

### Decision 2 — Where should the collapsible section state live?

#### Option 1 — Component-local state (`useState` in `QuestionDisplay`) ✅ RECOMMENDED

Each instance of `QuestionDisplay` owns its own `openSections` state.

**Pros:**
- Simplest — no global store required
- No cross-component coupling
- Fits `AGENTS.md` rule: "use `useState` + `useEffect` at M1; no global state manager yet"
- Default-open state is the only behaviour we need (no persistence requirement in AC)

**Cons:**
- State is lost if the component is unmounted (acceptable — user must click "Generate" again)

#### Option 2 — Lift state to `App.tsx`

`App.tsx` owns `openSections` and passes them down with toggle callbacks.

**Pros:**
- Easier to programmatically collapse all sections (e.g., for a future "print" view)

**Cons:**
- Adds prop drilling with no current consumer
- Violates the principle of putting state where it's used

#### Option 3 — URL hash / query param persistence

`#culture_fit=closed` so reload preserves section state.

**Pros:**
- Shareable, refreshable

**Cons:**
- Not in AC
- Adds complexity disproportionate to current need

**Decision:** **Option 1.** Component-local state is the simplest thing that meets AC. Migration path to Option 2 or 3 is straightforward if needed later.

---

### Decision 3 — Styling approach for the new components

#### Option α — Inline styles (consistent with existing components) ✅ RECOMMENDED

All three new components (`QuestionCard`, `QuestionDisplay`, `QuestionSkeleton`) use inline `style={…}` props — identical pattern to `JobRoleForm.tsx`, `ResumeUpload.tsx`, `ResumeList.tsx`.

**Pros:**
- **Zero new dependencies** — fits `CONSTITUTION.md` "standard tooling" rule
- Consistent with the rest of the codebase (no visual or DX inconsistency)
- Trivially testable (`getComputedStyle` not required — Vitest renders correctly)
- No build-time CSS pipeline needed

**Cons:**
- No media queries / `:hover` / animations beyond CSS keyframes injected via `<style>` blocks
- Verbose for complex components

#### Option β — Tailwind CSS

Add `tailwindcss`, `postcss`, `autoprefixer` and a `tailwind.config.js`.

**Pros:**
- Smaller HTML payloads (utility classes vs. long inline style objects)
- Easier to add responsive / theme behaviour later

**Cons:**
- Adds **3 new dev dependencies** to `frontend/`
- Inconsistent with existing components — every other file would also need conversion
- Requires a build step (`@tailwindcss/postcss` or Vite plugin)
- Violates "no new tools without justification" until the team grows past M2

#### Option γ — CSS Modules

`QuestionCard.module.css` co-located with each component.

**Pros:**
- Scoped class names
- Supports pseudo-classes and media queries

**Cons:**
- Still inconsistent with current codebase
- Adds file count without clear benefit at this milestone

**Decision:** **Option α.** Matches the existing codebase; zero new deps; trivially testable.

---

### Decision 4 — Copy-to-clipboard mechanism

#### Option i — `navigator.clipboard.writeText` with `try/catch` ✅ RECOMMENDED

Standard Web Clipboard API, wrapped in `try/catch` to silently fail on non-HTTPS / older browsers.

**Pros:**
- Zero dependencies
- Async, non-blocking
- User-gesture compliant (called from `onClick`)

**Cons:**
- Requires HTTPS in production (handled by deployment); Vite's dev server is HTTP — clipboard will silently fail in dev. The `try/catch` covers this.

#### Option ii — `document.execCommand("copy")`

Legacy fallback using a hidden `<textarea>`.

**Pros:**
- Works on HTTP

**Cons:**
- Deprecated — `execCommand` is marked obsolete in the MDN spec
- Synchronous, can block the main thread
- Awkward UX (must append textarea, select, remove)

#### Option iii — `react-copy-to-clipboard` library

`npm install react-copy-to-clipboard`.

**Pros:**
- Battle-tested edge-case handling
- Provides a built-in `<CopyToClipboard>` component

**Cons:**
- Adds a dependency for ~10 lines of code
- Last published 3+ years ago — project maintenance risk

**Decision:** **Option i.** Native API with graceful failure. Matches "no new tools" rule.

---

## ✅ Recommended Approach

A **coordinated frontend + backend change** delivered in a single PR:

1. **Backend:** Add `GET /api/resumes/{id}/text` (Decision 1, Option A) using `pdfplumber`.
2. **Frontend types:** Replace the stale `GenerateResult` in `App.tsx` with the real `{ technical, behavioural, culture_fit }` contract.
3. **Frontend flow:** `handleGenerate` becomes two-step — fetch text, then POST.
4. **Three new components** (component-local state, inline styles, native clipboard):
   - `QuestionCard` — main Q + follow-up callout + eval-tip callout + per-card 📋 copy
   - `QuestionSkeleton` — shimmer skeleton with `role="status"` and `aria-label`
   - `QuestionDisplay` — collapsible coloured category sections + "Copy all" button
5. **App.tsx render:** Replace `{generateResult.message}` with `<QuestionSkeleton>` while loading and `<QuestionDisplay>` on success.
6. **Tests:** Vitest tests for all three components; pytest tests for the new endpoint; update `App.test.tsx` MSW handlers to the real response shape.

### Why This Approach

- **AC alignment:** Each AC maps directly to a deliverable (see [Acceptance Criteria Mapping](#-acceptance-criteria-mapping)).
- **Constitution compliance:** No new tooling, no wildcard CORS, no cross-module imports, all secrets out of code, idempotent migrations (no migration needed).
- **Architecture compliance:** Backend module owns API + DB; frontend module owns React components + client state. Communication is exclusively via HTTP through the existing Vite proxy.
- **Security compliance:** No `dangerouslySetInnerHTML`; `navigator.clipboard` wrapped in `try/catch`; no user-provided content is rendered as HTML.
- **Testing compliance:** TDD-style — backend tests first, then frontend tests, then implementation. MSW mocks at network layer (per `UNIT_TESTING.md`).
- **Reversibility:** All four architectural decisions can be revisited without breaking the API contract.

---

## ⚙️ Implementation Steps

### Step 1 — Backend: `GET /api/resumes/{id}/text`

**File:** `backend/app/routers/resumes.py` (modified)

```python
import os
import io
import pdfplumber
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.resume import Resume

router = APIRouter(prefix="/resumes", tags=["resumes"])

UPLOAD_DIR = os.getenv("RESUME_UPLOAD_DIR", "uploads/resumes")


@router.get("/{resume_id}/text")
def get_resume_text(resume_id: int, db: Session = Depends(get_db)):
    """Extract and return the raw text from a stored resume PDF.

    Returns:
        200: {"resume_text": "<extracted text>"}
        404: Resume DB record not found OR file missing on disk
        422: pdfplumber could not extract any text (scanned image, encrypted, etc.)
    """
    resume = db.query(Resume).filter(Resume.id == resume_id).first()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found.")

    file_path = os.path.join(UPLOAD_DIR, resume.stored_filename)
    if not os.path.exists(file_path):
        raise HTTPException(
            status_code=404,
            detail="Resume file not found on disk.",
        )

    try:
        with pdfplumber.open(file_path) as pdf:
            text = "\n".join(
                page.extract_text() or "" for page in pdf.pages
            ).strip()
    except Exception as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Could not extract text from resume: {exc}",
        ) from exc

    if not text:
        raise HTTPException(
            status_code=422,
            detail=(
                "No extractable text found in this resume. "
                "Please upload a text-based PDF (not a scanned image)."
            ),
        )

    return {"resume_text": text}
```

**Note:** `pdfplumber>=0.11.0` must be present in `backend/requirements.txt`. Per Issue #2, this dependency was already added but verify before committing.

### Step 2 — Frontend types (`frontend/src/App.tsx`)

Replace the stale `GenerateResult` with the real shape:

```ts
type Question = {
  text: string
  follow_up: string
  what_to_listen_for: string
}

type GenerateResult = {
  technical: Question[]
  behavioural: Question[]
  culture_fit: Question[]
}
```

### Step 3 — Frontend `handleGenerate` (`frontend/src/App.tsx`)

Two-step flow: fetch resume text, then POST to generate.

```ts
const handleGenerate = async (roleData: JobRoleData) => {
  if (!activeResumeId) return
  setGenerating(true)
  setGenerateResult(null)
  setGenerateError(null)

  try {
    // Step 1: fetch extracted resume text
    const textRes = await fetch(`/api/resumes/${activeResumeId}/text`)
    const textData = await textRes.json()
    if (!textRes.ok) {
      throw new Error(textData.detail ?? "Could not read resume text.")
    }

    // Step 2: generate questions
    const res = await fetch("/api/generate/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resume_text: textData.resume_text,
        job_title: roleData.jobTitle,
        seniority_level: roleData.seniorityLevel,
        key_skills: roleData.keySkills,
      }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail ?? `HTTP ${res.status}`)
    setGenerateResult(data as GenerateResult)
  } catch (err: unknown) {
    setGenerateError(err instanceof Error ? err.message : "Generation failed.")
  } finally {
    setGenerating(false)
  }
}
```

### Step 4 — `QuestionCard` component (`frontend/src/components/QuestionCard.tsx`)

- Receives `question` and `index` props
- Renders the question (with 1-based index prefix), follow-up callout (blue), eval-tip callout (yellow), and a per-card 📋 Copy button
- Copy button shows "✓ Copied" feedback for 2 seconds after success
- Uses inline styles; uses `useState` for local `copied` flag
- `navigator.clipboard.writeText` wrapped in `try/catch`

### Step 5 — `QuestionDisplay` component (`frontend/src/components/QuestionDisplay.tsx`)

- Receives `questions: { technical, behavioural, culture_fit }`
- Three collapsible sections, each with a coloured header showing category name + question count + collapse chevron
- All sections default to open
- Component-local `openSections` state (one boolean per category)
- "📋 Copy all questions" button at top — writes all categories formatted with `=== Section ===` headers
- Composes `QuestionCard` for each question
- Uses `aria-expanded` on collapsible header buttons

### Step 6 — `QuestionSkeleton` component (`frontend/src/components/QuestionSkeleton.tsx`)

- Renders three category sections × three card placeholders with shimmer animation
- Wrapped in `<div role="status" aria-label="Generating questions…">` for screen readers
- Animation via inline `<style>` block injecting `@keyframes shimmer`
- No props

### Step 7 — `App.tsx` render swap

Replace:
```tsx
{generateResult && <p style={{ color: "green" }}>{generateResult.message}</p>}
```

With:
```tsx
{generating && <QuestionSkeleton />}
{generateResult && !generating && <QuestionDisplay questions={generateResult} />}
```

And update the `JobRoleForm` disabled prop:
```tsx
<JobRoleForm
  onSubmit={handleGenerate}
  disabled={!activeResumeId || generating}
/>
```

---

## ⚠️ Risks & Edge Cases

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|-----------|
| 1 | PDF contains only raster images (scanned resume) | Medium | UX: 422 error to user | `get_resume_text` catches empty text → 422 with friendly message; `App.tsx` shows it as `generateError` in red |
| 2 | DOCX resume uploaded but pdfplumber can't open it | Medium | UX: 422 error | Catch in `get_resume_text` → 422 with exception message. Document DOCX support as a follow-up issue |
| 3 | `navigator.clipboard.writeText` unavailable (non-HTTPS, older browser) | High in dev, low in prod | UX: copy button silently does nothing | Wrap in `try/catch` in both `QuestionCard` and `QuestionDisplay`; production deployment is over HTTPS so prod works |
| 4 | `navigator.clipboard` undefined in jsdom test environment | Certain | Test failure | Each test file mocks `navigator.clipboard` via `Object.defineProperty` before tests |
| 5 | User double-clicks "Generate Questions" | Low | Duplicate request, wasted Claude API quota | `disabled={!activeResumeId \|\| generating}` on `JobRoleForm` |
| 6 | Backend returns a category with 0 questions (LLM edge case) | Low | Empty section | `QuestionDisplay` renders header with "0 questions" and empty body — no crash |
| 7 | Existing `App.test.tsx` tests rely on stale mock shape | Medium | CI red | Phase 8 of the implementation plan updates the MSW handler to the real shape; existing 8 tests don't exercise generate flow so they remain green |
| 8 | Long question text overflows the card | Low | Visual breakage | `wordBreak: "break-word"` on outer card `div` |
| 9 | Race condition: two generate calls overlap | Low | Confusing state | `setGenerating(true)` at the start disables the button; second click impossible |
| 10 | `pdfplumber` raises on a corrupted PDF | Low | 422 error | `try/except Exception` in `get_resume_text` catches it; message includes exception details |
| 11 | Backend `/api/resumes/{id}/text` called with unknown ID | Low | API error | Returns 404 with `"Resume not found."`; frontend shows as `generateError` |
| 12 | Secrets in error messages (PII in resume text) | Low | Privacy | Error messages contain only the file path and exception summary, never resume content |

---

## 📌 Assumptions

1. **`pdfplumber` is already in `backend/requirements.txt`** per Issue #2 — verify before implementing; add only if missing.
2. **`POST /api/generate/` returns `{ technical, behavioural, culture_fit }`** with each value being `[{ text, follow_up, what_to_listen_for }]`. This is the contract established in Issue #4.
3. **PDF is the primary resume format** for M2. DOCX is explicitly out of scope and handled as a graceful 422.
4. **The 3 categories always exist** in the API response (even if some are empty arrays). This matches the Issue #4 contract.
5. **No authentication is in place** for M2. All endpoints are public (consistent with Issues #2, #3, #4).
6. **Vite dev server is HTTP** — `navigator.clipboard.writeText` will silently fail in dev. Tests mock it. Production deploy will be HTTPS.
7. **No persistence of generated question sets** — every "Generate" call hits the Claude API afresh. Consistent with Issue #4's design.
8. **The `JobRoleForm` already passes `disabled` prop** — verify; if not, add it as part of this change.
9. **`uploads/resumes/` is the existing upload directory** — verify in `resumes.py`; if different, update the `UPLOAD_DIR` reference.
10. **No backend rate limiting is in scope** for M2; Claude API costs are bounded by user-driven "Generate" clicks only.

---

## 🧪 Testing Strategy

### Backend — `pytest`

**File:** `backend/tests/test_resumes.py` (4 new tests appended)

| # | Test name | Asserts |
|---|-----------|---------|
| 1 | `test_get_resume_text_404_for_missing_id` | `GET /resumes/99999/text` → 404 |
| 2 | `test_get_resume_text_404_when_file_missing_on_disk` | Upload a resume, delete the file, `GET /text` → 404 |
| 3 | `test_get_resume_text_422_for_non_text_pdf` | Upload a fake PDF with no extractable text, `GET /text` → 422 |
| 4 | `test_get_resume_text_returns_resume_text` | Upload a real text-bearing PDF, `GET /text` → 200 with `{ resume_text: <str> }` |

### Frontend — `Vitest` + `@testing-library/react`

#### `frontend/src/__tests__/QuestionCard.test.tsx` (7 tests)

- Renders the main question text
- Renders the 1-based index prefix
- Renders the follow-up text
- Renders the evaluation tip text
- Renders a copy button with `aria-label="Copy question"`
- Calls `clipboard.writeText` with formatted content (`Q{n}: ...\nFollow-up: ...\nTip: ...`)
- Shows "✓ Copied" feedback after clicking copy

#### `frontend/src/__tests__/QuestionSkeleton.test.tsx` (4 tests)

- Renders an element with `role="status"`
- Has `aria-label="Generating questions…"`
- Renders all three category section skeletons
- Renders ≥ 9 card placeholders (3 per category × 3 categories)

#### `frontend/src/__tests__/QuestionDisplay.test.tsx` (11 tests)

- Renders the "Generated Questions" heading
- Renders all three category section headers
- Shows question count in each section header
- Renders all 9 cards by default (all sections expanded)
- Collapses a section when its header is clicked
- Re-expands a section when its header is clicked again
- Section header has `aria-expanded="true"` when open
- Section header has `aria-expanded="false"` when collapsed
- Renders a "Copy all questions" button
- Calls `clipboard.writeText` with all categories formatted (`=== Technical ===` etc.) when copy-all clicked
- Renders an empty section gracefully (0 questions in a category)

#### `frontend/src/__tests__/App.test.tsx` (modified MSW handlers)

- Add `http.get('/api/resumes/:id/text', …)` returning `{ resume_text: "..." }`
- Update `http.post('/api/generate/', …)` to return 200 with the real `{ technical, behavioural, culture_fit }` shape (was 202 stub)
- All 8 existing tests must continue to pass (they don't exercise the generate flow)

### Manual smoke test (requires `ANTHROPIC_API_KEY`)

```bash
# Terminal 1
cd backend && uvicorn app.main:app --port 8000

# Terminal 2
cd frontend && npm run dev

# Browser: http://localhost:5173
# 1. Upload a text-based PDF
# 2. Fill in Job Role form → click "Generate Questions"
# 3. Verify shimmer skeleton appears
# 4. Verify 3 collapsible sections appear with question counts
# 5. Click a section header → collapses. Click again → expands
# 6. Click 📋 Copy on a card → clipboard contains formatted text
# 7. Click "📋 Copy all questions" → clipboard contains all categories
# 8. Upload a scanned-image PDF → red error message appears
```

---

## 📊 Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    QUESTION DISPLAY UI FLOW (Issue #5)                   │
└─────────────────────────────────────────────────────────────────────────┘

Frontend (React)              Backend (FastAPI)              External
──────────────                ────────────────              ─────────────
                                                              Claude API
                                                                  ▲
  Click "Generate"                                                 │
       │                                                           │
       ▼                                                           │
  handleGenerate(roleData)                                         │
       │                                                           │
       ├─ Step 1: GET /api/resumes/{id}/text  ──────► FastAPI      │
       │                              │                             │
       │                              ├─ pdfplumber.open(file)      │
       │                              ├─ extract_text() per page    │
       │                              └─ return { resume_text }     │
       │                                                           │
       ◄────────── { resume_text: "..." } ◄────────                 │
       │                                                           │
       ├─ Step 2: POST /api/generate/                              │
       │         body: { resume_text, job_title,                    │
       │                  seniority_level, key_skills }             │
       │                              │                             │
       │                              ├─ Build Claude prompt        │
       │                              ├─ anthropic.messages.create()│ ───►
       │                              │                             │
       │                              ◄─── { technical: [...],      │
       │                                    behavioural: [...],     │
       │                                    culture_fit: [...] } ◄──
       │                                                           │
       ◄─────── GenerateResult ◄────────                            │
       │                                                           │
       ├─ setGenerating(false)                                      │
       ├─ setGenerateResult(data)                                   │
       │                                                           │
       ▼                                                           │
  Render:                                                           │
  {generating && <QuestionSkeleton />}                              │
  {generateResult && !generating && <QuestionDisplay .../>}         │
       │                                                           │
       ▼                                                           │
  QuestionDisplay                                                  │
  ├── "📋 Copy all questions" button                               │
  └── [Technical | Behavioural | Culture Fit]                      │
       └── collapsible section                                     │
            └── QuestionCard × N                                   │
                 └── "📋 Copy" button ──► navigator.clipboard      │
```

---

## 📋 Acceptance Criteria Mapping

| Issue AC | Implementation | Test |
|----------|----------------|------|
| Questions displayed in collapsible category sections (Technical, Behavioural, Culture Fit) | `QuestionDisplay` renders 3 `CATEGORY_ORDER` sections with `toggleSection` handler and `aria-expanded` | `QuestionDisplay.test.tsx`: "collapses a section when its header is clicked", "section header has aria-expanded" |
| Each question card shows the main question, follow-up, and evaluation tip | `QuestionCard` renders all three fields with distinct visual treatment (bold / blue callout / yellow callout) | `QuestionCard.test.tsx`: 4 render tests |
| A loading skeleton is shown while generation is in progress | `App.tsx` renders `<QuestionSkeleton />` when `generating === true` | `QuestionSkeleton.test.tsx`: 4 tests; `App.test.tsx`: skeleton appears during in-flight generate |
| Copy-to-clipboard button works on individual questions and the full set | `QuestionCard.handleCopy` and `QuestionDisplay.handleCopyAll` both use `navigator.clipboard.writeText` | `QuestionCard.test.tsx`: "calls clipboard.writeText"; `QuestionDisplay.test.tsx`: "calls clipboard.writeText when Copy all clicked" |

**Bonus AC (from this spec, beyond the issue):**
- Stale `GenerateResult` type fixed → covered by `tsc --noEmit` and existing `App.test.tsx` MSW handler update
- `resume_id` → `resume_text` payload fixed → covered by updated `handleGenerate` and MSW handler
- `GET /api/resumes/{id}/text` endpoint → covered by 4 new backend tests
- Error states (scanned PDF, missing file, missing ID) → covered by `get_resume_text` returning 404/422 and `App.tsx` `generateError` rendering

---

## 🚀 Deployment Checklist

- [ ] Verify `pdfplumber>=0.11.0` is in `backend/requirements.txt`; add if missing
- [ ] `backend/app/routers/resumes.py` — add `GET /{resume_id}/text`
- [ ] `backend/tests/test_resumes.py` — add 4 tests for `/text` endpoint
- [ ] `cd backend && pytest -v` → all green
- [ ] `cd backend && ruff check .` → no violations
- [ ] `frontend/src/App.tsx` — replace stale types, update `handleGenerate`, import + render new components
- [ ] `frontend/src/components/QuestionCard.tsx` — create
- [ ] `frontend/src/components/QuestionDisplay.tsx` — create
- [ ] `frontend/src/components/QuestionSkeleton.tsx` — create
- [ ] `frontend/src/__tests__/QuestionCard.test.tsx` — create
- [ ] `frontend/src/__tests__/QuestionDisplay.test.tsx` — create
- [ ] `frontend/src/__tests__/QuestionSkeleton.test.tsx` — create
- [ ] `frontend/src/__tests__/App.test.tsx` — update MSW handlers (add `/text`, update `/generate/`)
- [ ] `cd frontend && npm test` → all green
- [ ] `cd frontend && npx tsc --noEmit` → no errors
- [ ] `cd frontend && npm run lint` → no errors (if eslint configured)
- [ ] Manual smoke test (upload PDF, generate, expand/collapse, copy, copy-all)
- [ ] PR opened against `main`; PR template checklist completed

---

## 📖 API Reference

### `GET /api/resumes/{resume_id}/text` (new)

**Description:** Extract and return raw text from a stored resume PDF.

**Path parameter:** `resume_id` (integer) — DB primary key of the resume

**Success — 200 OK:**
```json
{
  "resume_text": "John Doe\nSenior Software Engineer\n\nExperience:\n- Acme Corp (2020-2024)..."
}
```

**Error — 404 Not Found** (no DB record OR file missing on disk):
```json
{"detail": "Resume not found."}
```
or
```json
{"detail": "Resume file not found on disk."}
```

**Error — 422 Unprocessable Entity** (pdfplumber failed OR no text extracted):
```json
{"detail": "No extractable text found in this resume. Please upload a text-based PDF (not a scanned image)."}
```
or
```json
{"detail": "Could not extract text from resume: <exception message>"}
```

---

## 🎓 Future Considerations (Post-M2)

1. **DOCX support** — add `python-docx` dependency and a parallel `get_resume_text` branch keyed on `resume.original_extension`
2. **Persistent question sets** — add a `question_sets` table to store generated sets for re-display without re-hitting the Claude API (Issue #6 candidates)
3. **Markdown copy** — offer a "📋 Copy as Markdown" alongside plain-text copy for ATS tools
4. **Print view** — a `window.print()`-optimized CSS that auto-collapses all sections
5. **Question regeneration** — "🔄 Regenerate this question" per-card button that re-prompts Claude with the same context for a single replacement
6. **Drag-to-reorder categories** — let recruiters prioritise which categories appear first
7. **Export to PDF** — convert the rendered tree into a downloadable PDF (out of scope for this issue, candidate for Issue #8)
8. **Auth + rate limiting** — restrict `/generate/` to authenticated recruiters with per-day quota
9. **Telemetry** — track which categories recruiters expand, copy, and regenerate to inform future Claude prompt tuning

---

## ✅ Sign-off

**Specification Author:** Super Skills brainstorming agent (`superpowers:brainstorming`)
**Date:** 2026-05-20
**Status:** ✅ Approved for implementation
**Companion document:** `docs/spec/HireIQ-5-2026-05-20.md` (implementation-focused companion, kept for traceability)
**Next step:** Generate implementation plan via `superpowers:writing-plans` (companion: `docs/plan/HireIQ-5-plan.md`)