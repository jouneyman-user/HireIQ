# Resume Upload — PDF & Plain Text Extraction and Storage

> **Issue:** [#2 — Resume upload: accept PDF and plain text, extract and store content](https://github.com/jouneyman-user/HireIQ/issues/2)  
> **Milestone:** M1 — Foundation  
> **Date:** 2026-05-14  
> **Status:** Approved for implementation

---

## 🔍 Problem Summary

HireIQ needs to accept candidate resumes from a recruiter-facing React UI and make their content available to the AI interview-question agent. At M1 the agent is not yet wired up, but the data pipeline must be in place: ingest a file (PDF or plain text), extract its raw text content, and persist that text alongside a timestamp in the `candidates` SQLite table so future milestones can query it.

**Constraints (from acceptance criteria):**
- Accepted formats: `.pdf` (MIME: `application/pdf`) and `.txt` (MIME: `text/plain`)
- Maximum file size: 5 MB — enforced both client-side (immediate UX feedback) and server-side (authoritative guard)
- Unsupported file type → HTTP 400 with a clear human-readable message
- Over-size file → HTTP 400 with a clear human-readable message
- Extracted text stored in a new `candidates` table with an `uploaded_at` timestamp
- No external cloud services; everything runs locally in the M1 environment

**Implicit requirements derived from ARCHITECTURE.md and CONSTITUTION.md:**
- Follow the router-per-domain pattern already established in `backend/app/routers/`
- Introduce a `models/` layer (currently absent) for SQLAlchemy ORM models
- The `candidates` table does not yet exist; a new idempotent migration script is required
- The frontend must follow the existing `App.tsx` pattern: minimal component, `fetch` to `/api/*` (proxied by Vite)
- `pdfplumber` is the preferred PDF library (listed first in the issue); it is pure-Python and requires no system dependencies

---

## 💡 Options Considered

### Option 1 — Single endpoint, in-memory extraction, text-only storage (recommended)

A single `POST /candidates/resume` endpoint accepts a `multipart/form-data` upload. The file bytes are read into memory, text is extracted immediately (no file written to disk), and only the extracted text plus metadata are committed to SQLite.

**Pros:**
- Zero disk I/O beyond the database write — no orphaned files, no cleanup tasks
- Simplest possible surface area; one round-trip from UI to DB
- Fully consistent with M1 "no external dependencies, zero extra complexity" mandate
- The issue acceptance criteria says "extracted text is stored" — not the original file
- Easy to unit-test: inject bytes, assert text

**Cons:**
- Original file is not retained; cannot re-extract if the parsing library changes later
- Large PDFs could briefly spike memory (mitigated by the 5 MB hard limit)

---

### Option 2 — Store file on disk AND extracted text in DB

Save the original file to `backend/uploads/` and write the extracted text to the `candidates` table. The DB row references the saved file path.

**Pros:**
- Original file preserved for audit or re-processing
- Possible to swap PDF library without re-uploading

**Cons:**
- Introduces `uploads/` directory that must be gitignored and manually cleaned in development
- Two persistence concerns (disk + DB) that must stay in sync
- Over-engineered for M1; the agent only needs text
- No S3/blob-store at M1 means local disk is a dead-end pattern anyway

---

### Option 3 — Two-step upload then process

Separate endpoints: `POST /candidates/resume/upload` stores the file temporarily; `POST /candidates/resume/process` triggers extraction and commits the record.

**Pros:**
- Opens a path to async background processing in later milestones

**Cons:**
- Requires transient file storage between steps
- Two HTTP round-trips for what is a single atomic action
- Premature architecture for M1; adds state the UI must manage

---

## ✅ Recommended Approach

**Option 1 — Single endpoint, in-memory extraction, text-only storage.**

Reason: It satisfies every acceptance criterion with the smallest footprint, zero new infrastructure, and no cleanup burden. It follows YAGNI cleanly. If file retention becomes a requirement in M2/M3 it can be added as an additive column (`resume_file_path`) without touching the extraction logic.

---

## ⚙️ Implementation Steps

### 1. Dependencies — `backend/requirements.txt`

Add `pdfplumber>=0.10.0` (pure-Python, no system libs needed).  
No other new dependencies required (`python-multipart` is already pulled in transitively by FastAPI's upload support; pin it explicitly as `python-multipart>=0.0.9` for clarity).

```
fastapi>=0.111.0
uvicorn[standard]>=0.29.0
sqlalchemy>=2.0.0
python-dotenv>=1.0.0
python-multipart>=0.0.9
pdfplumber>=0.10.0
ruff>=0.4.0
pytest>=8.0.0
pytest-asyncio>=0.23.0
httpx>=0.27.0
```

---

### 2. ORM Model — `backend/app/models/candidate.py`

Create a new `models/` package alongside `routers/`.

```python
# backend/app/models/__init__.py  (empty)
# backend/app/models/candidate.py

from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, DateTime
from app.database import Base


class Candidate(Base):
    __tablename__ = "candidates"

    id = Column(Integer, primary_key=True, autoincrement=True)
    resume_filename = Column(String(255), nullable=False)
    resume_content_type = Column(String(64), nullable=False)
    resume_text = Column(Text, nullable=False)
    uploaded_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
```

**Why `Text` and not `String`?** Resume text can easily exceed SQLite's `VARCHAR` practical limit; `Text` maps to `TEXT` in SQLite which is unbounded.

**Why no `name` column yet?** The acceptance criteria don't require it. It is trivially addable as a nullable column in a later migration without breaking this one.

---

### 3. Resume Parser Service — `backend/app/services/resume_parser.py`

Encapsulate all extraction logic in a single, independently-testable function. The router calls this; the router does not know about pdfplumber.

```python
# backend/app/services/__init__.py  (empty)
# backend/app/services/resume_parser.py

import pdfplumber
import io


def extract_text(content: bytes, content_type: str) -> str:
    """
    Extract plain text from a PDF or plain-text file.

    Args:
        content: Raw file bytes.
        content_type: MIME type string (e.g. "application/pdf", "text/plain").

    Returns:
        Stripped plain text string.

    Raises:
        ValueError: If the content_type is unsupported or extraction yields no text.
    """
    if content_type == "text/plain":
        return content.decode("utf-8", errors="replace").strip()

    if content_type == "application/pdf":
        text_parts = []
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(page_text)
        return "\n".join(text_parts).strip()

    raise ValueError(f"Unsupported content type: {content_type}")
```

**Key decisions:**
- UTF-8 with `errors="replace"` for `.txt` — tolerates non-UTF-8 files without crashing
- Returns joined page text for PDFs (preserves page breaks as `\n`)
- Raises `ValueError` only on unsupported type; extraction errors surface as exceptions naturally

---

### 4. Candidates Router — `backend/app/routers/candidates.py`

```python
# backend/app/routers/candidates.py

from fastapi import APIRouter, File, UploadFile, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime, timezone

from app.database import SessionLocal
from app.models.candidate import Candidate
from app.services.resume_parser import extract_text

MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB
ALLOWED_CONTENT_TYPES = {"application/pdf", "text/plain"}

router = APIRouter(prefix="/candidates", tags=["candidates"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/resume", status_code=status.HTTP_201_CREATED)
async def upload_resume(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """
    Accept a PDF or plain-text resume, extract its text, and store it.

    Returns the new candidate record (id, filename, uploaded_at, text preview).
    """
    # --- Validate content type ---
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Unsupported file type '{file.content_type}'. "
                "Please upload a PDF (.pdf) or plain-text (.txt) file."
            ),
        )

    # --- Read and validate size ---
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File exceeds the 5 MB limit. Please upload a smaller file.",
        )

    # --- Extract text ---
    try:
        text = extract_text(content, file.content_type)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Could not extract text from the uploaded file: {exc}",
        ) from exc

    # --- Persist ---
    candidate = Candidate(
        resume_filename=file.filename or "resume",
        resume_content_type=file.content_type,
        resume_text=text,
        uploaded_at=datetime.now(timezone.utc),
    )
    db.add(candidate)
    db.commit()
    db.refresh(candidate)

    return {
        "id": candidate.id,
        "filename": candidate.resume_filename,
        "uploaded_at": candidate.uploaded_at.isoformat(),
        "text_preview": text[:200],
    }
```

**Design notes:**
- `get_db()` is the session-per-request pattern documented in ARCHITECTURE.md ("planned for M2" — now introduced here)
- Size check happens *after* content type validation to avoid reading a large hostile file of unknown type
- Extraction errors return `422` (semantically: valid upload, unprocessable content) rather than `400`
- `text_preview` (first 200 chars) in the response lets the UI give instant confirmation without returning the full resume text

---

### 5. Register Router — `backend/app/main.py`

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import health, candidates  # ← add candidates

app = FastAPI(title="HireIQ API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(candidates.router)  # ← add this line
```

---

### 6. Database Migration — `backend/migrations/add_candidates_table.py`

```python
# backend/migrations/add_candidates_table.py

from app.database import Base, engine
import app.models.candidate  # noqa: F401 — registers Candidate with Base

if __name__ == "__main__":
    Base.metadata.create_all(bind=engine)
    print("Candidates table created (idempotent).")
```

Update `Makefile` `migrate` target to run both `init_db.py` and `add_candidates_table.py` (or simply ensure `init_db.py` imports `app.models.candidate` so `create_all` covers the new table too).

> **Idempotency guarantee:** `create_all` uses `CREATE TABLE IF NOT EXISTS` — safe to re-run.

---

### 7. Frontend Component — `frontend/src/components/ResumeUpload.tsx`

A self-contained component that renders a file input, performs client-side validation, POSTs to `/api/candidates/resume`, and displays a success or error state.

```tsx
// frontend/src/components/ResumeUpload.tsx

import { useState, ChangeEvent, FormEvent } from 'react'

const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED_TYPES = ['application/pdf', 'text/plain']

type UploadState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'loading' }
  | { status: 'success'; id: number; filename: string; preview: string }

export function ResumeUpload() {
  const [file, setFile] = useState<File | null>(null)
  const [uploadState, setUploadState] = useState<UploadState>({ status: 'idle' })

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null
    setUploadState({ status: 'idle' })

    if (!selected) { setFile(null); return }

    if (!ALLOWED_TYPES.includes(selected.type)) {
      setFile(null)
      setUploadState({ status: 'error', message: 'Only PDF or .txt files are supported.' })
      return
    }
    if (selected.size > MAX_BYTES) {
      setFile(null)
      setUploadState({ status: 'error', message: 'File must be 5 MB or smaller.' })
      return
    }
    setFile(selected)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!file) return

    setUploadState({ status: 'loading' })
    const form = new FormData()
    form.append('file', file)

    try {
      const res = await fetch('/api/candidates/resume', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) {
        setUploadState({ status: 'error', message: data.detail ?? 'Upload failed.' })
        return
      }
      setUploadState({
        status: 'success',
        id: data.id,
        filename: data.filename,
        preview: data.text_preview,
      })
    } catch {
      setUploadState({ status: 'error', message: 'Network error — please try again.' })
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2>Upload Resume</h2>
      <input
        type="file"
        accept=".pdf,.txt"
        onChange={handleFileChange}
        aria-label="Resume file"
      />
      <button type="submit" disabled={!file || uploadState.status === 'loading'}>
        {uploadState.status === 'loading' ? 'Uploading…' : 'Upload'}
      </button>

      {uploadState.status === 'error' && (
        <p role="alert" style={{ color: 'red' }}>{uploadState.status === 'error' && uploadState.message}</p>
      )}
      {uploadState.status === 'success' && (
        <div>
          <p>✅ Uploaded <strong>{uploadState.filename}</strong> (ID: {uploadState.id})</p>
          <pre style={{ fontSize: '0.75rem', maxHeight: '6rem', overflow: 'auto' }}>
            {uploadState.preview}
          </pre>
        </div>
      )}
    </form>
  )
}
```

Mount in `App.tsx`:
```tsx
import { ResumeUpload } from './components/ResumeUpload'
// … add <ResumeUpload /> below the health status paragraph
```

---

### 8. Tests

**Backend — `backend/tests/test_candidates_router.py`**

| Test case | Scenario |
|-----------|----------|
| `test_upload_txt_success` | Upload valid `.txt` → 201, `id` in response |
| `test_upload_pdf_success` | Upload minimal valid PDF → 201 |
| `test_upload_wrong_type` | Upload `.docx` → 400, detail mentions file type |
| `test_upload_over_size` | Upload 6 MB `.txt` → 400, detail mentions 5 MB |
| `test_upload_empty_txt` | Upload empty `.txt` → stores empty text, 201 (no crash) |

**Backend — `backend/tests/test_resume_parser.py`**

| Test case | Scenario |
|-----------|----------|
| `test_parse_txt` | Plain UTF-8 bytes → correct string returned |
| `test_parse_txt_non_utf8` | Latin-1 bytes → decoded with replacement chars, no exception |
| `test_parse_pdf` | Minimal PDF bytes via pdfplumber → non-empty string |
| `test_parse_unsupported` | `image/jpeg` content type → `ValueError` raised |

**Frontend — `frontend/src/__tests__/ResumeUpload.test.tsx`**

| Test case | Scenario |
|-----------|----------|
| Renders file input and upload button | Smoke test |
| Shows error for unsupported file type | DOCX selected → error message shown |
| Shows error for oversized file | 6 MB file selected → error message shown |
| Shows success state after upload | Mocked `fetch` returns 201 → success UI |
| Shows error state on API 400 | Mocked `fetch` returns 400 → error UI |

---

## ⚠️ Risks / Edge Cases

| Risk | Mitigation |
|------|------------|
| **Image-only PDFs** (scanned, no text layer) | `pdfplumber` returns empty string per page. Store empty text; UI shows preview as empty. Consider adding a warning in the response if `text_preview` is empty. |
| **Very large text extraction** from a 5 MB PDF | Text can be > 5 MB when decoded. SQLite `TEXT` is unbounded — no issue. Memory briefly holds both raw bytes and text; acceptable at M1 scale. |
| **`file.content_type` spoofing** | Client can set any MIME type. Server validates MIME type from the `UploadFile` metadata (browser-provided). This is sufficient for M1. A deeper check (magic bytes) can be added in M2 if needed. |
| **Concurrent uploads** to the same SQLite DB | SQLite WAL mode serialises writes. At M1 (single dev), this is not a concern. |
| **`file.filename` is `None`** | The router defensively defaults to `"resume"` if `file.filename` is `None`. |
| **PDF with password protection** | `pdfplumber` raises an exception. The router catches all extraction exceptions and returns a `422` with a clear message. |
| **Migration order** | `add_candidates_table.py` must be run *after* `init_db.py` (or the two can be merged). The recommended approach is to have `init_db.py` import the model so a single `make migrate` call covers all tables. |

---

## 📌 Assumptions

1. **`python-multipart` is available** — FastAPI's `UploadFile` requires it. It is not currently listed in `requirements.txt` but is a transitive dependency of `fastapi[all]`. Pinning it explicitly removes ambiguity.
2. **pdfplumber is the chosen PDF library** — listed first in the issue; PyMuPDF is an acceptable alternative but requires compiled C extensions which could complicate M1's "no external dependencies" goal on some machines.
3. **No candidate name field at M1** — the issue acceptance criteria do not mention it. `name` is nullable and can be added later via migration.
4. **The `candidates` table starts empty** — no seed data required.
5. **UTF-8 is the expected encoding for `.txt` files** — with `errors="replace"` as a safety net for non-UTF-8 inputs.
6. **The Vite proxy strips `/api` prefix** — so `POST /api/candidates/resume` in the browser maps to `POST /candidates/resume` in FastAPI. The FastAPI router uses prefix `/candidates`, not `/api/candidates`.
7. **No authentication at M1** — anyone who can reach the dev server can upload. This is consistent with the M1 scope defined in ARCHITECTURE.md.
