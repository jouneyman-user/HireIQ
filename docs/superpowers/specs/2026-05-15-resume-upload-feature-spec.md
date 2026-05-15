# Technical Specification: Resume Upload Feature
## HireIQ Milestone 1 — Candidate Resume Management

**Date:** 2026-05-15  
**Issue:** jouneyman-user/HireIQ#2  
**Status:** Draft  
**Milestone:** M1 — Foundation  
**Effort:** Medium (M)

---

## 🔍 Problem Summary

Recruiters need the ability to upload candidate resumes to the HireIQ platform so that the AI agent can access candidate information for generating tailored interview questions. Currently, there is no mechanism to accept, process, or store resume files.

### Key Constraints

- **Supported formats:** PDF (.pdf) and plain text (.txt) only
- **File size limit:** 5MB maximum
- **Storage mechanism:** SQLite database (aligned with M1 scope)
- **Text extraction:** Python libraries (`pdfplumber` or `PyMuPDF`)
- **User experience:** Client-side validation + server-side enforcement with clear error messages

---

## 💡 Options Considered

### Option 1: Simple Direct Upload & Extract ✅ RECOMMENDED

**Architecture:**
- Frontend sends multipart form data (file) to `/api/candidates/upload`
- Backend validates file type and size synchronously
- Backend extracts text using `pdfplumber` (PDF) or reads plaintext (.txt)
- Extracted text stored in SQLite `candidates` table with metadata

**Pros:**
- Simplest implementation for M1 scope
- No external dependencies (job queues, async brokers)
- Immediate user feedback
- Easier to test and debug
- Text extraction time: ~0.5-2s for typical resume size (manageable)
- Single request/response cycle aligns with REST principles

**Cons:**
- Brief request delay if PDF extraction is slow
- Not ideal for files >10MB (not a constraint here)
- No retry mechanism for extraction failures

**Decision Rationale:** Aligns perfectly with M1 foundation requirements, requires only standard FastAPI + SQLAlchemy patterns already present, no new infrastructure.

---

### Option 2: Upload + Async Extraction Queue

**Architecture:**
- Frontend uploads file, immediately returns job ID
- Background worker (Celery/RQ) extracts text asynchronously
- Frontend polls or uses webhooks for completion status

**Pros:**
- Non-blocking requests
- Better UX for very large files
- Can add retry logic
- Scales for high concurrency

**Cons:**
- Requires message broker (Redis, RabbitMQ)
- Out of M1 scope (adds infrastructure)
- 5x more code to build and maintain
- Overkill for typical resume sizes (100KB-2MB)

---

### Option 3: Client-side PDF Extraction

**Architecture:**
- Frontend uses `pdf.js` or `pdfjs-dist` library
- Browser extracts text locally, sends pre-extracted text to backend
- Backend stores text directly

**Pros:**
- No backend processing load
- Works offline (extraction phase)

**Cons:**
- PDF.js adds significant JavaScript bundle size
- Extraction quality varies across browsers
- Harder to enforce quality standards
- Inconsistent handling of complex PDF structures
- Not suitable for scanned PDFs (common in recruiting)

---

## ✅ Recommended Approach

**Option 1: Simple Direct Upload & Extract**

This approach balances simplicity, maintainability, and functionality within M1 constraints.

### Why This Approach

1. **M1 Alignment:** Uses existing FastAPI + SQLAlchemy patterns; no new infrastructure
2. **Performance:** Typical resume extraction takes 0.5-2 seconds (acceptable for web request)
3. **Quality:** Server-side extraction guarantees consistent results
4. **Simplicity:** Single responsibility per endpoint; easier to test
5. **Future Proof:** Can be refactored to async in M2 without breaking client contracts

### Synchronous Processing Window

- `.txt` extraction: < 10ms
- Small PDF (< 1MB): 500ms - 1.5s
- Medium PDF (1-3MB): 1.5s - 3s
- HTTP request timeout: 30s (FastAPI default) — well above typical extraction time

