# Issue Specification

> **Issue:** [#2 — Resume upload — accept PDF and plain text, extract and store content](https://github.com/jouneyman-user/HireIQ/issues/2)
> **Date:** 2026-05-15
> **Effort:** M (Medium)
> **Milestone:** M1 — Foundation
> **Labels:** backend, frontend

---

## Issue Summary

Add resume upload capability to HireIQ so recruiters can submit a candidate's resume (PDF or `.txt`) via the React UI. The backend must extract raw text from the file, validate file type and size, and persist the extracted content in the SQLite `candidates` table with a timestamp for downstream use by the AI interview question generator.

---

## Problem Statement

HireIQ's core value proposition — AI-generated, tailored interview questions — requires a candidate's resume as input. Currently there is no mechanism to ingest resume content. Without this feature:

- The AI agent has no candidate context to work from.
- Recruiters have no way to attach a resume to a workflow.
- The `candidates` table (referenced in the M1 schema) does not yet exist.

This issue introduces the first end-to-end data flow: **upload → extract → store**.

---

## Current Behavior

- No file upload endpoint exists on the FastAPI backend.
- No `candidates` table exists in the SQLite database.
- The React frontend has no UI for file selection or upload.

---

## Expected Behavior

1. A recruiter opens the React app and sees a file upload form.
2. They select a `.pdf` or `.txt` file (≤ 5 MB).
3. The frontend sends the file to `POST /candidates/upload`.
4. The backend validates file type and size; returns `400` with a clear message on failure.
5. For PDF files, the backend extracts plain text using `pdfplumber`.
6. Extracted text is stored in the `candidates` table alongside a UTC timestamp.
7. The frontend displays a success confirmation (or error message) after upload.

---

## Root Cause Analysis

The codebase (established in M1/Issue #1) provides:

- **FastAPI** app factory at `backend/app/main.py` with CORS already configured for `http://localhost:5173`.
- **SQLAlchemy** engine and session factory at `backend/app/database.py` (SQLite, `check_same_thread=False`).
- **`Base`** declarative base ready for new models.
- **React + TypeScript** (Vite) frontend with `/api` proxy to `http://localhost:8000`.
- **`migrations/init_db.py`** idempotent schema initialiser (`Base.metadata.create_all`).

What is missing:

| Layer | Gap |
|-------|-----|
| DB | `candidates` SQLAlchemy model + table |
| Backend | `/candidates/upload` endpoint |
| Backend | PDF text extraction utility |
| Backend | File validation (type + size) |
| Frontend | `<ResumeUpload>` component |
| Frontend | Error / success state display |
| Deps | `pdfplumber` (PDF extraction) + `python-multipart` (FastAPI file uploads) |

---

## Proposed Solution

### Architecture Overview

```
React UI
  │  FormData (multipart/form-data)
  ▼
POST /api/candidates/upload
  │
  ├── Validate: content-type ∈ {application/pdf, text/plain}  → 400 if not
  ├── Validate: file.size ≤ 5 242 880 bytes (5 MB)           → 400 if not
  ├── Extract text:
  │     .pdf → pdfplumber
  │     .txt → decode UTF-8
  │
  └── INSERT INTO candidates (filename, content, created_at)
        → 201 {"id": <int>, "filename": "...", "created_at": "..."}
```

---

### Step 1 — Database Model (`backend/app/models/candidate.py`)

```python
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, DateTime
from app.database import Base

class Candidate(Base):
    __tablename__ = "candidates"

    id         = Column(Integer, primary_key=True, index=True)
    filename   = Column(String(255), nullable=False)
    content    = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True),
                        default=lambda: datetime.now(timezone.utc),
                        nullable=False)
```

**Why `Text` for content?** Resumes vary greatly in length; `String(N)` would impose an arbitrary limit. `Text` maps to SQLite's unlimited `TEXT` type.

**Why `timezone=True` on `DateTime`?** Ensures stored timestamps are unambiguous across environments.

---

### Step 2 — Text Extraction Utility (`backend/app/services/resume_extractor.py`)

```python
import io
import pdfplumber

SUPPORTED_TYPES = {"application/pdf", "text/plain"}
MAX_FILE_BYTES  = 5 * 1024 * 1024  # 5 MB

def validate_upload(content_type: str, size: int) -> None:
    """Raise ValueError with a user-facing message on invalid input."""
    if content_type not in SUPPORTED_TYPES:
        raise ValueError(
            f"Unsupported file type '{content_type}'. "
            "Please upload a PDF or plain-text (.txt) file."
        )
    if size > MAX_FILE_BYTES:
        raise ValueError(
            f"File exceeds the 5 MB size limit "
            f"({size / 1024 / 1024:.1f} MB received)."
        )

def extract_text(content_type: str, raw_bytes: bytes) -> str:
    """Return extracted plain text from a PDF or UTF-8 text file."""
    if content_type == "application/pdf":
        with pdfplumber.open(io.BytesIO(raw_bytes)) as pdf:
            pages = [page.extract_text() or "" for page in pdf.pages]
        text = "\n".join(pages).strip()
        if not text:
            raise ValueError("PDF contains no extractable text (may be image-only).")
        return text
    # text/plain — decode UTF-8, fall back to latin-1
    try:
        return raw_bytes.decode("utf-8").strip()
    except UnicodeDecodeError:
        return raw_bytes.decode("latin-1").strip()
```

**Why `pdfplumber` over `PyMuPDF`?** `pdfplumber` is pure Python, pip-installable without system libraries, and well-suited for text-heavy documents (resumes). `PyMuPDF` (fitz) is faster but requires native binaries that can complicate deployment. This can be swapped out later.

**Why handle image-only PDFs explicitly?** Recruiters may inadvertently upload scanned resumes. A clear error is better than silently storing an empty string.

---

### Step 3 — Upload Router (`backend/app/routers/candidates.py`)

```python
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models.candidate import Candidate
from app.services.resume_extractor import validate_upload, extract_text

router = APIRouter(prefix="/candidates", tags=["candidates"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.post("/upload", status_code=201)
async def upload_resume(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    raw_bytes = await file.read()
    content_type = file.content_type or ""

    try:
        validate_upload(content_type, len(raw_bytes))
        text = extract_text(content_type, raw_bytes)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    candidate = Candidate(filename=file.filename, content=text)
    db.add(candidate)
    db.commit()
    db.refresh(candidate)

    return {
        "id":         candidate.id,
        "filename":   candidate.filename,
        "created_at": candidate.created_at.isoformat(),
    }
```

**Why `async` with `await file.read()`?** FastAPI's `UploadFile` is async-native; reading synchronously blocks the event loop.

**Why re-raise `ValueError` as `HTTPException(400)`?** Keeps business logic exceptions (ValueError) separate from HTTP transport concerns. The router is the appropriate layer to translate.

---

### Step 4 — Register Router in `backend/app/main.py`

```python
# Add to existing main.py
from app.routers import candidates
app.include_router(candidates.router)
```

**And import the model in `migrations/init_db.py`** so `create_all` creates the `candidates` table:

```python
import app.models.candidate  # noqa: F401 — registers Candidate with Base
```

---

### Step 5 — Updated `requirements.txt`

```
fastapi>=0.111.0
uvicorn[standard]>=0.29.0
sqlalchemy>=2.0.0
python-dotenv>=1.0.0
python-multipart>=0.0.9   # required for FastAPI UploadFile
pdfplumber>=0.11.0
```

**`python-multipart`** is required by FastAPI to parse `multipart/form-data` requests — without it, file uploads return a 422 error.

---

### Step 6 — Frontend: `ResumeUpload` Component (`frontend/src/components/ResumeUpload.tsx`)

```tsx
import { useState, ChangeEvent, FormEvent } from 'react'

const MAX_SIZE_BYTES = 5 * 1024 * 1024 // 5 MB

export function ResumeUpload() {
  const [file,    setFile]    = useState<File | null>(null)
  const [status,  setStatus]  = useState<'idle' | 'uploading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState<string>('')

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null
    setStatus('idle')
    setMessage('')

    if (!selected) { setFile(null); return }

    // Client-side pre-validation (mirrors backend rules)
    const allowed = ['application/pdf', 'text/plain']
    if (!allowed.includes(selected.type)) {
      setStatus('error')
      setMessage('Only PDF or plain-text (.txt) files are accepted.')
      setFile(null)
      return
    }
    if (selected.size > MAX_SIZE_BYTES) {
      setStatus('error')
      setMessage(`File is too large (${(selected.size / 1024 / 1024).toFixed(1)} MB). Maximum is 5 MB.`)
      setFile(null)
      return
    }
    setFile(selected)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!file) return

    setStatus('uploading')
    const form = new FormData()
    form.append('file', file)

    try {
      const res = await fetch('/api/candidates/upload', { method: 'POST', body: form })
      const data = await res.json()

      if (!res.ok) {
        setStatus('error')
        setMessage(data.detail ?? 'Upload failed. Please try again.')
      } else {
        setStatus('success')
        setMessage(`Resume uploaded successfully (ID: ${data.id}).`)
        setFile(null)
      }
    } catch {
      setStatus('error')
      setMessage('Network error. Please check your connection and try again.')
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: 480 }}>
      <label htmlFor="resume-input"><strong>Upload Resume</strong> (PDF or .txt, max 5 MB)</label>
      <input
        id="resume-input"
        type="file"
        accept=".pdf,.txt,application/pdf,text/plain"
        onChange={handleFileChange}
        disabled={status === 'uploading'}
      />
      {status === 'error'   && <p style={{ color: 'red'   }}>{message}</p>}
      {status === 'success' && <p style={{ color: 'green' }}>{message}</p>}
      <button type="submit" disabled={!file || status === 'uploading'}>
        {status === 'uploading' ? 'Uploading…' : 'Upload Resume'}
      </button>
    </form>
  )
}
```

**Add `<ResumeUpload />` to `frontend/src/App.tsx`:**

```tsx
import { ResumeUpload } from './components/ResumeUpload'
// ... existing App code ...
<ResumeUpload />
```

---

### Step 7 — Updated Directory Structure

```
HireIQ/
├── backend/
│   ├── app/
│   │   ├── main.py                         # register candidates router
│   │   ├── database.py                     # (unchanged)
│   │   ├── models/
│   │   │   ├── __init__.py                 # NEW
│   │   │   └── candidate.py               # NEW — Candidate SQLAlchemy model
│   │   ├── routers/
│   │   │   ├── health.py                   # (unchanged)
│   │   │   └── candidates.py              # NEW — POST /candidates/upload
│   │   └── services/
│   │       ├── __init__.py                 # NEW
│   │       └── resume_extractor.py        # NEW — validate + extract text
│   ├── migrations/
│   │   └── init_db.py                      # import candidate model
│   └── requirements.txt                    # + python-multipart, pdfplumber
└── frontend/
    └── src/
        ├── App.tsx                          # mount ResumeUpload
        └── components/
            └── ResumeUpload.tsx            # NEW — upload form component
```

---

## Impacted Areas

| File / Module | Change Type | Notes |
|---|---|---|
| `backend/app/models/candidate.py` | **New** | SQLAlchemy `Candidate` model |
| `backend/app/models/__init__.py` | **New** | Package marker |
| `backend/app/services/resume_extractor.py` | **New** | Validation + extraction logic |
| `backend/app/services/__init__.py` | **New** | Package marker |
| `backend/app/routers/candidates.py` | **New** | `POST /candidates/upload` endpoint |
| `backend/app/main.py` | **Modified** | Register `candidates` router |
| `backend/migrations/init_db.py` | **Modified** | Import `Candidate` model before `create_all` |
| `backend/requirements.txt` | **Modified** | Add `pdfplumber`, `python-multipart` |
| `frontend/src/components/ResumeUpload.tsx` | **New** | Upload form with validation & feedback |
| `frontend/src/App.tsx` | **Modified** | Mount `<ResumeUpload />` component |

---

## Edge Cases & Risks

| Scenario | Mitigation |
|----------|-----------|
| Image-only (scanned) PDF | `pdfplumber` returns empty strings per page; extractor raises `ValueError` with user-facing message |
| Password-protected PDF | `pdfplumber` raises `pdfminer.pdfdocument.PDFPasswordIncorrect`; catch and re-raise as `ValueError` |
| Malicious file with valid MIME type | Validate both `content_type` header and filename extension; `pdfplumber` will fail to open non-PDF bytes |
| Very large text content (verbose resume) | SQLite `TEXT` is unlimited; no truncation needed |
| Non-UTF-8 `.txt` files | Fallback to `latin-1` decode prevents `UnicodeDecodeError` crash |
| Concurrent uploads (SQLite locking) | FastAPI's async + SQLAlchemy session-per-request pattern is sufficient for M1 single-user usage |
| Frontend MIME-type mismatch | `accept=".pdf,.txt,application/pdf,text/plain"` in `<input>` covers both extension and MIME; backend is authoritative |
| Missing `python-multipart` dependency | FastAPI returns 422 on file upload without it; must be in `requirements.txt` |
| Re-running `make migrate` after model added | `create_all` is idempotent — safe to re-run |

---

## Acceptance Criteria

- [ ] User can upload a PDF or `.txt` file from the React UI
- [ ] Backend extracts raw text from PDF using `pdfplumber`
- [ ] Extracted text is stored in the SQLite `candidates` table with timestamp
- [ ] File size limit of 5 MB is enforced with a user-facing error message
- [ ] Unsupported file types return a `400` error with a clear message

---

## Notes

- **`pdfplumber` vs `PyMuPDF`:** `pdfplumber` is recommended for M1 due to zero native-binary prerequisites. If OCR for scanned resumes becomes a requirement, evaluate `PyMuPDF` + `tesseract` in a future milestone.
- **No authentication on upload endpoint:** Consistent with M1 scope (no auth). Add API key / JWT guard in a later milestone.
- **Candidate de-duplication:** Not in scope for M1. Future work: hash resume content and reject duplicates, or link candidates to job requisitions.
- **Async file I/O:** `pdfplumber` is synchronous; for high-throughput scenarios consider running extraction in a thread pool (`asyncio.to_thread`). Not needed at M1 scale.
- **Frontend state management:** Local `useState` is sufficient for M1. Introduce React Query or Zustand when the upload list / candidate management view is built.

---

*Spec generated autonomously by the Super Skills agent — no user interaction required.*
