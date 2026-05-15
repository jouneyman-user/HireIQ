# Issue Specification

> **Issue:** [#3 — Job role input form — capture role title, seniority, and key skills](https://github.com/jouneyman-user/HireIQ/issues/3)
> **Date:** 2026-05-15
> **Effort:** S (Small)
> **Milestone:** M1 — Foundation
> **Labels:** frontend

---

## Issue Summary

Add a job role input form to HireIQ's React UI so recruiters can describe the open role they are hiring for. The form captures three fields — job title, seniority level, and key skills — and submits this data alongside the candidate's resume to the interview question generation endpoint. Role details can be cleared and re-entered independently of the resume upload flow.

---

## Problem Statement

HireIQ's AI-generated interview questions must be tailored to both the candidate (resume) and the role (job context). Without role context:

- The generation endpoint cannot produce role-relevant questions.
- Recruiters have no way to specify what they are hiring for.
- The system cannot differentiate questions for a "Junior Frontend Developer" from a "Principal Backend Engineer".

This issue introduces the role context half of the generation input pair: **role form + resume → generate questions**.

---

## Current Behavior

- The React app has a `ResumeUpload` component (Issue #2) that uploads a PDF/DOCX and receives a resume ID.
- There is no form for capturing job title, seniority level, or key skills.
- There is no generation endpoint that accepts combined role + resume data.
- The `POST /resumes/` endpoint only handles file upload and metadata storage.

---

## Expected Behavior

1. Below (or alongside) the resume upload, a recruiter sees a "Job Role" form.
2. The form contains:
   - **Job Title** — free-text input (e.g. "Frontend Engineer")
   - **Seniority Level** — dropdown with options: Junior, Mid-Level, Senior, Lead, Principal
   - **Key Skills** — tag input where the recruiter types a skill and presses Enter (or clicks Add) to create a tag; tags can be removed individually
3. All three fields are required; attempting to submit with any field empty shows inline validation errors.
4. The recruiter can click **Clear** to reset all three job role fields without affecting the uploaded resume.
5. Once a resume is uploaded and all role fields are valid, a **Generate Questions** button is enabled.
6. Clicking Generate sends `{ resume_id, job_title, seniority_level, key_skills }` to `POST /generate`.
7. The backend validates the request and returns a stub response (actual AI generation is a future milestone).

---

## Root Cause Analysis

The codebase established in Issue #2 provides:

- **Frontend:** `ResumeUpload` component that calls `POST /api/resumes/` and returns a `Resume` object with an `id`.
- **Backend:** `POST /resumes/` endpoint that stores resume metadata and returns `{ id, candidate_name, ... }`.
- **App.tsx:** Mounts `ResumeUpload` and `ResumeList`; has `handleUploaded` that receives a `Resume` object.

What is missing:

| Layer    | Gap                                                          |
|----------|--------------------------------------------------------------|
| Frontend | `JobRoleForm` component with title, seniority, skills fields |
| Frontend | Tag input for key skills with add/remove functionality       |
| Frontend | Inline validation for all fields                             |
| Frontend | Clear button to reset role fields independently              |
| Frontend | "Generate Questions" button that submits combined payload    |
| Backend  | `POST /generate` endpoint accepting role + resume_id         |
| Backend  | Pydantic request model for generation payload                |
| Backend  | Stub response (placeholder until AI generation is added)     |

---

## Proposed Solution

### Architecture Overview

```
React UI
  │  JobRoleForm state: { jobTitle, seniorityLevel, keySkills[] }
  │  ResumeUpload state: { uploadedResumeId }
  │
  ▼  (Generate button enabled when both are ready)
POST /api/generate
  │  Body: { resume_id, job_title, seniority_level, key_skills }
  │
  ├── Validate resume_id exists in resumes table → 404 if not
  ├── Validate all fields present → 422 if missing
  └── Return stub: { message: "Generation queued", resume_id, job_title, ... }
```

---

### Step 1 — `JobRoleForm` Component (`frontend/src/components/JobRoleForm.tsx`)

```tsx
import { useState, KeyboardEvent } from 'react'

export type JobRoleData = {
  jobTitle: string
  seniorityLevel: string
  keySkills: string[]
}

const SENIORITY_OPTIONS = ['Junior', 'Mid-Level', 'Senior', 'Lead', 'Principal']

type Props = {
  onSubmit: (data: JobRoleData) => void
  disabled?: boolean
}

export function JobRoleForm({ onSubmit, disabled = false }: Props) {
  const [jobTitle, setJobTitle]           = useState('')
  const [seniorityLevel, setSeniority]    = useState('')
  const [keySkills, setKeySkills]         = useState<string[]>([])
  const [skillInput, setSkillInput]       = useState('')
  const [errors, setErrors]              = useState<Partial<Record<keyof JobRoleData, string>>>({})

  const addSkill = () => {
    const trimmed = skillInput.trim()
    if (!trimmed || keySkills.includes(trimmed)) return
    setKeySkills((prev) => [...prev, trimmed])
    setSkillInput('')
  }

  const removeSkill = (skill: string) => {
    setKeySkills((prev) => prev.filter((s) => s !== skill))
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); addSkill() }
  }

  const validate = (): boolean => {
    const errs: Partial<Record<keyof JobRoleData, string>> = {}
    if (!jobTitle.trim())        errs.jobTitle      = 'Job title is required.'
    if (!seniorityLevel)         errs.seniorityLevel = 'Seniority level is required.'
    if (keySkills.length === 0)  errs.keySkills      = 'At least one key skill is required.'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    onSubmit({ jobTitle: jobTitle.trim(), seniorityLevel, keySkills })
  }

  const handleClear = () => {
    setJobTitle('')
    setSeniority('')
    setKeySkills([])
    setSkillInput('')
    setErrors({})
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 480 }}>
      <h2>Job Role</h2>

      {/* Job Title */}
      <label htmlFor="job-title">Job Title *</label>
      <input
        id="job-title"
        type="text"
        value={jobTitle}
        onChange={(e) => setJobTitle(e.target.value)}
        placeholder="e.g. Frontend Engineer"
        disabled={disabled}
        style={{ display: 'block', width: '100%', marginBottom: 4 }}
      />
      {errors.jobTitle && <p style={{ color: 'red', margin: '0 0 8px' }}>{errors.jobTitle}</p>}

      {/* Seniority Level */}
      <label htmlFor="seniority-level">Seniority Level *</label>
      <select
        id="seniority-level"
        value={seniorityLevel}
        onChange={(e) => setSeniority(e.target.value)}
        disabled={disabled}
        style={{ display: 'block', width: '100%', marginBottom: 4 }}
      >
        <option value="">Select seniority…</option>
        {SENIORITY_OPTIONS.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
      {errors.seniorityLevel && <p style={{ color: 'red', margin: '0 0 8px' }}>{errors.seniorityLevel}</p>}

      {/* Key Skills Tag Input */}
      <label>Key Skills * (press Enter to add)</label>
      <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
        <input
          type="text"
          value={skillInput}
          onChange={(e) => setSkillInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g. TypeScript"
          disabled={disabled}
          style={{ flex: 1 }}
        />
        <button type="button" onClick={addSkill} disabled={disabled || !skillInput.trim()}>
          Add
        </button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
        {keySkills.map((skill) => (
          <span key={skill} style={{ background: '#e0e7ff', borderRadius: 4, padding: '2px 8px' }}>
            {skill}
            <button
              type="button"
              onClick={() => removeSkill(skill)}
              disabled={disabled}
              style={{ marginLeft: 4, background: 'none', border: 'none', cursor: 'pointer' }}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      {errors.keySkills && <p style={{ color: 'red', margin: '0 0 8px' }}>{errors.keySkills}</p>}

      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button type="submit" disabled={disabled}>Generate Questions</button>
        <button type="button" onClick={handleClear} disabled={disabled}>Clear</button>
      </div>
    </form>
  )
}
```

---

### Step 2 — Backend Generate Endpoint (`backend/app/routers/generate.py`)

```python
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models.resume import Resume

router = APIRouter(prefix="/generate", tags=["generate"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class GenerateRequest(BaseModel):
    resume_id: int
    job_title: str
    seniority_level: str
    key_skills: list[str]


class GenerateResponse(BaseModel):
    message: str
    resume_id: int
    job_title: str
    seniority_level: str
    key_skills: list[str]


@router.post("/", status_code=202, response_model=GenerateResponse)
def generate_questions(payload: GenerateRequest, db: Session = Depends(get_db)):
    resume = db.query(Resume).filter(Resume.id == payload.resume_id).first()
    if not resume:
        raise HTTPException(status_code=404, detail=f"Resume {payload.resume_id} not found.")

    if not payload.job_title.strip():
        raise HTTPException(status_code=422, detail="job_title must not be empty.")
    if not payload.seniority_level.strip():
        raise HTTPException(status_code=422, detail="seniority_level must not be empty.")
    if not payload.key_skills:
        raise HTTPException(status_code=422, detail="key_skills must contain at least one entry.")

    # Stub response — AI generation will be implemented in a future milestone
    return GenerateResponse(
        message="Generation queued (stub — AI integration pending)",
        resume_id=payload.resume_id,
        job_title=payload.job_title,
        seniority_level=payload.seniority_level,
        key_skills=payload.key_skills,
    )
```

---

### Step 3 — Register Router in `backend/app/main.py`

```python
from app.routers import health, resumes, generate

app.include_router(health.router)
app.include_router(resumes.router)
app.include_router(generate.router)
```

---

### Step 4 — Update `App.tsx`

```tsx
import { useState, useEffect } from 'react'
import { ResumeList } from './components/ResumeList'
import { ResumeUpload } from './components/ResumeUpload'
import { JobRoleForm, JobRoleData } from './components/JobRoleForm'

type Resume = {
  id: number
  candidate_name: string
  candidate_email: string
  original_filename: string
  file_size_bytes: number
  uploaded_at: string
}

type GenerateResult = {
  message: string
  resume_id: number
  job_title: string
  seniority_level: string
  key_skills: string[]
}

function App() {
  const [resumes, setResumes] = useState<Resume[]>([])
  const [activeResumeId, setActiveResumeId] = useState<number | null>(null)
  const [generateResult, setGenerateResult] = useState<GenerateResult | null>(null)
  const [generateError, setGenerateError]   = useState<string | null>(null)
  const [generating, setGenerating]         = useState(false)

  useEffect(() => {
    fetch('/api/resumes/')
      .then((r) => r.json())
      .then(setResumes)
      .catch(console.error)
  }, [])

  const handleUploaded = (r: Resume) => {
    setResumes((prev) => [r, ...prev])
    setActiveResumeId(r.id)
  }

  const handleGenerate = async (roleData: JobRoleData) => {
    if (!activeResumeId) return
    setGenerating(true)
    setGenerateResult(null)
    setGenerateError(null)
    try {
      const res = await fetch('/api/generate/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resume_id: activeResumeId,
          job_title: roleData.jobTitle,
          seniority_level: roleData.seniorityLevel,
          key_skills: roleData.keySkills,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail ?? `HTTP ${res.status}`)
      setGenerateResult(data as GenerateResult)
    } catch (err: unknown) {
      setGenerateError(err instanceof Error ? err.message : 'Generation failed.')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div style={{ fontFamily: 'sans-serif', padding: '2rem', maxWidth: 960, margin: '0 auto' }}>
      <h1>HireIQ</h1>
      <ResumeUpload onUploaded={handleUploaded} />
      <hr style={{ margin: '2rem 0' }} />
      <JobRoleForm onSubmit={handleGenerate} disabled={!activeResumeId || generating} />
      {!activeResumeId && (
        <p style={{ color: '#888', marginTop: 8 }}>Upload a resume to enable question generation.</p>
      )}
      {generateError && <p style={{ color: 'red' }}>{generateError}</p>}
      {generateResult && <p style={{ color: 'green' }}>{generateResult.message}</p>}
      <h2>Uploaded Resumes</h2>
      <ResumeList resumes={resumes} />
    </div>
  )
}

export default App
```

---

### Step 5 — Updated Directory Structure

```
HireIQ/
├── backend/
│   └── app/
│       ├── main.py                        # register generate router
│       └── routers/
│           └── generate.py               # NEW — POST /generate stub endpoint
└── frontend/
    └── src/
        ├── App.tsx                        # updated — mount JobRoleForm + generate handler
        └── components/
            └── JobRoleForm.tsx           # NEW — job role form with tag input
```

---

## Impacted Areas

| File / Module                               | Change Type  | Notes                                              |
|---------------------------------------------|--------------|----------------------------------------------------|
| `frontend/src/components/JobRoleForm.tsx`   | **New**      | Job role form: title, seniority dropdown, tag input |
| `frontend/src/App.tsx`                      | **Modified** | Mount `JobRoleForm`, wire generate action          |
| `backend/app/routers/generate.py`           | **New**      | `POST /generate` stub endpoint                     |
| `backend/app/main.py`                       | **Modified** | Register `generate` router                         |

---

## Edge Cases & Risks

| Scenario                               | Mitigation                                                                   |
|----------------------------------------|------------------------------------------------------------------------------|
| User clears form while generating      | Disable Clear during generation (`disabled` prop on form)                    |
| Duplicate skill tags                   | `addSkill` guards against duplicates via `includes()` check                  |
| Empty skill string                     | `addSkill` trims and guards; `validate()` requires at least one skill         |
| Resume deleted between upload and generate | Backend returns 404; frontend displays error message                     |
| Seniority level not in accepted list   | Dropdown only renders valid options; backend trusts frontend at M1           |
| Very long job title                    | No hard limit at M1 (backend uses `str`); impose max-length in M2 if needed  |
| No resume uploaded yet                 | Generate button disabled; informational hint shown below form                |
| Network failure during generation      | Caught in `try/catch`, displayed as error string below form                  |

---

## Acceptance Criteria

- [ ] Form includes fields: job title, seniority level (dropdown), and key skills (tag input)
- [ ] All fields are required with inline validation before submission
- [ ] Form data is submitted alongside the resume to the generation endpoint
- [ ] User can clear and re-enter role details without re-uploading the resume

---

## Notes

- **AI generation is out of scope for this issue.** The `POST /generate` endpoint returns a stub response. Actual Claude API integration is a separate milestone.
- **No new backend dependencies** are required for the stub endpoint — FastAPI, SQLAlchemy, and Pydantic are already present.
- **No authentication** on the generate endpoint — consistent with M1 scope (no auth).
- **`JobRoleFormData` type** is exported from the component file so `App.tsx` can type the callback.
- **Tag input UX:** Skills are added on Enter keypress or "Add" button click; removed via × button on each tag. This is the simplest accessible implementation without adding a UI library.

---

*Spec generated autonomously by the Super Skills agent — no user interaction required.*