---

## ⚙️ Implementation Steps

### Phase 1: Database Schema Update

**Add `candidates` table with resume content:**

```sql
CREATE TABLE IF NOT EXISTS candidates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE,
    resume_text TEXT,
    resume_filename VARCHAR(255),
    uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

**SQLAlchemy ORM Model** (`backend/app/models.py` — new file):

```python
from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime
from app.database import Base

class Candidate(Base):
    __tablename__ = "candidates"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    email = Column(String(255), unique=True, nullable=True)
    resume_text = Column(Text, nullable=True)
    resume_filename = Column(String(255), nullable=True)
    uploaded_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
```

**Add dependency injection for database session** (`backend/app/database.py` — add this function):

```python
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

### Phase 2: Backend File Processing Utilities

**Create file extraction service** (`backend/app/services/resume_extractor.py` — new file):

```python
import pdfplumber
from pathlib import Path
from typing import Tuple

MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB in bytes
ALLOWED_EXTENSIONS = {".pdf", ".txt"}

def validate_file(filename: str, file_size: int) -> Tuple[bool, str]:
    """
    Validate file type and size.
    Returns: (is_valid, error_message)
    """
    ext = Path(filename).suffix.lower()
    
    if ext not in ALLOWED_EXTENSIONS:
        return False, f"Unsupported file type: {ext}. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
    
    if file_size > MAX_FILE_SIZE:
        return False, f"File exceeds 5MB limit. Size: {file_size / (1024*1024):.1f}MB"
    
    return True, ""

def extract_text(file_content: bytes, filename: str) -> str:
    """
    Extract raw text from PDF or TXT file.
    
    Args:
        file_content: Raw file bytes
        filename: Original filename (for extension detection)
    
    Returns:
        Extracted text as string
    
    Raises:
        ValueError: If file cannot be parsed
    """
    ext = Path(filename).suffix.lower()
    
    if ext == ".txt":
        return file_content.decode("utf-8", errors="replace")
    
    elif ext == ".pdf":
        try:
            text = ""
            with pdfplumber.open(io.BytesIO(file_content)) as pdf:
                for page in pdf.pages:
                    page_text = page.extract_text()
                    if page_text:
                        text += page_text + "\n"
            return text.strip()
        except Exception as e:
            raise ValueError(f"Failed to extract PDF: {str(e)}")
    
    raise ValueError(f"Unsupported file type: {ext}")
```

**Add `pdfplumber` to requirements:**

```
# backend/requirements.txt
pdfplumber>=0.11.0
```

### Phase 3: Backend API Router

**Create candidates router** (`backend/app/routers/candidates.py` — new file):

```python
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, status
from sqlalchemy.orm import Session
from datetime import datetime
from app.database import get_db
from app.models import Candidate
from app.services.resume_extractor import validate_file, extract_text
import io

router = APIRouter(prefix="/candidates", tags=["candidates"])

@router.post("/upload", status_code=201)
async def upload_resume(
    file: UploadFile = File(...),
    candidate_name: str = None,
    candidate_email: str = None,
    db: Session = Depends(get_db)
):
    """
    Upload a candidate's resume (PDF or TXT).
    
    - **file**: Resume file (PDF or TXT, max 5MB)
    - **candidate_name**: (optional) Candidate's full name
    - **candidate_email**: (optional) Candidate's email
    
    Returns:
        - 201 Created: Success with candidate ID and resume preview
        - 400 Bad Request: Invalid file type or size exceeded
        - 500 Internal Server Error: PDF parsing failure
    """
    
    # Read file into memory
    file_content = await file.read()
    file_size = len(file_content)
    
    # Validate file
    is_valid, error_msg = validate_file(file.filename, file_size)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_msg
        )
    
    # Extract text
    try:
        resume_text = extract_text(file_content, file.filename)
        if not resume_text:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Resume file is empty or contains no extractable text"
            )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process resume: {str(e)}"
        )
    
    # Create candidate record
    candidate = Candidate(
        name=candidate_name or "Unknown",
        email=candidate_email,
        resume_text=resume_text,
        resume_filename=file.filename,
        uploaded_at=datetime.utcnow()
    )
    
    db.add(candidate)
    db.commit()
    db.refresh(candidate)
    
    return {
        "id": candidate.id,
        "filename": candidate.resume_filename,
        "uploaded_at": candidate.uploaded_at.isoformat(),
        "text_length": len(resume_text),
        "message": "Resume uploaded and processed successfully"
    }
```

