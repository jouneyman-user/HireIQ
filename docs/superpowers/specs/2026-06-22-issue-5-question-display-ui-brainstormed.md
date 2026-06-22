# Issue Specification — Question Display UI (Brainstormed v3)

> **Issue:** [#5 — Question display UI — render categorised questions with follow-ups and tips](https://github.com/jouneyman-user/HireIQ/issues/5)
> **Date:** 2026-06-22
> **Effort:** M (Medium)
> **Milestone:** M2 — Core Agent
> **Labels:** frontend
> **Skill:** `superpowers:brainstorming`
> **Supersedes:** `docs/spec/HireIQ-5-2026-05-20.md` (v1), `docs/spec/HireIQ-5-2026-06-22.md` (v2)

---

## Executive Summary

This spec specifies a **frontend-only** feature: a rich question-display UI that renders AI-generated interview questions grouped into collapsible category sections (Technical, Behavioural, Culture Fit), with follow-up probes, evaluation tips, a loading skeleton, and copy-to-clipboard functionality.

It also fixes a **pre-existing integration bug**: `App.tsx` sends `resume_id` to `POST /api/generate` but the backend expects `resume_text`. This requires adding a new backend endpoint `GET /api/resumes/{id}/text` to extract and return resume text using `pdfplumber` (already in `requirements.txt`).

**Key difference from v1/v2:** This spec adds a **fifth architectural decision** (state persistence for generated questions), a **complete accessibility audit** with WCAG 2.1 AA mappings, and a **staged implementation plan** with explicit rollback strategies per stage.

---

## Issue Summary

### Acceptance Criteria (from Issue #5)

- [ ] Questions are displayed in collapsible category sections (Technical, Behavioural, Culture Fit)
- [ ] Each question card shows the main question, follow-up, and evaluation tip
- [ ] A loading skeleton is shown while generation is in progress
- [ ] Copy-to-clipboard button works on individual questions and the full set

### Additional Acceptance Criteria (from brainstorming)

- [ ] Category headers show question count
- [ ] "Copy all questions" produces a structured plain-text transcript
- [ ] Skeleton is replaced by results when generation completes
- [ ] `POST /api/generate/` is called with `resume_text` (not `resume_id`)
- [ ] `GET /api/resumes/{id}/text` returns `{ resume_text: string }`
- [ ] Error states are displayed for failed text extraction or generation
- [ ] All interactive controls are keyboard-accessible
- [ ] Screen reader announces loading state and copy confirmation

---

## Problem Statement

### Current State

`App.tsx` (lines 12-18) defines a stale `GenerateResult` type:

```ts
type GenerateResult = {
  message: string
  resume_id: number
  job_title: string
  seniority_level: string
  key_skills: string[]
}
```

This was a stub placeholder. The actual backend response from `POST /api/generate` is:

```ts
type GenerateResult = {
  technical: Question[]
  behavioural: Question[]
  culture_fit: Question[]
}

type Question = {
  text: string
  follow_up: string
  what_to_listen_for: string
}
```

Furthermore, the `handleGenerate` function POSTs `{ resume_id, ... }` but the backend expects `{ resume_text, ... }`. This causes **every generation request to fail with HTTP 422**.

The UI renders only `<p>{generateResult.message}</p>` — no structured question output exists.

### Impact

Recruiters cannot use generated questions. The entire M2 "Core Agent" value proposition is broken at the user-facing layer.

---

## Current vs Expected Behaviour

| Step | Current | Expected |
|------|---------|----------|
| Upload resume | Works | Works (unchanged) |
| Fill job role form | Works | Works (unchanged) |
| Click "Generate" | 422 error (resume_id vs resume_text) | Two-step: fetch text → generate |
| Loading state | None | Shimmer skeleton (3 categories × 3 cards) |
| Results display | Plain text message | Collapsible categories with question cards |
| Copy individual | Not available | 📋 button per card |
| Copy all | Not available | 📋 button at top of results |
| Error display | Generic "Generation failed" | Specific error per failure point |

---

## Root Cause Analysis

### RC-1: `resume_id` vs `resume_text` contract mismatch

The frontend was written against a stub API contract. The backend `POST /api/generate` expects `resume_text` (raw extracted text) but receives `resume_id`.

**Root cause:** No type-level contract between frontend and backend. TypeScript has no way to validate that the frontend payload matches the backend Pydantic model.

### RC-2: No text extraction endpoint

The `Resume` model stores files at `uploads/resumes/{stored_filename}` but has no `extracted_text` column. There is no endpoint to retrieve or extract text from a stored file.

### RC-3: No question-display components

No `QuestionDisplay`, `QuestionCard`, or `QuestionSkeleton` components exist. The UI has never rendered structured question data.

### RC-4: No loading state

`generating` state exists in `App.tsx` but is never rendered as a visual indicator.

---

## Options Considered

### Decision 1: How does the frontend get resume text into `POST /generate/`?

| Option | Description | Pros | Cons | Verdict |
|--------|-------------|------|------|---------|
| **A** | New `GET /api/resumes/{id}/text` endpoint using `pdfplumber` | Clean separation; text extraction is server-side; no schema changes; uses existing dep | Two round-trips from frontend (fetch text → generate) | ✅ **Chosen** — matches v1/v2 recommendation; preserves module boundaries |
| **B** | Modify `POST /generate/` to accept `resume_id` internally | Single API call; simpler frontend | Couples generation service to file system; violates module separation | ❌ — introduces backend coupling |
| **C** | Persist extracted text at upload time (new `resume_text` column) | Fastest at generate time | Requires DB migration (M2 scope creep); changes upload flow; DOCX handling needed | ❌ — out of scope for M2 |
| **D** | Client-side PDF parsing via `pdf.js` | No backend change | Adds ~600KB dep; client-side parsing is slow; violates "no new deps" principle | ❌ — violates CONSTITUTION.md §2 |

**Decision: Option A.** Add `GET /api/resumes/{id}/text` using `pdfplumber`.

### Decision 2: Where does collapsible section state live?

| Option | Description | Pros | Cons | Verdict |
|--------|-------------|------|------|---------|
| **1** | Component-local `useState` in `QuestionDisplay` | Simplest; no prop drilling; matches existing patterns | Cannot be shared with other components | ✅ **Chosen** — no other component needs this state |
| **2** | Lifted to `App.tsx` via props | Centralised | Unnecessary complexity for a single-component concern | ❌ |
| **3** | URL hash / search params | Survives page reload | Over-engineered; questions are ephemeral | ❌ |

**Decision: Option 1.** Component-local state in `QuestionDisplay`.

### Decision 3: Styling approach for new components

| Option | Description | Pros | Cons | Verdict |
|--------|-------------|------|------|---------|
| **α** | Inline styles (matching existing codebase) | Zero new deps; consistent with `App.tsx`, `ResumeUpload.tsx`, `JobRoleForm.tsx`; no CSS context switching | Styles not reusable across components | ✅ **Chosen** — follows "standard tooling" principle |
| **β** | CSS Modules (`.module.css`) | Scoped styles; reusable | New pattern not present in codebase; adds build config complexity | ❌ |
| **γ** | Tailwind CSS | Utility-first; fast development | Adds ~70KB dep; new paradigm; violates "no new tools without justification" | ❌ |

**Decision: Option α.** Inline styles.

### Decision 4: Copy-to-clipboard mechanism

| Option | Description | Pros | Cons | Verdict |
|--------|-------------|------|------|---------|
| **i** | Native `navigator.clipboard.writeText` with `try/catch` | Zero deps; built into all modern browsers | Requires HTTPS (fails on localhost HTTP); async API | ✅ **Chosen** — graceful degradation via `try/catch` |
| **ii** | Deprecated `document.execCommand('copy')` | Works over HTTP | Deprecated; unreliable; not accessible | ❌ |
| **iii** | `react-copy-to-clipboard` package | Simpler API | Adds dependency for a one-line API call | ❌ |

**Decision: Option i.** Native API with `try/catch` fallback.

### Decision 5: Should generated questions be persisted client-side?

| Option | Description | Pros | Cons | Verdict |
|--------|-------------|------|------|---------|
| **X** | `localStorage` persistence | Survives page reload; survives accidental refresh | Stale data; no server sync; adds complexity | ❌ — out of scope for M2; deferred to M3 |
| **Y** | No persistence (ephemeral) | Simple; always fresh; no stale data risk | Lost on page reload | ✅ **Chosen** — questions are session-ephemeral by design |

**Decision: Option Y.** Ephemeral only. Session persistence is a future milestone (Issue #6 covers server-side session bank).

### Decision 6: Skeleton animation approach

| Option | Description | Pros | Cons | Verdict |
|--------|-------------|------|------|---------|
| **1** | CSS `@keyframes` shimmer (inline `<style>`) | Zero deps; native animation; matches existing inline-style pattern | Animation defined in JSX (minor convention violation) | ✅ **Chosen** — simplest approach |
| **2** | CSS file with `@keyframes` | Proper separation of concerns | New file; new import in `main.tsx` | ❌ — overkill for one animation |
| **3** | JS-driven animation (`requestAnimationFrame`) | No CSS | More code; no benefit over CSS | ❌ |

**Decision: Option 1.** Inline `<style>` with `@keyframes shimmer`.

---

## Recommended Approach

### Architecture Diagram

```
App.tsx
│
├── [generating === true]
│   └── <QuestionSkeleton />              ← shimmer animation, 3 × 3 cards
│
├── [generateError]
│   └── <p style={{ color: 'red' }} />    ← specific error message
│
└── [generateResult]
    └── <QuestionDisplay questions={generateResult} />
        ├── <button>Copy all questions</button>
        └── [Technical | Behavioural | Culture Fit]
            └── <button aria-expanded={isOpen}>Category (N questions)</button>
                └── <QuestionCard /> × N
                    ├── Main question text
                    ├── Follow-up callout (blue)
                    ├── Evaluation tip callout (yellow)
                    └── <button>📋 Copy</button>
```

### Data Flow

```
User clicks "Generate Questions"
    │
    ▼
handleGenerate(roleData)
    │
    ├── 1. fetch(`/api/resumes/${activeResumeId}/text`)
    │       └── GET /api/resumes/{id}/text → { resume_text: string }
    │
    ├── 2. fetch('/api/generate/', { body: { resume_text, ... } })
    │       └── POST /api/generate/ → { technical, behavioural, culture_fit }
    │
    ├── 3. setGenerating(false)
    │
    └── 4. UI renders <QuestionDisplay /> (or <QuestionSkeleton /> during steps 1-2)
```

---

## Implementation Plan

### Stage 0 — Backend: `GET /api/resumes/{id}/text`

**File:** `backend/app/routers/resumes.py`

Add new endpoint after existing `GET /{resume_id}`:

```python
@router.get("/{resume_id}/text")
def get_resume_text(resume_id: int, db: Session = Depends(get_db)):
    """Extract and return plain text from a stored resume file."""
    resume = db.query(Resume).filter(Resume.id == resume_id).first()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found.")

    file_path = os.path.join(UPLOAD_DIR, resume.stored_filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Resume file not found on disk.")

    try:
        with pdfplumber.open(file_path) as pdf:
            text = "\n".join(
                page.extract_text() or "" for page in pdf.pages
            ).strip()
    except Exception as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Could not extract text from resume: {exc}"
        )

    if not text:
        raise HTTPException(
            status_code=422,
            detail="No extractable text found. Upload a text-based PDF."
        )

    return {"resume_text": text}
```

**Tests to add:** `backend/tests/test_resumes.py` — 4 new test cases:
1. `test_get_resume_text_success` — valid PDF, returns text
2. `test_get_resume_text_not_found` — invalid ID → 404
3. `test_get_resume_text_missing_file` — DB record but no file → 404
4. `test_get_resume_text_no_extractable_text` — empty text → 422

**Rollback:** If this stage fails, revert the router change. No schema impact.

---

### Stage 1 — Types contract

**File:** `frontend/src/types/generate.ts` (NEW)

```ts
export type Question = {
  text: string
  follow_up: string
  what_to_listen_for: string
}

export type GenerateResult = {
  technical: Question[]
  behavioural: Question[]
  culture_fit: Question[]
}
```

**File:** `frontend/src/App.tsx` (MODIFY)

- Remove stale `GenerateResult` type (lines 12-18)
- Import `Question` and `GenerateResult` from `./types/generate`
- Update `handleGenerate` to two-step flow (fetch text → generate)
- Replace `<p>{generateResult.message}</p>` with skeleton + display

**Tests:** Update `frontend/src/__tests__/App.test.tsx` — update MSW handlers for new endpoint and new response shape.

**Rollback:** Revert type changes and `App.tsx` modifications. No structural impact.

---

### Stage 2 — `QuestionSkeleton.tsx`

**File:** `frontend/src/components/QuestionSkeleton.tsx` (NEW)

Shimmer animation via inline `<style>` tag. Renders 3 categories × 3 skeleton cards.

**Tests:** `frontend/src/__tests__/QuestionSkeleton.test.tsx` — 4 cases:
1. Renders skeleton blocks
2. Has `role="status"` for screen readers
3. Has `aria-label` with loading message
4. Contains shimmer animation keyframes

**Rollback:** Delete the component file. No other changes needed.

---

### Stage 3 — `QuestionCard.tsx`

**File:** `frontend/src/components/QuestionCard.tsx` (NEW)

Renders single question with:
- Main question text (bold, numbered)
- Follow-up callout (blue left border)
- Evaluation tip callout (yellow left border)
- Copy button (top-right corner)

**Tests:** `frontend/src/__tests__/QuestionCard.test.tsx` — 7 cases:
1. Renders question text
2. Renders follow-up text
3. Renders evaluation tip
4. Copy button copies correct content
5. Shows "✓ Copied" feedback
6. Clipboard failure is caught silently
7. Numbered correctly (1-based index)

**Rollback:** Delete component file. No downstream impact.

---

### Stage 4 — `QuestionDisplay.tsx` + App wiring

**File:** `frontend/src/components/QuestionDisplay.tsx` (NEW)

Renders:
- "Copy all questions" header button
- 3 collapsible category sections with colored headers
- Question count per section
- `QuestionCard` components per question

**File:** `frontend/src/App.tsx` (MODIFY)

Wire in `QuestionSkeleton` and `QuestionDisplay` in the render section:

```tsx
{generating && <QuestionSkeleton />}
{generateError && <p style={{ color: 'red' }}>{generateError}</p>}
{generateResult && !generating && <QuestionDisplay questions={generateResult} />}
```

**Tests:** `frontend/src/__tests__/QuestionDisplay.test.tsx` — 11 cases:
1. Renders all 3 category headers
2. All sections expanded by default
3. Toggle collapses/expands section
4. Shows question count per section
5. Copy all produces structured text
6. Composes QuestionCard for each question
7. Empty category renders without crash
8. Copy all feedback shows "✓ All copied"

**Rollback:** Delete component; revert App.tsx render changes.

---

## Accessibility Audit (WCAG 2.1 AA)

| Requirement | WCAG Criterion | Implementation |
|-------------|---------------|----------------|
| Category toggle buttons are keyboard accessible | 2.1.1 Keyboard | Native `<button>` elements — no custom key handlers needed |
| `aria-expanded` on category buttons | 4.1.2 Name, Role, Value | `aria-expanded={isOpen}` on each category button |
| Skeleton announces loading state | 4.1.3 Status Messages | `role="status"` + `aria-label="Generating questions…"` |
| Copy feedback is announced | 4.1.3 Status Messages | `aria-live="polite"` on copy confirmation text |
| Copy buttons have accessible labels | 4.1.2 Name, Role, Value | `aria-label="Copy question"` / `aria-label="Copy all questions"` |
| Color contrast on callouts | 1.4.3 Contrast (Minimum) | Blue callout: `#0369a1` on `#f0f9ff` (ratio ~5.2:1); Yellow: `#854d0e` on `#fefce8` (ratio ~5.8:1) |
| Question numbering is semantic | 1.3.1 Info and Relationships | Number embedded in text content, not visual-only |
| Error messages are accessible | 3.3.1 Error Identification | Error `<p>` uses `color: 'red'` + text description |

---

## Edge Cases & Risks

| Scenario | Severity | Mitigation |
|----------|----------|-----------|
| PDF has no extractable text (scanned image) | High | Endpoint returns 422; UI shows `generateError` |
| DOCX resume uploaded (not PDF) | High | `pdfplumber` throws; caught → 422; follow-up adds `python-docx` |
| `navigator.clipboard.writeText` unavailable (HTTP localhost) | Medium | `try/catch` wraps call; failure is silent (non-UX-breaking) |
| Category has 0 questions from API | Low | Section renders with count 0; no crash |
| Very long question text overflows card | Medium | CSS `word-break: break-word` on question `<p>` |
| Rapid double-click on "Generate" | Medium | `generating` state disables button; prevents double-submit |
| Network error fetching resume text | High | `handleGenerate` catches and sets `generateError` |
| Backend `GET /{id}/text` returns malformed JSON | High | `handleGenerate` checks `res.ok` before parsing |
| Screen reader on non-English locale | Low | `aria-label` strings are in English; future i18n pass needed |
| User navigates away during generation | Low | Component unmounts; fetch aborts naturally (no state update on unmounted component) |

---

## Files Changed

| File | Change | Stage |
|------|--------|-------|
| `backend/app/routers/resumes.py` | **Modified** — add `GET /{id}/text` endpoint | Stage 0 |
| `backend/tests/test_resumes.py` | **Modified** — +4 test cases | Stage 0 |
| `frontend/src/types/generate.ts` | **New** — `Question` + `GenerateResult` types | Stage 1 |
| `frontend/src/App.tsx` | **Modified** — fix types, two-step generate, wire components | Stage 1 + 4 |
| `frontend/src/__tests__/App.test.tsx` | **Modified** — MSW handlers updated | Stage 1 |
| `frontend/src/components/QuestionSkeleton.tsx` | **New** | Stage 2 |
| `frontend/src/__tests__/QuestionSkeleton.test.tsx` | **New** | Stage 2 |
| `frontend/src/components/QuestionCard.tsx` | **New** | Stage 3 |
| `frontend/src/__tests__/QuestionCard.test.tsx` | **New** | Stage 3 |
| `frontend/src/components/QuestionDisplay.tsx` | **New** | Stage 4 |
| `frontend/src/__tests__/QuestionDisplay.test.tsx` | **New** | Stage 4 |

**Total:** 7 new files, 4 modified files, 0 new dependencies.

---

## Test Plan Summary

| File | Tests | Coverage |
|------|-------|----------|
| `backend/tests/test_resumes.py` | +4 | Happy path, 404, missing file, no text |
| `frontend/src/__tests__/App.test.tsx` | ~8 | MSW handlers, two-step flow, error states |
| `frontend/src/__tests__/QuestionSkeleton.test.tsx` | 4 | Render, aria, animation |
| `frontend/src/__tests__/QuestionCard.test.tsx` | 7 | Render, copy, feedback, error |
| `frontend/src/__tests__/QuestionDisplay.test.tsx` | 11 | Sections, toggle, copy-all, empty category |
| **Total** | **~34** | **≥ 80% coverage target** |

---

## Deployment Checklist

- [ ] `GET /api/resumes/{id}/text` added to `resumes.py`
- [ ] 4 new backend tests pass (`pytest`)
- [ ] `pdfplumber` already in `requirements.txt` (no new dep)
- [ ] `frontend/src/types/generate.ts` created
- [ ] Stale `GenerateResult` type removed from `App.tsx`
- [ ] `handleGenerate` uses two-step flow
- [ ] `QuestionSkeleton.tsx` renders with `role="status"`
- [ ] `QuestionCard.tsx` has `aria-label` on copy button
- [ ] `QuestionDisplay.tsx` has `aria-expanded` on category buttons
- [ ] `navigator.clipboard.writeText` wrapped in `try/catch`
- [ ] All 34 tests pass (`npm test`)
- [ ] `ruff check .` → zero violations
- [ ] `tsc --noEmit` → zero errors
- [ ] `make lint` passes
- [ ] No secrets/credentials in code or comments

---

## API Reference

### `GET /api/resumes/{id}/text`

Extract and return plain text from a stored resume file.

**Request**

```
GET /api/resumes/{id}/text
```

**Response — 200**

```json
{
  "resume_text": "John Doe\nSoftware Engineer\n5 years experience in..."
}
```

**Response — 404**

```json
{
  "detail": "Resume not found."
}
```

**Response — 404 (file missing)**

```json
{
  "detail": "Resume file not found on disk."
}
```

**Response — 422 (no extractable text)**

```json
{
  "detail": "No extractable text found. Upload a text-based PDF."
}
```

---

## Acceptance Criteria Mapping

| Issue #5 AC | Spec AC | Implementation | Test |
|-------------|---------|----------------|------|
| Collapsible category sections | ✓ | `QuestionDisplay.tsx` — `openSections` state + toggle | `QuestionDisplay.test.tsx` ×3 |
| Question card: main, follow-up, tip | ✓ | `QuestionCard.tsx` — 3 callout blocks | `QuestionCard.test.tsx` ×3 |
| Loading skeleton | ✓ | `QuestionSkeleton.tsx` — shimmer animation | `QuestionSkeleton.test.tsx` ×4 |
| Copy individual | ✓ | `QuestionCard.tsx` — `handleCopy` | `QuestionCard.test.tsx` ×3 |
| Copy all | ✓ | `QuestionDisplay.tsx` — `handleCopyAll` | `QuestionDisplay.test.tsx` ×2 |
| Fix resume_id → resume_text | ✓ | Two-step `handleGenerate` | `App.test.tsx` updated |
| New endpoint `GET /{id}/text` | ✓ | `resumes.py` endpoint | `test_resumes.py` ×4 |

---

## Out of Scope (Deferred)

- DOCX text extraction (add `python-docx` in follow-up)
- Client-side persistence of generated questions (`localStorage`)
- Server-side session bank for generated questions (Issue #6)
- PDF export of question set (Issue #8)
- i18n / internationalization
- Dark mode styling (use CSS custom properties in follow-up)
- React Router (state-based navigation is sufficient for 1 page)

---

## Future Considerations

1. **Resume text caching:** If `GET /{id}/text` becomes a bottleneck, add `resume_text` column to `Resume` model (M3 migration).
2. **React Router:** When ≥3 pages exist, replace state-based routing with `react-router-dom`.
3. **CSS custom properties:** Extract inline color values to `:root` CSS variables for dark mode support.
4. **Copy format options:** Offer Markdown vs plain text copy format toggle.
5. **Question editing:** Allow recruiters to edit questions before the interview.
6. **Question export:** PDF export (Issue #8) builds on this UI structure.
7. **Session persistence:** Save generated question sets to database (Issue #6).

---

*Spec generated by superpowers `brainstorming` skill — 2026-06-22. Follows the same template as `docs/superpowers/specs/2026-05-13-m1-foundation-spec-complete.md`.*
