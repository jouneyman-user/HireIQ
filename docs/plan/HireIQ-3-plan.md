# Implementation Plan

> **Issue:** [#3 — Job role input form — capture role title, seniority, and key skills](https://github.com/jouneyman-user/HireIQ/issues/3)
> **Spec:** [`docs/spec/HireIQ-3.md`](../spec/HireIQ-3.md)
> **Date:** 2026-05-15
> **Effort:** S (Small)
> **Milestone:** M1 — Foundation

---

## Overview

Introduce a `JobRoleForm` React component that collects job title (text), seniority level (dropdown), and key skills (tag input) from the recruiter. Wire this form into `App.tsx` so it submits combined role + resume data to a new `POST /generate` FastAPI endpoint. The endpoint validates the request and returns a stub response (AI generation is deferred to a future milestone). The form has an independent Clear action so recruiters can adjust role details without re-uploading the resume.

---

## Preconditions

- Issue #2 (Resume upload) is merged and the `POST /resumes/` endpoint is working.
- The `Resume` SQLAlchemy model is registered and the `resumes` table exists.
- `frontend/` Node dependencies are installed (`npm install`).
- `backend/` Python dependencies are installed (`pip install -r requirements.txt`).
- The Vite dev server proxy (`/api → localhost:8000`) is configured in `vite.config.ts`.
- All existing tests pass: `cd backend && pytest` and `cd frontend && npm test`.

---

## Step-by-Step Plan

### Phase 1: Preparation

- [ ] Read and confirm the spec at `docs/spec/HireIQ-3.md`
- [ ] Review `frontend/src/components/ResumeUpload.tsx` to understand the existing upload state pattern
- [ ] Review `frontend/src/App.tsx` to understand how `handleUploaded` and `activeResumeId` state will fit
- [ ] Review `backend/app/routers/resumes.py` to confirm `Resume` model import path and `get_db` pattern
- [ ] Confirm `backend/app/models/resume.py` has an `id` field that can be referenced in the generate endpoint
- [ ] Verify `backend/app/main.py` router registration pattern to know where to add `generate` router

---

### Phase 2: Backend — Generate Endpoint

- [ ] Create `backend/app/routers/generate.py`
  - Define `GenerateRequest` Pydantic model with fields: `resume_id: int`, `job_title: str`, `seniority_level: str`, `key_skills: list[str]`
  - Define `GenerateResponse` Pydantic model: `message: str`, `resume_id: int`, `job_title: str`, `seniority_level: str`, `key_skills: list[str]`
  - Define `router = APIRouter(prefix="/generate", tags=["generate"])`
  - Implement `POST /` handler:
    1. Look up `Resume` by `payload.resume_id`; raise `HTTPException(404)` if not found
    2. Guard against empty `job_title` and `seniority_level` (raise `422`)
    3. Guard against empty `key_skills` list (raise `422`)
    4. Return `GenerateResponse` with `message = "Generation queued (stub — AI integration pending)"` and echoed payload fields
    5. Status code: `202 Accepted`
  - Include `get_db` dependency injection (copy pattern from `resumes.py`)

- [ ] Register `generate` router in `backend/app/main.py`
  - Add `from app.routers import generate` import
  - Add `app.include_router(generate.router)` after existing routers

---

### Phase 3: Frontend — `JobRoleForm` Component

- [ ] Create `frontend/src/components/JobRoleForm.tsx`
  - Export `JobRoleData` type: `{ jobTitle: string; seniorityLevel: string; keySkills: string[] }`
  - Define `SENIORITY_OPTIONS` constant: `['Junior', 'Mid-Level', 'Senior', 'Lead', 'Principal']`
  - Implement component state:
    - `jobTitle: string` (text input)
    - `seniorityLevel: string` (dropdown)
    - `keySkills: string[]` (list of added skill tags)
    - `skillInput: string` (current text in the skill input field)
    - `errors: Partial<Record<keyof JobRoleData, string>>` (inline validation messages)
  - Implement `addSkill()`: trims `skillInput`, guards against empty/duplicate, appends to `keySkills`, clears `skillInput`
  - Implement `removeSkill(skill: string)`: filters skill out of `keySkills`
  - Implement `handleKeyDown`: calls `addSkill()` on Enter keypress (preventing form submission)
  - Implement `validate()`: sets `errors` state for each missing field; returns `true` if no errors
  - Implement `handleSubmit`: calls `validate()`; calls `onSubmit(data)` if valid
  - Implement `handleClear`: resets all state fields and clears errors
  - Render structure:
    - `<form onSubmit={handleSubmit}>`
    - Job Title: `<label>` + `<input type="text">` + inline error `<p>`
    - Seniority Level: `<label>` + `<select>` with placeholder option + mapped `SENIORITY_OPTIONS` + inline error `<p>`
    - Key Skills: `<label>` + `<input type="text">` + "Add" `<button type="button">` + tag list with × remove buttons + inline error `<p>`
    - Action row: `<button type="submit">` + `<button type="button" onClick={handleClear}>`
  - Accept props: `onSubmit: (data: JobRoleData) => void`, `disabled?: boolean`
  - Apply `disabled` prop to all interactive elements when true

---

### Phase 4: Frontend — `App.tsx` Integration

- [ ] Update `frontend/src/App.tsx`
  - Add `activeResumeId: number | null` state (initialized to `null`)
  - Add `generateResult: GenerateResult | null` state for success response
  - Add `generateError: string | null` state for error message
  - Add `generating: boolean` state to disable form during in-flight requests
  - Define `GenerateResult` type: `{ message: string; resume_id: number; job_title: string; seniority_level: string; key_skills: string[] }`
  - Update `handleUploaded` to also `setActiveResumeId(r.id)` after adding to list
  - Implement `handleGenerate(roleData: JobRoleData)`:
    1. Guard: return early if `activeResumeId` is null
    2. Set `generating = true`, clear previous result/error
    3. `fetch('/api/generate/', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ resume_id: activeResumeId, job_title: roleData.jobTitle, seniority_level: roleData.seniorityLevel, key_skills: roleData.keySkills }) })`
    4. On success: set `generateResult`
    5. On error: set `generateError`
    6. `finally`: set `generating = false`
  - Mount `<JobRoleForm onSubmit={handleGenerate} disabled={!activeResumeId || generating} />`
  - Add hint paragraph: `{!activeResumeId && <p>Upload a resume to enable question generation.</p>}`
  - Show `{generateError && <p style={{color:'red'}}>{generateError}</p>}`
  - Show `{generateResult && <p style={{color:'green'}}>{generateResult.message}</p>}`
  - Import `JobRoleData` type from `./components/JobRoleForm`

---

### Phase 5: Testing & Validation

#### Backend Tests

- [ ] Create `backend/tests/test_generate.py`
  - Set up `TestClient` with in-memory SQLite (reuse `conftest.py` pattern with `override_get_db`)
  - **Happy path:**
    - `test_generate_returns_202_with_valid_payload`: POST with valid `resume_id` (seeded resume), `job_title`, `seniority_level`, `key_skills` → assert `202`, response contains `message`, `resume_id`, `job_title`, `seniority_level`, `key_skills`
  - **Validation errors:**
    - `test_generate_returns_404_when_resume_not_found`: POST with non-existent `resume_id` → assert `404`
    - `test_generate_returns_422_when_job_title_empty`: POST with empty `job_title` → assert `422`
    - `test_generate_returns_422_when_seniority_empty`: POST with empty `seniority_level` → assert `422`
    - `test_generate_returns_422_when_key_skills_empty`: POST with empty `key_skills` list → assert `422`
  - **Edge cases:**
    - `test_generate_returns_422_when_missing_resume_id`: POST with missing field → FastAPI auto-returns `422`
  - Ensure `conftest.py` seeds a `Resume` row for tests that need a valid `resume_id`

#### Frontend Tests

- [ ] Create `frontend/src/__tests__/JobRoleForm.test.tsx`
  - Import `{ render, screen, fireEvent }` from `@testing-library/react` and `userEvent` from `@testing-library/user-event`
  - **Rendering:**
    - `renders job title input`: assert `getByLabelText(/job title/i)` is in document
    - `renders seniority level dropdown`: assert `getByLabelText(/seniority level/i)` is in document
    - `renders key skills input`: assert label present
    - `renders generate questions button`: assert button present
    - `renders clear button`: assert clear button present
  - **Validation — submit with empty fields:**
    - `shows error when job title is empty on submit`: click Generate without filling fields → assert "Job title is required." appears
    - `shows error when seniority is not selected`: fill job title only → assert seniority error appears
    - `shows error when no skills added`: fill job title + seniority → assert skills error appears
    - `does not call onSubmit when validation fails`: spy on `onSubmit` → submit with empty form → assert not called
  - **Skill tag management:**
    - `adds a skill tag on Enter keypress`: type skill + press Enter → assert tag appears in DOM
    - `adds a skill tag on Add button click`: type skill + click Add → assert tag appears
    - `does not add empty skill`: press Enter with empty input → assert no tag added
    - `does not add duplicate skill`: add same skill twice → assert only one tag in list
    - `removes skill tag on × click`: add skill → click × → assert tag gone
  - **Clear button:**
    - `clear resets job title, seniority, and skills`: fill all fields + add skill → click Clear → assert all fields empty/reset
    - `clear does not call onSubmit`: click Clear → assert `onSubmit` not called
  - **Happy path:**
    - `calls onSubmit with correct data when form is valid`: fill all fields → click Generate → assert `onSubmit` called with `{ jobTitle, seniorityLevel, keySkills }`
  - **Disabled state:**
    - `disables all inputs when disabled prop is true`: pass `disabled={true}` → assert all inputs/buttons are disabled

- [ ] Update `frontend/src/__tests__/App.test.tsx`
  - Add MSW handler for `POST /api/generate/` returning stub response
  - `renders job role form heading`: assert "Job Role" heading present
  - `generate button is disabled when no resume is uploaded`: assert Generate button disabled by default
  - `shows upload hint when no resume is active`: assert "Upload a resume to enable question generation." text visible
  - `generate button is enabled after resume upload` (optional — requires simulating upload flow)

---

### Phase 6: Deployment & Rollout

- [ ] Run `cd backend && pytest` — confirm all tests pass (including new `test_generate.py`)
- [ ] Run `cd frontend && npm test` — confirm all tests pass (including new `JobRoleForm.test.tsx`)
- [ ] Run `make lint` — confirm no lint errors in both frontend and backend
- [ ] Start the app with `make dev` and manually verify:
  - [ ] App loads without errors
  - [ ] JobRoleForm renders with title, seniority dropdown, skills tag input
  - [ ] Inline validation fires on empty submit (all three fields)
  - [ ] Skills can be added via Enter keypress and "Add" button
  - [ ] Skills can be removed via × button
  - [ ] Clear resets form without affecting uploaded resume status
  - [ ] Generate button is disabled when no resume is uploaded
  - [ ] After uploading a resume, Generate button becomes enabled
  - [ ] Submitting form sends `POST /api/generate/` with correct payload
  - [ ] Stub response message appears on success
  - [ ] 404 error is shown if resume is somehow deleted between upload and generate

**Rollback plan:** This issue adds new files only (`generate.py`, `JobRoleForm.tsx`) plus minimal edits to `main.py` and `App.tsx`. Rollback = revert the two modified files and delete the two new files. The resume upload feature (Issue #2) is unaffected.

---

## Impacted Files / Modules

| File                                          | Change Type  | Notes                                               |
|-----------------------------------------------|--------------|-----------------------------------------------------|
| `frontend/src/components/JobRoleForm.tsx`     | **New**      | Job role form component with tag input              |
| `frontend/src/__tests__/JobRoleForm.test.tsx` | **New**      | Vitest unit tests for `JobRoleForm`                 |
| `frontend/src/App.tsx`                        | **Modified** | Mount `JobRoleForm`, add generate handler + state   |
| `frontend/src/__tests__/App.test.tsx`         | **Modified** | Add MSW mock for generate endpoint + new assertions |
| `backend/app/routers/generate.py`             | **New**      | `POST /generate` stub endpoint with validation      |
| `backend/app/main.py`                         | **Modified** | Register `generate` router                          |
| `backend/tests/test_generate.py`              | **New**      | Pytest tests for `POST /generate`                   |
| `docs/spec/HireIQ-3.md`                       | **New**      | Issue specification                                 |

---

## Risks & Mitigation

| Risk                                                        | Likelihood | Impact | Mitigation                                                                                           |
|-------------------------------------------------------------|------------|--------|------------------------------------------------------------------------------------------------------|
| `conftest.py` doesn't exist in backend/tests yet           | Medium     | High   | Create `backend/tests/conftest.py` with `override_get_db` fixture pattern from `UNIT_TESTING.md`    |
| Tag input `keyDown` conflicts with form's default submit   | Low        | Medium | `e.preventDefault()` in `handleKeyDown` when `e.key === 'Enter'` prevents accidental form submit     |
| `activeResumeId` not reset if user re-uploads a new resume | Low        | Low    | `handleUploaded` always sets `activeResumeId` to the latest upload; this is correct M1 behaviour     |
| Generate endpoint returns `202` but frontend expects 200   | Low        | Low    | Frontend `fetch` checks `res.ok` (covers 2xx range); `202` is included                              |
| Seniority value not validated against enum on backend      | Low        | Low    | Backend accepts any non-empty string at M1; enforce enum in M2 when requirements are more stable     |
| Duplicate `get_db` definition across routers               | Medium     | Low    | Acceptable at M1 scale; extract to `app/dependencies.py` in a future refactor                        |
| MSW version mismatch in frontend tests                     | Low        | Medium | `msw ^2.7.5` is already installed; use `http.post` (v2 syntax) not `rest.post` (v1 syntax)          |

---

## Validation Checklist

- [ ] All acceptance criteria met:
  - [ ] Form includes: job title (text), seniority level (dropdown), key skills (tag input)
  - [ ] All fields required with inline validation error messages on empty submit
  - [ ] Form data submitted alongside resume_id to `POST /generate` endpoint
  - [ ] Clear button resets job role fields only; resume upload state unaffected
- [ ] Backend tests passing: `pytest` with `test_generate.py` covering happy path + all 4xx cases
- [ ] Frontend tests passing: `npm test` with `JobRoleForm.test.tsx` covering rendering, validation, tag management, clear, happy path, and disabled state
- [ ] `make lint` passes without warnings or errors
- [ ] No new `any` TypeScript types introduced without justification comment
- [ ] No new Python dependencies added (all required libraries already in `requirements.txt`)
- [ ] `POST /generate` returns `202` with structured JSON (never raw exceptions)
- [ ] No regressions: existing `ResumeUpload` and `ResumeList` behaviour unchanged
- [ ] Existing test suite (`test_health.py`, `test_resumes.py`, `App.test.tsx`) continues to pass
