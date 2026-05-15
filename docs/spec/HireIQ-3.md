# Issue Specification

## Issue Summary

Add a job role input form alongside the resume upload flow so recruiters can describe the open position. The form captures job title, seniority level (dropdown), and key skills (tag input). All three fields are required, validated inline, and submitted together with the resume file to the generation endpoint.

---

## Problem Statement

At Milestone 1 the HireIQ frontend only collects candidate metadata (name and email) together with the resume file. There is no mechanism to capture the **role context** a recruiter is hiring for — specifically the job title, expected seniority level, and required skills. Without this context the downstream question-generation step cannot produce role-relevant interview questions.

Issue #3 introduces the job role input form as a first-class part of the upload workflow so that every resume submission is paired with a complete role description.

---

## Current Behavior

- `ResumeUpload.tsx` collects `candidate_name`, `candidate_email`, and a PDF/DOCX file.
- `POST /api/resumes/` accepts only those three fields.
- The `Resume` SQLAlchemy model stores no role-related columns.
- There is no seniority, job title, or skills capture anywhere in the app.

---

## Expected Behavior

1. A **Job Role Form** section appears in the UI (above or alongside the resume upload form).
2. The form has three fields, all required:
   - **Job Title** — free-text input (e.g. "Backend Engineer").
   - **Seniority Level** — `<select>` dropdown with options: `Junior`, `Mid-level`, `Senior`, `Lead`, `Principal / Staff`.
   - **Key Skills** — tag input: the recruiter types a skill and presses Enter or comma to add it as a tag; each tag has an "×" to remove it; at least one tag is required.
3. Clicking **Upload Resume** before all three job-role fields are filled shows an inline error under each empty field — the upload does **not** proceed.
4. On submit the form posts all five fields (`candidate_name`, `candidate_email`, `file`, `job_title`, `seniority_level`, `key_skills`) to the backend.
5. A **Clear** button on the Job Role Form resets only the three role fields. The already-selected resume file and candidate details are preserved.

---

## Root Cause Analysis

No root cause exists — this is a **net-new feature** for M1 Foundation. Gap analysis:

| Layer | Gap |
|-------|-----|
| Frontend component | `JobRoleForm` component does not exist. |
| Frontend state | `App.tsx` holds no job-role state; `ResumeUpload` props do not include role fields. |
| Frontend submission | `FormData` in `ResumeUpload.handleSubmit` omits role fields. |
| Backend endpoint | `POST /resumes/` signature accepts only `candidate_name`, `candidate_email`, `file`. |
| Backend model | `Resume` table has no `job_title`, `seniority_level`, or `key_skills` columns. |
| Migration | `migrations/init_db.py` (or an additive migration) must add the three new columns. |

---

## Proposed Solution

### Step 1 — Create `JobRoleForm.tsx`

New file: `frontend/src/components/JobRoleForm.tsx`

The component is **uncontrolled-state-free** — all values are passed as props and all changes bubble up via callbacks. This keeps the role data in `App.tsx` so it survives without re-uploading the resume.

```ts
// Props interface
interface JobRoleFormProps {
  jobTitle: string
  seniorityLevel: string
  keySkills: string[]
  onJobTitleChange: (v: string) => void
  onSeniorityLevelChange: (v: string) => void
  onKeySkillsChange: (skills: string[]) => void
  onClear: () => void
  errors: { jobTitle?: string; seniorityLevel?: string; keySkills?: string }
}
```

**Seniority options** (fixed, validated on both sides):

```
junior | mid | senior | lead | principal
```

**Tag input behaviour:**
- Internal draft state `skillDraft` holds the current keystroke buffer.
- On Enter or `,` key (and on blur if non-empty), `skillDraft` is trimmed, de-duplicated, and appended to `keySkills`.
- Each tag renders an "×" button that calls `onKeySkillsChange` with the tag removed.

**Clear button:**
Calls `onClear` prop — resets all three fields to empty values without touching resume state.

---

### Step 2 — Update `App.tsx`

Add job-role state and wire validation before delegating submission:

```ts
const [jobTitle, setJobTitle] = useState('')
const [seniorityLevel, setSeniorityLevel] = useState('')
const [keySkills, setKeySkills] = useState<string[]>([])
const [roleErrors, setRoleErrors] = useState<RoleErrors>({})

const handleClearRole = () => {
  setJobTitle(''); setSeniorityLevel(''); setKeySkills([])
}
```

Render order in `App.tsx`:

```jsx
<JobRoleForm
  jobTitle={jobTitle}
  seniorityLevel={seniorityLevel}
  keySkills={keySkills}
  onJobTitleChange={setJobTitle}
  onSeniorityLevelChange={setSeniorityLevel}
  onKeySkillsChange={setKeySkills}
  onClear={handleClearRole}
  errors={roleErrors}
/>
<ResumeUpload
  jobTitle={jobTitle}
  seniorityLevel={seniorityLevel}
  keySkills={keySkills}
  onValidationError={setRoleErrors}
  onUploaded={handleUploaded}
/>
```

---

### Step 3 — Update `ResumeUpload.tsx`

Accept the three role fields as props. Before calling `fetch`, validate them and call `onValidationError` with any messages. Only proceed when all fields are valid.

Append to `FormData`:

```ts
form.append('job_title', jobTitle)
form.append('seniority_level', seniorityLevel)
form.append('key_skills', JSON.stringify(keySkills))
```

---

### Step 4 — Update backend `routers/resumes.py`

Add three new `Form(...)` parameters to `upload_resume`:

```python
SENIORITY_OPTIONS = {"junior", "mid", "senior", "lead", "principal"}

@router.post("/", status_code=201)
async def upload_resume(
    candidate_name: str = Form(...),
    candidate_email: str = Form(...),
    file: UploadFile = File(...),
    job_title: str = Form(...),
    seniority_level: str = Form(...),
    key_skills: str = Form(...),   # JSON-encoded list, e.g. '["Python","FastAPI"]'
    db: Session = Depends(get_db),
):
    if seniority_level not in SENIORITY_OPTIONS:
        raise HTTPException(status_code=422, detail=f"Invalid seniority_level '{seniority_level}'.")
    try:
        skills_list: list[str] = json.loads(key_skills)
        if not skills_list:
            raise ValueError
    except (json.JSONDecodeError, ValueError):
        raise HTTPException(status_code=422, detail="key_skills must be a non-empty JSON array.")
    ...
```

---

### Step 5 — Update `models/resume.py`

Add three new columns:

```python
job_title      = Column(String(255), nullable=False)
seniority_level = Column(String(50), nullable=False)
key_skills     = Column(Text, nullable=False)   # JSON-encoded list
```

---

### Step 6 — Add/update migration

Add an additive migration script (or update `migrations/init_db.py` since the table does not exist in production yet at M1) to include the three new columns. Use `create_all` which is already idempotent.

---

## Impacted Areas

### Frontend

| File | Change |
|------|--------|
| `frontend/src/components/JobRoleForm.tsx` | **New** — job title input, seniority dropdown, tag input, Clear button, inline errors |
| `frontend/src/components/ResumeUpload.tsx` | **Modified** — accept role props, append to FormData, call `onValidationError` |
| `frontend/src/App.tsx` | **Modified** — add job-role state, render `<JobRoleForm>`, pass props to `<ResumeUpload>` |
| `frontend/src/__tests__/JobRoleForm.test.tsx` | **New** — unit tests for all fields, validation, Clear, tag add/remove |
| `frontend/src/__tests__/ResumeUpload.test.tsx` | **New/Modified** — extend submission tests to include role fields |

### Backend

| File | Change |
|------|--------|
| `backend/app/models/resume.py` | **Modified** — add `job_title`, `seniority_level`, `key_skills` columns |
| `backend/app/routers/resumes.py` | **Modified** — add three `Form(...)` params, JSON parse + seniority validation |
| `backend/migrations/init_db.py` | **Modified** — ensure new columns are included in `create_all` |
| `backend/tests/test_resumes.py` | **Modified** — all upload test fixtures must include the three new fields |

---

## Edge Cases & Risks

| # | Scenario | Mitigation |
|---|----------|-----------|
| 1 | Recruiter adds duplicate skill tag | De-duplicate in `JobRoleForm` before appending to the list |
| 2 | Recruiter types skill but forgets to press Enter | Flush `skillDraft` on form blur/submit attempt |
| 3 | `key_skills` JSON is malformed at the API boundary | 422 with a clear error message; frontend should never send invalid JSON |
| 4 | Seniority value is missing from dropdown (browser manipulation) | Backend `SENIORITY_OPTIONS` allowlist check returns 422 |
| 5 | Job title contains only whitespace | Frontend trims before validation; backend trims before storing |
| 6 | Resume already uploaded but recruiter edits role then clears | Clear only resets role fields; resume file and candidate fields unaffected |
| 7 | Existing resume rows in SQLite lack the new columns | At M1 the DB is non-production; a `make migrate` re-run with `create_all` handles new columns if the table is recreated. For existing data a manual `ALTER TABLE` or DB reset is required. |
| 8 | Large number of skills tags | No hard cap needed at M1; consider 20-tag soft limit via UX guidance in a later milestone |

---

## Acceptance Criteria

- [ ] Form includes fields: job title (text input), seniority level (dropdown), and key skills (tag input).
- [ ] Dropdown contains exactly five options: Junior, Mid-level, Senior, Lead, Principal / Staff (mapped to lowercase values `junior`, `mid`, `senior`, `lead`, `principal`).
- [ ] All three fields are required; inline error messages appear under each empty field when submission is attempted.
- [ ] Tags can be added by pressing Enter or comma; each tag has an "×" removal button.
- [ ] Skills input is flushed to a tag on form-submit attempt if non-empty draft exists.
- [ ] Clicking **Clear** resets only the three role fields without affecting the resume file or candidate inputs.
- [ ] `POST /api/resumes/` payload includes `job_title`, `seniority_level`, and `key_skills` (JSON array).
- [ ] Backend returns 422 for invalid `seniority_level` or empty/malformed `key_skills`.
- [ ] Frontend form does not submit if any role field is invalid (upload button stays disabled or shows errors).
- [ ] All new and modified components have corresponding unit tests (Vitest + React Testing Library on frontend; pytest on backend).

---

## Notes

- The "generation endpoint" referenced in the acceptance criteria does not yet exist at M1. For this issue, `POST /api/resumes/` serves as the submission target; the role fields captured here will be forwarded to the generation endpoint once it is implemented (likely M2/M3).
- `key_skills` is stored as a JSON-encoded text column in SQLite (e.g. `'["Python","FastAPI","REST"]'`). A native `JSON` column type or a normalised `skills` table can be considered in a future milestone when query/filter requirements are clearer.
- Seniority options are a fixed allowlist matching common levelling frameworks; extending this list later requires a coordinated frontend + backend update.
- No UI styling framework is introduced. Inline styles following the existing pattern in `ResumeUpload.tsx` are used for M1 consistency.