**Register router in main app** (`backend/app/main.py` — update):

```python
from app.routers import health, candidates

# ... existing code ...

app.include_router(health.router)
app.include_router(candidates.router)  # Add this line
```

### Phase 4: Database Migration

**Update migration script** (`backend/migrations/init_db.py` — replace or update):

```python
from app.database import Base, engine
from app.models import Candidate

# Import all models to register them with Base
# This must happen before metadata.create_all()

def init_db():
    """
    Initialize database by creating all tables.
    Safe to run multiple times (creates only if not exists).
    """
    Base.metadata.create_all(bind=engine)

if __name__ == "__main__":
    init_db()
    print("Database initialized successfully")
```

### Phase 5: Frontend Upload Component

**Create resume upload form** (`frontend/src/components/ResumeUploadForm.tsx` — new file):

```typescript
import React, { useState } from 'react';

interface UploadResponse {
  id: number;
  filename: string;
  uploaded_at: string;
  text_length: number;
  message: string;
}

export const ResumeUploadForm: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [candidateName, setCandidateName] = useState('');
  const [candidateEmail, setCandidateEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<UploadResponse | null>(null);

  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  const ALLOWED_TYPES = ['application/pdf', 'text/plain'];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    setError(null);

    if (!selectedFile) return;

    // Client-side validation
    if (!ALLOWED_TYPES.includes(selectedFile.type)) {
      setError('Only PDF (.pdf) and TXT (.txt) files are supported');
      return;
    }

    if (selectedFile.size > MAX_FILE_SIZE) {
      setError(`File size must be less than 5MB. Your file: ${(selectedFile.size / (1024 * 1024)).toFixed(1)}MB`);
      return;
    }

    setFile(selectedFile);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!file) {
      setError('Please select a file');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      if (candidateName) formData.append('candidate_name', candidateName);
      if (candidateEmail) formData.append('candidate_email', candidateEmail);

      const response = await fetch('/api/candidates/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Upload failed');
      }

      const data: UploadResponse = await response.json();
      setSuccess(data);
      setFile(null);
      setCandidateName('');
      setCandidateEmail('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="resume-upload-form">
      <h2>Upload Candidate Resume</h2>
      
      {error && <div className="alert alert-error">{error}</div>}
      {success && (
        <div className="alert alert-success">
          <p>{success.message}</p>
          <p>Resume ID: {success.id} | File: {success.filename}</p>
          <p>Text extracted: {success.text_length} characters</p>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="candidate_name">Candidate Name (optional)</label>
          <input
            id="candidate_name"
            type="text"
            value={candidateName}
            onChange={(e) => setCandidateName(e.target.value)}
            placeholder="John Doe"
          />
        </div>

        <div className="form-group">
          <label htmlFor="candidate_email">Candidate Email (optional)</label>
          <input
            id="candidate_email"
            type="email"
            value={candidateEmail}
            onChange={(e) => setCandidateEmail(e.target.value)}
            placeholder="john@example.com"
          />
        </div>

        <div className="form-group">
          <label htmlFor="resume_file">Resume File</label>
          <input
            id="resume_file"
            type="file"
            accept=".pdf,.txt"
            onChange={handleFileChange}
            disabled={isLoading}
          />
          <small>Supported formats: PDF, TXT | Maximum size: 5MB</small>
        </div>

        <button type="submit" disabled={isLoading || !file}>
          {isLoading ? 'Uploading...' : 'Upload Resume'}
        </button>
      </form>
    </div>
  );
};
```

