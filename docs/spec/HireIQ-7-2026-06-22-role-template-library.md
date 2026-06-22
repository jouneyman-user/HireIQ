# Issue Specification

> **Issue:** [#7 — Role template library: save and reuse role + skills configurations](https://github.com/jouneyman-user/HireIQ/issues/7)
> **Date:** 2026-06-22
> **Effort:** M (Medium)
> **Milestone:** M3 — Persistence
> **Labels:** backend, frontend

---

## Issue Summary

Implement a role template library that lets recruiters save, load, rename, and delete job role configurations (job title, seniority level, key skills) as reusable templates. Templates are persisted in a new `role_templates` SQLite table and loaded into the `JobRoleForm` via a dropdown selector.

---

## Problem Statement

Recruiters at Hiring teams frequently hire for the same roles repeatedly (e.g. "Senior Frontend Engineer", "Mid-Level DevOps"). Currently, every time they start a new generation session, they must manually re-enter the job title, seniority level, and key skills. This is repetitive, error-prone, and wastes time.

A template library solves this by letting recruiters:
- Save the current form state as a named template
- Load a saved template to pre-fill the form in one click
- Manage templates (rename, delete) from a simple management view

---

## Acceptance Criteria

- [ ] User can name and save the current role form as a template
- [ ] Templates are stored in a `role_templates` SQLite table
- [ ] A dropdown on the form lets users load a saved template, pre-filling all fields
- [ ] User can rename or delete templates from a management view

---

## Current Behavior

### Backend
- No `role_templates` table exists.
- No endpoints for template CRUD.
- The `JobRoleData` type and `POST /generate` endpoint accept role fields but do not persist them.
- Existing models: `Resume` (table: `resumes`).
- Existing routers: `health`, `resumes`, `generate`.

### Frontend
- `JobRoleForm` component has no template integration.
- The form fields (`jobTitle`, `seniorityLevel`, `keySkills`) are purely local React state.
- No API calls for templates exist.
- `App.tsx` has no template state or UI.

---

## Root Cause Analysis

| Existing Asset | Role in this Feature |
|----------------|---------------------|
| `backend/app/database.py` | SQLAlchemy engine, Base — will register new `RoleTemplate` model |
| `backend/app/main.py` | App factory — will register new `role_templates` router |
| `backend/migrations/init_db.py` | Import hook — must import new model before `create_all()` |
| `frontend/src/components/JobRoleForm.tsx` | Will gain a template dropdown and load/save handlers |
| `frontend/src/App.tsx` | Will hold template state and pass handlers to `JobRoleForm` |
| `backend/app/models/resume.py` | Pattern reference for new model file |
| `backend/app/routers/resumes.py` | Pattern reference for CRUD router |

What is missing:

| Layer | Gap |
|-------|-----|
| Backend | `RoleTemplate` SQLAlchemy model |
| Backend | `role_templates` table migration |
| Backend | `POST /role-templates/` — create template |
| Backend | `GET /role-templates/` — list all templates |
| Backend | `GET /role-templates/{id}` — get single template |
| Backend | `PATCH /role-templates/{id}` — rename template |
| Backend | `DELETE /role-templates/{id}` — delete template |
| Frontend | Template dropdown in `JobRoleForm` |
| Frontend | Template save button on form |
| Frontend | Template management view (list, rename, delete) |

---

## Proposed Solution

### Architecture Overview

```
Frontend (React)                          Backend (FastAPI)
─────────────────────                     ─────────────────────
JobRoleForm                                /role-templates/
├── Template dropdown                      ├── GET  /              → list all
│   └── onSelect → loadTemplate(id)        ├── POST /              → create
├── Save template button                   ├── GET  /{id}            → get one
│   └── onSaveTemplate(name)               ├── PATCH /{id}           → rename
└── Template management view               ├── DELETE /{id}          → delete
    ├── List templates
    ├── Rename input
    └── Delete button
```

### Data Model

```python
class RoleTemplate(Base):
    __tablename__ = "role_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    job_title = Column(String(255), nullable=False)
    seniority_level = Column(String(100), nullable=False)
    key_skills = Column(JSON, nullable=False)  # stored as JSON array
    created_at = Column(DateTime, default=datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=datetime.now(timezone.utc), onupdate=datetime.now(timezone.utc), nullable=False)
```

**Why JSON for `key_skills`?** SQLite has no native array type. `JSON` column stores the array as a JSON string, and SQLAlchemy handles serialization/deserialization. This matches the frontend's `string[]` type directly.

### API Endpoints

#### `POST /role-templates/` — Create template
- **Request:** `{ "name": string, "job_title": string, "seniority_level": string, "key_skills": string[] }`
- **Response:** 201 — created template object with `id`
- **Error:** 422 if name is empty, or any role field is missing

#### `GET /role-templates/` — List all templates
- **Response:** 200 — array of template objects (id, name, job_title, seniority_level, created_at, updated_at)
- **Note:** Excludes `key_skills` in list view to keep response lean

#### `GET /role-templates/{template_id}` — Get single template
- **Response:** 200 — full template object including `key_skills`
- **Error:** 404 if not found

#### `PATCH /role-templates/{template_id}` — Rename template
- **Request:** `{ "name": string }`
- **Response:** 200 — updated template object
- **Error:** 404 if not found, 422 if name is empty

#### `DELETE /role-templates/{template_id}` — Delete template
- **Response:** 204 — no content on success
- **Error:** 404 if not found

### Frontend Changes

#### `JobRoleForm.tsx` — Add template controls
1. Add a `templateId` prop (optional). When set, the form is read-only and displays the template name.
2. Add a `templateOptions` prop — array of `{ id, name, job_title, seniority_level }` for the dropdown.
3. Add a `onLoadTemplate` callback — called when user selects a template from the dropdown.
4. Add a `onSaveTemplate` callback — called when user clicks "Save as Template".
5. Add a template dropdown above the existing form fields.
6. Add a "Save as Template" button next to "Generate Questions".

#### `App.tsx` — Add template state and management view
1. Add `templates` state — fetched from `GET /role-templates/` on mount.
2. Add `selectedTemplateId` state — tracks which template is loaded.
3. Add `handleLoadTemplate(id)` — fetches full template, sets form fields.
4. Add `handleSaveTemplate(name)` — POSTs current form data as template, refreshes list.
5. Add a template management section below the form with:
   - Dropdown to select a template (populates form)
   - List of templates with rename input and delete button
6. Pass template props to `JobRoleForm`.

---

## Implementation Steps

### Step 1 — Backend: `RoleTemplate` Model (`backend/app/models/role_template.py`)

```python
from datetime import datetime, timezone
import json

from sqlalchemy import Column, DateTime, Integer, JSON, String
from sqlalchemy.orm import Session

from app.database import Base


class RoleTemplate(Base):
    __tablename__ = "role_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    job_title = Column(String(255), nullable=False)
    seniority_level = Column(String(100), nullable=False)
    key_skills = Column(JSON, nullable=False, default=list)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    def to_dict(self, include_skills: bool = True) -> dict:
        result = {
            "id": self.id,
            "name": self.name,
            "job_title": self.job_title,
            "seniority_level": self.seniority_level,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }
        if include_skills:
            result["key_skills"] = self.key_skills or []
        return result

    @staticmethod
    def create(db: Session, name: str, job_title: str, seniority_level: str, key_skills: list[str]) -> "RoleTemplate":
        template = RoleTemplate(
            name=name,
            job_title=job_title,
            seniority_level=seniority_level,
            key_skills=key_skills,
        )
        db.add(template)
        db.commit()
        db.refresh(template)
        return template
```

### Step 2 — Migration: Import new model (`backend/migrations/init_db.py`)

```python
import os

from app.database import Base, engine
import app.main  # noqa: F401 — triggers model imports so Base knows about all tables
import app.models.role_template  # noqa: F401 — register RoleTemplate with Base

if __name__ == "__main__":
    os.makedirs("uploads/resumes", exist_ok=True)
    Base.metadata.create_all(bind=engine)
    print("Database initialised.")
```

### Step 3 — Backend: Pydantic Schemas (`backend/app/schemas/role_template.py`)

```python
from pydantic import BaseModel, Field


class RoleTemplateCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255, description="Template display name")
    job_title: str = Field(..., min_length=1, description="Job title, e.g. 'Senior Frontend Engineer'")
    seniority_level: str = Field(..., min_length=1, description="Junior, Mid-Level, Senior, Lead, Principal")
    key_skills: list[str] = Field(..., min_length=1, description="At least one key skill")


class RoleTemplateNameUpdate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255, description="New template display name")


class RoleTemplateOut(BaseModel):
    id: int
    name: str
    job_title: str
    seniority_level: str
    key_skills: list[str]
    created_at: str
    updated_at: str


class RoleTemplateListOut(BaseModel):
    id: int
    name: str
    job_title: str
    seniority_level: str
    created_at: str
    updated_at: str
```

### Step 4 — Backend: Router (`backend/app/routers/role_templates.py`)

```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.role_template import RoleTemplate
from app.schemas.role_template import (
    RoleTemplateCreate,
    RoleTemplateListOut,
    RoleTemplateNameUpdate,
    RoleTemplateOut,
)

router = APIRouter(prefix="/role-templates", tags=["role-templates"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/", status_code=status.HTTP_201_CREATED, response_model=RoleTemplateOut)
def create_template(payload: RoleTemplateCreate, db: Session = Depends(get_db)):
    template = RoleTemplate.create(
        db=db,
        name=payload.name,
        job_title=payload.job_title,
        seniority_level=payload.seniority_level,
        key_skills=payload.key_skills,
    )
    return template.to_dict()


@router.get("/", status_code=status.HTTP_200_OK, response_model=list[RoleTemplateListOut])
def list_templates(db: Session = Depends(get_db)):
    templates = db.query(RoleTemplate).order_by(RoleTemplate.updated_at.desc()).all()
    return [t.to_dict(include_skills=False) for t in templates]


@router.get("/{template_id}", status_code=status.HTTP_200_OK, response_model=RoleTemplateOut)
def get_template(template_id: int, db: Session = Depends(get_db)):
    template = db.query(RoleTemplate).filter(RoleTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found.")
    return template.to_dict()


@router.patch("/{template_id}", status_code=status.HTTP_200_OK, response_model=RoleTemplateOut)
def rename_template(template_id: int, payload: RoleTemplateNameUpdate, db: Session = Depends(get_db)):
    template = db.query(RoleTemplate).filter(RoleTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found.")
    template.name = payload.name
    db.commit()
    db.refresh(template)
    return template.to_dict()


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_template(template_id: int, db: Session = Depends(get_db)):
    template = db.query(RoleTemplate).filter(RoleTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found.")
    db.delete(template)
    db.commit()
```

### Step 5 — Register Router (`backend/app/main.py`)

```python
# Add to imports
from app.routers import role_templates

# Add after existing include_router calls
app.include_router(role_templates.router)
```

### Step 6 — Frontend: Template Types (`frontend/src/components/JobRoleForm.tsx` — extended)

Add these types alongside existing `JobRoleData`:

```typescript
export type TemplateOption = {
  id: number
  name: string
  job_title: string
  seniority_level: string
  created_at: string
  updated_at: string
}

export type TemplateFull = TemplateOption & {
  key_skills: string[]
}
```

### Step 7 — Frontend: `JobRoleForm.tsx` — Add template props

Extend the component props:

```typescript
type Props = {
  onSubmit: (data: JobRoleData) => void
  disabled?: boolean
  // Template props
  templates: TemplateOption[]
  selectedTemplateId: number | null
  onLoadTemplate: (template: TemplateFull) => void
  onSaveTemplate: (name: string) => void
  onClearTemplateSelection: () => void
}
```

Add to the form UI:
- A `<select>` dropdown populated from `templates` before the existing fields
- When a template is selected, populate form fields and set `selectedTemplateId`
- A "Save as Template" button that prompts for a name and calls `onSaveTemplate`
- When a template is loaded, show the template name and an "Edit" button to clear selection

### Step 8 — Frontend: `App.tsx` — Add template state and management view

Add state:
```typescript
const [templates, setTemplates] = useState<TemplateOption[]>([])
const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null)
const [templateName, setTemplateName] = useState('')
const [editingTemplateId, setEditingTemplateId] = useState<number | null>(null)
const [editingName, setEditingName] = useState('')
```

Add effects:
- `useEffect` to fetch templates on mount: `fetch('/api/role-templates/')`

Add handlers:
- `handleLoadTemplate(id)` — fetches full template, sets form fields, sets `selectedTemplateId`
- `handleSaveTemplate()` — POSTs current form data as new template, refreshes list
- `handleDeleteTemplate(id)` — DELETEs template, refreshes list
- `handleRenameTemplate(id)` — PATCHes template name, refreshes list

Add template management view below the form:
- Dropdown to select a template (calls `handleLoadTemplate`)
- Table/list of templates with columns: Name, Job Title, Seniority, Actions (Rename, Delete)

---

## Impacted Areas

| File / Module | Change Type | Notes |
|---|---|---|
| `backend/app/models/role_template.py` | **New** | `RoleTemplate` SQLAlchemy model with `to_dict()` helper |
| `backend/app/schemas/role_template.py` | **New** | Pydantic request/response schemas |
| `backend/app/routers/role_templates.py` | **New** | CRUD endpoints: create, list, get, rename, delete |
| `backend/app/main.py` | **Modified** | Register `role_templates` router |
| `backend/migrations/init_db.py` | **Modified** | Import `role_template` model before `create_all()` |
| `backend/tests/test_role_templates.py` | **New** | Unit tests with in-memory SQLite |
| `frontend/src/components/JobRoleForm.tsx` | **Modified** | Add template dropdown, save button, load handlers |
| `frontend/src/App.tsx` | **Modified** | Add template state, management view, API calls |

---

## Edge Cases & Risks

| Scenario | Mitigation |
|----------|-----------|
| Duplicate template names | Allow duplicates — users can rename later. No uniqueness constraint. |
| Saving a template with no form data filled | Validate at frontend: prevent save if job title or seniority is empty |
| Deleting a template that is currently loaded | Clear form fields and `selectedTemplateId` after deletion |
| Renaming a template while form shows its data | Form stays on the loaded template; renaming updates the dropdown label |
| Many templates (100+) | Paginate the list endpoint in a follow-up if needed; currently no pagination |
| Concurrent edits | No optimistic locking needed at M1 scale; last-write-wins is acceptable |
| JSON serialization of `key_skills` | SQLAlchemy `JSON` column handles Python `list` ↔ JSON string automatically |
| Template load overwrites unsaved form data | Show a confirmation dialog before overwriting, or auto-save current state first |

---

## Acceptance Criteria Checklist

- [ ] `POST /api/role-templates/` creates a template and returns 201 with full object
- [ ] `GET /api/role-templates/` returns all templates (without key_skills in list)
- [ ] `GET /api/role-templates/{id}` returns full template including key_skills
- [ ] `PATCH /api/role-templates/{id}` renames a template
- [ ] `DELETE /api/role-templates/{id}` deletes a template, returns 204
- [ ] Frontend `JobRoleForm` has a template dropdown that loads a template's fields into the form
- [ ] Frontend has a "Save as Template" button that persists current form state
- [ ] Frontend template management view shows list with rename and delete actions
- [ ] Deleting a loaded template clears the form
- [ ] Backend unit tests pass with in-memory SQLite
- [ ] `role_templates` table is created by `init_db.py`

---

## Notes

- **No frontend template management component needed yet.** A simple inline management section within `App.tsx` is sufficient for M3. A dedicated page/component can be added in M4.
- **Template loading overwrites form state.** This is intentional — the recruiter wants to replace the current form with the template. A confirmation is recommended UX but not a hard requirement.
- **key_skills stored as JSON.** SQLite's JSON column type maps to Python `list` via SQLAlchemy. No custom serialization needed.
- **No template versioning.** Templates are single-version. Renaming or editing replaces the previous state. Versioning can be added if audit trails become a requirement.
- **No template sharing.** At M1/M2/M3 scope, templates are local to one recruiter. Multi-user sharing is a future milestone.

---

*Spec generated autonomously by the Super Skills agent — Issue #7, Milestone 3.*