**Integrate into main App** (`frontend/src/App.tsx` — update):

```typescript
import { ResumeUploadForm } from './components/ResumeUploadForm';

function App() {
  return (
    <div className="app">
      <h1>HireIQ - Hiring Intelligence Platform</h1>
      <ResumeUploadForm />
      {/* ... existing health check ... */}
    </div>
  );
}
```

---

## ⚠️ Risks & Edge Cases

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Malformed PDF files crash extractor | Medium | Request failure | Wrap extraction in try-catch, return 400 error with friendly message |
| Scanned PDFs (images) produce no text | Medium | Silent failure (empty resume) | Check for empty text after extraction, reject with clear error message |
| Large PDF extraction blocks request | Low | Timeout after 30s | Typical resume: < 2s; add monitoring to track extraction times |
| Filename with special characters | Low | SQL injection / path traversal | Store filename as-is in DB; never use for file system operations |
| Concurrent uploads of same email | Low | Duplicate candidate records | Future: Add unique constraint on (email, uploaded_at) tuple; for M1, allow duplicates |
| Text encoding issues with .txt files | Low | Garbled text | Use `utf-8` with `errors="replace"` fallback |
| Browser file input accepts wrong type | Low | Client-side validation bypass | Validate again on server; size/type checks in both places |
| User uploads sensitive data (SSN, etc.) | Medium | Privacy/security | Document in API docs; future: add content scan/redaction |

### Handling Empty Extraction

If a PDF exists but contains no extractable text (scanned image PDFs):

```python
if not resume_text.strip():
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Resume file appears to be empty or a scanned image without extractable text"
    )
```

---

## 📌 Assumptions

1. **File Size Constraint:** 5MB limit is acceptable for typical resumes (most are 200KB-2MB)
2. **Synchronous Processing:** Resume extraction time (0.5-2s) is acceptable for web requests
3. **Text Quality:** `pdfplumber` extraction is sufficient for typical business resumes; scanned PDFs expected to fail
4. **No Auth Required (M1):** File uploads are unauthenticated in foundation milestone
5. **Single Candidate Per Upload:** Each upload creates/updates one candidate record
6. **Duplicate Handling:** Uploading with same email creates new record (no update logic in M1)
7. **No File Retention:** Raw PDF/TXT files are not stored; only extracted text is kept
8. **Database Availability:** SQLite is available and writable during upload

---

## 🧪 Testing Strategy

### Unit Tests

**Test file validation:**
```python
def test_validate_file_invalid_type():
    is_valid, msg = validate_file("resume.doc", 1000)
    assert not is_valid
    assert "Unsupported file type" in msg

def test_validate_file_exceeds_size():
    is_valid, msg = validate_file("resume.pdf", 6 * 1024 * 1024)
    assert not is_valid
    assert "exceeds 5MB" in msg

def test_validate_file_valid():
    is_valid, msg = validate_file("resume.pdf", 1000)
    assert is_valid
    assert msg == ""
```

**Test text extraction:**
```python
def test_extract_txt():
    content = b"John Doe\nSoftware Engineer"
    text = extract_text(content, "resume.txt")
    assert "John Doe" in text

def test_extract_pdf_valid():
    # Use fixture with real PDF bytes
    text = extract_text(pdf_bytes, "resume.pdf")
    assert len(text) > 0

def test_extract_empty_file():
    with pytest.raises(ValueError):
        extract_text(b"", "resume.pdf")
```

### Integration Tests

**Test upload endpoint:**
```python
def test_upload_resume_success(client, db_session):
    response = client.post(
        "/api/candidates/upload",
        files={"file": ("resume.pdf", pdf_content, "application/pdf")},
        data={"candidate_name": "Alice"}
    )
    assert response.status_code == 201
    assert response.json()["id"] > 0

def test_upload_invalid_type(client):
    response = client.post(
        "/api/candidates/upload",
        files={"file": ("resume.doc", content, "application/msword")}
    )
    assert response.status_code == 400
    assert "Unsupported file type" in response.json()["detail"]

def test_upload_exceeds_size(client):
    large_file = b"x" * (6 * 1024 * 1024)
    response = client.post(
        "/api/candidates/upload",
        files={"file": ("resume.pdf", large_file, "application/pdf")}
    )
    assert response.status_code == 400
    assert "exceeds 5MB" in response.json()["detail"]
```

### Frontend Tests

**Test component validation:**
```typescript
test('shows error for unsupported file type', () => {
  const { getByRole } = render(<ResumeUploadForm />);
  const input = getByRole('textbox', { name: /resume file/i }) as HTMLInputElement;
  
  fireEvent.change(input, {
    target: { files: [new File(['content'], 'test.doc', { type: 'application/msword' })] }
  });
  
  expect(screen.getByText(/only pdf and txt/i)).toBeInTheDocument();
});

test('shows error for oversized file', () => {
  const largeFile = new File(['x'.repeat(6 * 1024 * 1024)], 'big.pdf', { type: 'application/pdf' });
  // ... trigger upload ...
  expect(screen.getByText(/file size must be less than 5mb/i)).toBeInTheDocument();
});
```

---

## 📊 Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      RESUME UPLOAD FLOW                          │
└─────────────────────────────────────────────────────────────────┘

Frontend (React)              Backend (FastAPI)            Database (SQLite)
──────────────                ────────────────              ────────────────

 User selects file
 (browser input)
        │
        ├─ Client-side validation:
        │  • File type (.pdf | .txt)
        │  • File size (< 5MB)
        │  • Show errors if invalid
        │
        └─ Valid? Submit FormData
           with file + metadata
               │
               ├──────────────────────────────────────────→ POST /api/candidates/upload
                                                           
                                           │
                                           ├─ Server-side validation
                                           │  (type, size double-check)
                                           │
                                           ├─ Extract text
                                           │  if .pdf → pdfplumber
                                           │  if .txt → decode utf-8
                                           │
                                           ├─ Create Candidate record
                                           │  (resume_text, filename, timestamp)
                                           │
                                           └──────────→ INSERT INTO candidates
                                                       (name, email, resume_text,
                                                        resume_filename, uploaded_at)
                                                           │
                                                           └─ Return Candidate.id
                                           
               Return 201 Created
               + candidate ID
               + text length
               + confirmation message
               │
        ←──────────────────────────────────────────────
        │
        ├─ Show success message
        └─ Reset form
```

---

## 📋 Acceptance Criteria Mapping

| Criterion | Implementation | Test Path |
|-----------|----------------|-----------|
| User can upload PDF from React UI | `ResumeUploadForm.tsx` with file input | Frontend integration test |
| User can upload .txt from React UI | File input `accept=".pdf,.txt"` | Frontend integration test |
| Backend extracts raw text from PDF | `extract_text()` using `pdfplumber` | `test_extract_pdf_valid()` |
| Extracted text stored in SQLite | `Candidate` model, `/upload` endpoint | `test_upload_resume_success()` |
| Store with timestamp | `uploaded_at` field auto-set to `datetime.utcnow()` | Check DB schema |
| 5MB limit enforced | `validate_file()` checks size, returns 400 | `test_upload_exceeds_size()` |
| User-facing error message | HTTPException detail field shown in frontend | `test_upload_exceeds_size()` |
| Unsupported types return 400 | `validate_file()` returns False, endpoint returns 400 | `test_upload_invalid_type()` |
| Clear error message for unsupported types | Error includes file extension and allowed types | Check error message content |

---

## 🔄 Integration with M1 Architecture

This feature integrates seamlessly with existing M1 components:

| Component | Integration |
|-----------|-------------|
| `app/main.py` | Add `app.include_router(candidates.router)` |
| `app/database.py` | Add `get_db()` dependency injection function |
| `models.py` | Create new `Candidate` ORM model (already in Base) |
| `routers/` | Add new `candidates.py` router file |
| `requirements.txt` | Add `pdfplumber>=0.11.0` |
| `migrations/init_db.py` | Already calls `Base.metadata.create_all()` — no changes needed |
| CORS | `/api/candidates/upload` covered by existing wildcard CORS middleware |
| Frontend | Add `ResumeUploadForm.tsx` component + integrate into `App.tsx` |
| Vite proxy | `/api/candidates/*` automatically proxied by existing config |

---

## 🚀 Deployment Checklist

- [ ] Add `pdfplumber` to `backend/requirements.txt`
- [ ] Create `backend/app/models.py` with `Candidate` class
- [ ] Create `backend/app/services/resume_extractor.py` with utility functions
- [ ] Create `backend/app/routers/candidates.py` with upload endpoint
- [ ] Update `backend/app/main.py` to include candidates router
- [ ] Update `backend/app/database.py` to add `get_db()` function
- [ ] Verify `migrations/init_db.py` creates `candidates` table
- [ ] Create `frontend/src/components/ResumeUploadForm.tsx`
- [ ] Update `frontend/src/App.tsx` to render form
- [ ] Run full test suite (unit + integration + frontend)
- [ ] Manual testing: upload PDF, upload TXT, test size limit, test unsupported types
- [ ] Verify database records created with timestamp
- [ ] Verify extracted text stored correctly

---

## 📖 API Reference

### POST `/api/candidates/upload`

**Description:** Upload and process a candidate's resume

**Request:**
```
Content-Type: multipart/form-data

Parameters:
  - file (required): Resume file (PDF or TXT, max 5MB)
  - candidate_name (optional): string, candidate's full name
  - candidate_email (optional): string, candidate's email address
```

**Success Response (201 Created):**
```json
{
  "id": 1,
  "filename": "john_doe_resume.pdf",
  "uploaded_at": "2026-05-15T14:23:00Z",
  "text_length": 2847,
  "message": "Resume uploaded and processed successfully"
}
```

**Error Responses:**

400 Bad Request — Invalid file type:
```json
{
  "detail": "Unsupported file type: .doc. Allowed: .pdf, .txt"
}
```

400 Bad Request — File exceeds size limit:
```json
{
  "detail": "File exceeds 5MB limit. Size: 6.2MB"
}
```

400 Bad Request — Empty resume:
```json
{
  "detail": "Resume file appears to be empty or a scanned image without extractable text"
}
```

500 Internal Server Error — PDF parsing failure:
```json
{
  "detail": "Failed to process resume: [detailed error message]"
}
```

---

## 🎓 Future Considerations (Post-M1)

1. **Async Extraction:** Refactor to background job queue if extraction time becomes bottleneck
2. **Multiple Resumes:** Allow candidates to have multiple resume versions with version history
3. **Resume Parsing:** Extract structured data (skills, experience, education) using ML/NLP
4. **OCR Support:** Handle scanned PDFs using Tesseract or cloud vision APIs
5. **Resume Search:** Full-text search across all candidate resumes
6. **Resume Templates:** Suggest improvements based on industry standards
7. **File Storage:** Archive raw PDF/TXT files to cloud storage (S3, GCS) instead of just text
8. **Authentication:** Restrict uploads to authorized recruiters only
9. **Audit Trail:** Track who uploaded what resume when

---

## ✅ Sign-off

**Specification Author:** Technical Architecture Agent  
**Date:** 2026-05-15  
**Status:** Ready for Implementation  
**Next Step:** Create implementation plan using `writing-plans` skill
