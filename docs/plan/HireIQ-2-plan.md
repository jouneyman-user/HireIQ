# Resume Upload Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow recruiters to upload a PDF or .txt resume via the React UI; FastAPI extracts its text server-side and persists extracted text + metadata to the SQLite `candidates` table.

**Architecture:** Single synchronous HTTP round-trip — the React form POSTs `multipart/form-data` to `POST /candidates/resume` (proxied from browser `/api/candidates/resume`). FastAPI validates file type and size, extracts text via `pdfplumber` (PDF) or UTF-8 decode (.txt), and stores only the extracted text in SQLite — no raw file on disk. All validation is enforced both client-side (immediate UX feedback) and server-side (authoritative guard).

**Tech Stack:** FastAPI 0.111 + SQLAlchemy 2 + pdfplumber (backend); React 19 + TypeScript + Vitest 3 + MSW 2 (frontend); SQLite (database); pytest 8 + httpx (backend tests)

---

## File Map

### New Files
| File | Purpose |
|------|---------|
| `backend/app/models/__init__.py` | Package marker |
| `backend/app/models/candidate.py` | Candidate SQLAlchemy ORM model (`candidates` table) |
| `backend/app/services/__init__.py` | Package marker |
| `backend/app/services/resume_parser.py` | `extract_text(content, content_type)` — text extraction from PDF/TXT bytes |
| `backend/app/routers/candidates.py` | `POST /candidates/resume` endpoint |
| `backend/tests/conftest.py` | In-memory SQLite test DB + `client` fixture |
| `backend/tests/test_resume_parser.py` | Unit tests for `resume_parser.py` |
| `backend/tests/test_candidates_router.py` | Route integration tests for candidates router |
| `frontend/src/components/ResumeUpload.tsx` | File upload form component |
| `frontend/src/__tests__/ResumeUpload.test.tsx` | Component tests (vitest + MSW) |

### Modified Files
| File | Change |
|------|--------|
| `backend/requirements.txt` | Add `pdfplumber>=0.10.0`, `python-multipart>=0.0.9` |
| `backend/app/database.py` | Add `get_db()` dependency injection function |
| `backend/app/main.py` | Import and register `candidates` router |
| `backend/migrations/init_db.py` | Import candidate model so `create_all` covers the new table |
| `frontend/src/App.tsx` | Render `<ResumeUpload />` below the health status paragraph |

---

## Preconditions

- Python virtualenv active with existing packages installed (`make install` already run)
- `make migrate` has been run at least once (creates `hireiq.db`)
- `npm install` has been run in `frontend/`
- Working directory for backend commands: `backend/`
- Working directory for frontend commands: `frontend/`

---

## Step-by-Step Plan

### Phase 1: Preparation

---

### Task 1: Add Python Dependencies

**Files:**
- Modify: `backend/requirements.txt`

- [ ] **Step 1: Add dependencies to requirements.txt**

Replace the contents of `backend/requirements.txt` with:

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

- [ ] **Step 2: Install new dependencies**

```bash
cd backend && pip install -r requirements.txt
```

Expected: pip installs `pdfplumber` and `python-multipart` with no errors. Verify with:

```bash
python -c "import pdfplumber; print('pdfplumber OK')"
python -c "import multipart; print('multipart OK')"
```

Expected output:
```
pdfplumber OK
multipart OK
```

- [ ] **Step 3: Commit**

```bash
git add backend/requirements.txt
git commit -m "feat: add pdfplumber and python-multipart dependencies"
```

---

### Task 2: Create Candidate ORM Model

**Files:**
- Create: `backend/app/models/__init__.py`
- Create: `backend/app/models/candidate.py`

- [ ] **Step 1: Create models package**

Create `backend/app/models/__init__.py` as an empty file:

```python
# backend/app/models/__init__.py
```

- [ ] **Step 2: Create Candidate model**

Create `backend/app/models/candidate.py`:

```python
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

- [ ] **Step 3: Verify model imports without error**

```bash
cd backend && python -c "from app.models.candidate import Candidate; print(Candidate.__tablename__)"
```

Expected output:
```
candidates
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/models/
git commit -m "feat: add Candidate ORM model for candidates table"
```

---

### Task 3: Add get_db Dependency to database.py

**Files:**
- Modify: `backend/app/database.py`

The `get_db` function must live in `database.py` (not in the router) so that the test `conftest.py` can import and override it via `app.dependency_overrides[get_db]`.

- [ ] **Step 1: Add get_db to database.py**

Append to `backend/app/database.py` (keep all existing lines, add below):

```python
# backend/app/database.py  — full file after edit

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
import os

# Load project .env with override=True so project config wins over system env.
# This ensures DATABASE_URL in .env (sqlite:///./hireiq.db by default) is used
# even when a system-level DATABASE_URL points to a different database.
load_dotenv(override=True)

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./hireiq.db")

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """FastAPI dependency: yields a database session per request, then closes it."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

- [ ] **Step 2: Verify get_db is importable**

```bash
cd backend && python -c "from app.database import get_db; print('get_db OK')"
```

Expected output:
```
get_db OK
```

- [ ] **Step 3: Run existing tests to confirm nothing broke**

```bash
cd backend && pytest tests/test_health.py -v
```

Expected: all 3 health tests pass.

- [ ] **Step 4: Commit**

```bash
git add backend/app/database.py
git commit -m "feat: add get_db session dependency to database.py"
```

---

### Phase 2: Core Backend (TDD)

---

### Task 4: Resume Parser Service (TDD)

**Files:**
- Create: `backend/app/services/__init__.py`
- Create: `backend/app/services/resume_parser.py`
- Create (test): `backend/tests/test_resume_parser.py`

- [ ] **Step 1: Create services package and stub file**

Create `backend/app/services/__init__.py` as empty:

```python
# backend/app/services/__init__.py
```

Create the stub `backend/app/services/resume_parser.py`:

```python
# backend/app/services/resume_parser.py
```

- [ ] **Step 2: Write failing tests**

Create `backend/tests/test_resume_parser.py`:

```python
# backend/tests/test_resume_parser.py
"""Unit tests for the resume text extraction service."""

import pytest
from unittest.mock import patch, MagicMock

from app.services.resume_parser import extract_text


class TestExtractTextTxt:
    def test_returns_decoded_utf8_text(self):
        content = b"John Doe\nSoftware Engineer"
        result = extract_text(content, "text/plain")
        assert result == "John Doe\nSoftware Engineer"

    def test_strips_leading_and_trailing_whitespace(self):
        content = b"  Resume Content  \n"
        result = extract_text(content, "text/plain")
        assert result == "Resume Content"

    def test_non_utf8_bytes_decoded_with_replacement(self):
        # Latin-1 byte (0xe9 = é) not valid UTF-8 — must not raise
        content = b"Caf\xe9"
        result = extract_text(content, "text/plain")
        assert isinstance(result, str)
        assert len(result) > 0

    def test_empty_bytes_returns_empty_string(self):
        result = extract_text(b"", "text/plain")
        assert result == ""


class TestExtractTextPdf:
    def test_joins_page_text_from_pdfplumber(self):
        mock_page1 = MagicMock()
        mock_page1.extract_text.return_value = "Page one content"
        mock_page2 = MagicMock()
        mock_page2.extract_text.return_value = "Page two content"

        mock_pdf = MagicMock()
        mock_pdf.pages = [mock_page1, mock_page2]
        mock_pdf.__enter__ = lambda s: mock_pdf
        mock_pdf.__exit__ = MagicMock(return_value=False)

        with patch("app.services.resume_parser.pdfplumber.open", return_value=mock_pdf):
            result = extract_text(b"fake pdf bytes", "application/pdf")

        assert "Page one content" in result
        assert "Page two content" in result

    def test_skips_none_pages(self):
        mock_page1 = MagicMock()
        mock_page1.extract_text.return_value = None
        mock_page2 = MagicMock()
        mock_page2.extract_text.return_value = "Real content"

        mock_pdf = MagicMock()
        mock_pdf.pages = [mock_page1, mock_page2]
        mock_pdf.__enter__ = lambda s: mock_pdf
        mock_pdf.__exit__ = MagicMock(return_value=False)

        with patch("app.services.resume_parser.pdfplumber.open", return_value=mock_pdf):
            result = extract_text(b"fake pdf bytes", "application/pdf")

        assert result == "Real content"

    def test_returns_empty_string_for_image_only_pdf(self):
        # Scanned PDF — pdfplumber returns None for every page
        mock_page = MagicMock()
        mock_page.extract_text.return_value = None

        mock_pdf = MagicMock()
        mock_pdf.pages = [mock_page]
        mock_pdf.__enter__ = lambda s: mock_pdf
        mock_pdf.__exit__ = MagicMock(return_value=False)

        with patch("app.services.resume_parser.pdfplumber.open", return_value=mock_pdf):
            result = extract_text(b"fake image pdf", "application/pdf")

        assert result == ""


class TestExtractTextUnsupported:
    def test_raises_value_error_for_unknown_content_type(self):
        with pytest.raises(ValueError, match="Unsupported content type"):
            extract_text(b"some bytes", "image/jpeg")

    def test_raises_value_error_for_word_doc(self):
        with pytest.raises(ValueError, match="Unsupported content type"):
            extract_text(b"some bytes", "application/msword")
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd backend && pytest tests/test_resume_parser.py -v
```

Expected: ImportError or AttributeError — `extract_text` is not defined yet. All tests fail.

- [ ] **Step 4: Implement extract_text**

Replace `backend/app/services/resume_parser.py` with:

```python
# backend/app/services/resume_parser.py
"""Resume text extraction from PDF and plain-text files."""

import io
import pdfplumber


def extract_text(content: bytes, content_type: str) -> str:
    """
    Extract plain text from a PDF or plain-text file.

    Args:
        content: Raw file bytes.
        content_type: MIME type string (e.g. "application/pdf", "text/plain").

    Returns:
        Stripped plain text string (may be empty for scanned PDFs).

    Raises:
        ValueError: If the content_type is unsupported.
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

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd backend && pytest tests/test_resume_parser.py -v
```

Expected output (all green):
```
tests/test_resume_parser.py::TestExtractTextTxt::test_returns_decoded_utf8_text PASSED
tests/test_resume_parser.py::TestExtractTextTxt::test_strips_leading_and_trailing_whitespace PASSED
tests/test_resume_parser.py::TestExtractTextTxt::test_non_utf8_bytes_decoded_with_replacement PASSED
tests/test_resume_parser.py::TestExtractTextTxt::test_empty_bytes_returns_empty_string PASSED
tests/test_resume_parser.py::TestExtractTextPdf::test_joins_page_text_from_pdfplumber PASSED
tests/test_resume_parser.py::TestExtractTextPdf::test_skips_none_pages PASSED
tests/test_resume_parser.py::TestExtractTextPdf::test_returns_empty_string_for_image_only_pdf PASSED
tests/test_resume_parser.py::TestExtractTextUnsupported::test_raises_value_error_for_unknown_content_type PASSED
tests/test_resume_parser.py::TestExtractTextUnsupported::test_raises_value_error_for_word_doc PASSED
9 passed
```

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/ backend/tests/test_resume_parser.py
git commit -m "feat: add resume_parser service with unit tests"
```

---

### Task 5: Create Backend Test Fixtures (conftest.py)

**Files:**
- Create: `backend/tests/conftest.py`

The conftest sets up an in-memory SQLite database for all backend route tests. Each test gets fresh tables; dependency override ensures the route uses the test DB, not the real one.

- [ ] **Step 1: Create conftest.py**

Create `backend/tests/conftest.py`:

```python
# backend/tests/conftest.py
"""Shared pytest fixtures for backend tests."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app

# Import model to register it with Base before create_all
import app.models.candidate  # noqa: F401

TEST_DATABASE_URL = "sqlite:///:memory:"
test_engine = create_engine(
    TEST_DATABASE_URL, connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(
    autocommit=False, autoflush=False, bind=test_engine
)


@pytest.fixture
def client():
    """
    TestClient with an isolated in-memory SQLite DB.

    - Creates all tables before the test.
    - Overrides get_db so routes use the test DB, not hireiq.db.
    - Drops all tables after the test for full isolation.
    """
    Base.metadata.create_all(bind=test_engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=test_engine)
```

- [ ] **Step 2: Verify conftest loads without error**

```bash
cd backend && pytest --collect-only 2>&1 | head -20
```

Expected: no import errors in the output. The existing health tests should still be collected.

- [ ] **Step 3: Run health tests to confirm conftest does not break them**

```bash
cd backend && pytest tests/test_health.py -v
```

Expected: all 3 pass (health tests don't use `client` fixture from conftest, so no interference).

- [ ] **Step 4: Commit**

```bash
git add backend/tests/conftest.py
git commit -m "test: add conftest.py with in-memory DB fixture for route tests"
```

---

### Task 6: Create Candidates Router (TDD)

**Files:**
- Create: `backend/app/routers/candidates.py`
- Create (test): `backend/tests/test_candidates_router.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_candidates_router.py`:

```python
# backend/tests/test_candidates_router.py
"""Integration tests for POST /candidates/resume."""

import pytest
from unittest.mock import patch


class TestUploadResumeTxt:
    def test_upload_valid_txt_returns_201(self, client):
        content = b"John Doe\nSoftware Engineer\n5 years Python"
        response = client.post(
            "/candidates/resume",
            files={"file": ("resume.txt", content, "text/plain")},
        )
        assert response.status_code == 201

    def test_upload_valid_txt_returns_id_and_filename(self, client):
        content = b"Jane Smith\nProduct Manager"
        response = client.post(
            "/candidates/resume",
            files={"file": ("jane_smith.txt", content, "text/plain")},
        )
        data = response.json()
        assert isinstance(data["id"], int)
        assert data["id"] > 0
        assert data["filename"] == "jane_smith.txt"

    def test_upload_valid_txt_returns_text_preview(self, client):
        content = b"Alice Resume Content"
        response = client.post(
            "/candidates/resume",
            files={"file": ("alice.txt", content, "text/plain")},
        )
        data = response.json()
        assert "Alice Resume Content" in data["text_preview"]

    def test_upload_valid_txt_returns_uploaded_at_iso8601(self, client):
        from datetime import datetime
        content = b"Bob Resume"
        response = client.post(
            "/candidates/resume",
            files={"file": ("bob.txt", content, "text/plain")},
        )
        data = response.json()
        assert "uploaded_at" in data
        # Should not raise — this is the assertion
        datetime.fromisoformat(data["uploaded_at"])

    def test_upload_empty_txt_stores_empty_text_and_returns_201(self, client):
        response = client.post(
            "/candidates/resume",
            files={"file": ("empty.txt", b"", "text/plain")},
        )
        assert response.status_code == 201
        assert response.json()["text_preview"] == ""


class TestUploadResumePdf:
    def test_upload_pdf_with_text_returns_201(self, client):
        with patch(
            "app.routers.candidates.extract_text",
            return_value="Mocked resume text from PDF",
        ):
            response = client.post(
                "/candidates/resume",
                files={"file": ("resume.pdf", b"%PDF-1.4 placeholder", "application/pdf")},
            )
        assert response.status_code == 201

    def test_upload_pdf_text_preview_contains_extracted_content(self, client):
        with patch(
            "app.routers.candidates.extract_text",
            return_value="Skills: Python, FastAPI, React",
        ):
            response = client.post(
                "/candidates/resume",
                files={"file": ("skills.pdf", b"%PDF-1.4 placeholder", "application/pdf")},
            )
        data = response.json()
        assert "Skills: Python" in data["text_preview"]


class TestUploadResumeValidation:
    def test_unsupported_content_type_returns_400(self, client):
        response = client.post(
            "/candidates/resume",
            files={"file": ("resume.doc", b"doc content", "application/msword")},
        )
        assert response.status_code == 400

    def test_unsupported_content_type_error_message_names_the_type(self, client):
        response = client.post(
            "/candidates/resume",
            files={"file": ("resume.doc", b"doc content", "application/msword")},
        )
        detail = response.json()["detail"]
        assert "application/msword" in detail

    def test_unsupported_content_type_error_message_names_allowed_types(self, client):
        response = client.post(
            "/candidates/resume",
            files={"file": ("photo.jpg", b"jpg bytes", "image/jpeg")},
        )
        detail = response.json()["detail"]
        # Must tell the user what IS allowed
        assert "pdf" in detail.lower() or ".pdf" in detail.lower()
        assert "txt" in detail.lower() or ".txt" in detail.lower()

    def test_file_over_5mb_returns_400(self, client):
        large_content = b"x" * (5 * 1024 * 1024 + 1)  # 5MB + 1 byte
        response = client.post(
            "/candidates/resume",
            files={"file": ("big.txt", large_content, "text/plain")},
        )
        assert response.status_code == 400

    def test_file_over_5mb_error_message_mentions_limit(self, client):
        large_content = b"x" * (5 * 1024 * 1024 + 1)
        response = client.post(
            "/candidates/resume",
            files={"file": ("big.pdf", large_content, "application/pdf")},
        )
        detail = response.json()["detail"]
        assert "5 mb" in detail.lower() or "5mb" in detail.lower()

    def test_extraction_failure_returns_422(self, client):
        with patch(
            "app.routers.candidates.extract_text",
            side_effect=Exception("PDF is corrupted"),
        ):
            response = client.post(
                "/candidates/resume",
                files={"file": ("bad.pdf", b"%PDF-1.4 broken", "application/pdf")},
            )
        assert response.status_code == 422

    def test_extraction_failure_message_is_user_readable(self, client):
        with patch(
            "app.routers.candidates.extract_text",
            side_effect=Exception("Cannot decrypt PDF"),
        ):
            response = client.post(
                "/candidates/resume",
                files={"file": ("encrypted.pdf", b"%PDF-1.4", "application/pdf")},
            )
        detail = response.json()["detail"]
        assert "extract" in detail.lower() or "process" in detail.lower()

    def test_exactly_5mb_file_is_accepted(self, client):
        content_at_limit = b"x" * (5 * 1024 * 1024)  # exactly 5MB
        response = client.post(
            "/candidates/resume",
            files={"file": ("exact_limit.txt", content_at_limit, "text/plain")},
        )
        assert response.status_code == 201
```

- [ ] **Step 2: Run tests to verify they fail (router does not exist yet)**

```bash
cd backend && pytest tests/test_candidates_router.py -v 2>&1 | head -30
```

Expected: `ModuleNotFoundError` or `404` — the router does not exist and is not registered.

- [ ] **Step 3: Create the candidates router**

Create `backend/app/routers/candidates.py`:

```python
# backend/app/routers/candidates.py
"""Candidates router — resume upload endpoint."""

from datetime import datetime, timezone

from fastapi import APIRouter, File, HTTPException, UploadFile, status, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.candidate import Candidate
from app.services.resume_parser import extract_text

MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB in bytes
ALLOWED_CONTENT_TYPES = {"application/pdf", "text/plain"}

router = APIRouter(prefix="/candidates", tags=["candidates"])


@router.post("/resume", status_code=status.HTTP_201_CREATED)
async def upload_resume(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """
    Upload a candidate's resume (PDF or plain text).

    - Validates file content type (application/pdf or text/plain).
    - Enforces a 5 MB file size limit.
    - Extracts plain text from the uploaded file.
    - Persists extracted text + metadata to the candidates table.

    Returns:
        201: { id, filename, uploaded_at, text_preview }
        400: Invalid content type or file too large.
        422: File is valid but text could not be extracted.
    """
    # --- Validate content type first (before reading the full body) ---
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Unsupported file type '{file.content_type}'. "
                "Please upload a PDF (.pdf) or plain-text (.txt) file."
            ),
        )

    # --- Read body and validate size ---
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

    # --- Persist candidate record ---
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

- [ ] **Step 4: Run tests — they will still fail (router not registered in main.py yet)**

```bash
cd backend && pytest tests/test_candidates_router.py -v 2>&1 | head -20
```

Expected: all tests return 404 — the router exists but is not mounted yet. This is intentional; we wire it in Task 7.

- [ ] **Step 5: Commit the router (pre-wiring)**

```bash
git add backend/app/routers/candidates.py backend/tests/test_candidates_router.py
git commit -m "feat: add candidates router with upload endpoint and route tests"
```

---

### Phase 3: Backend Integration

---

### Task 7: Wire Router into main.py and Update Migration

**Files:**
- Modify: `backend/app/main.py`
- Modify: `backend/migrations/init_db.py`

- [ ] **Step 1: Register candidates router in main.py**

Replace `backend/app/main.py` with:

```python
# backend/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import health, candidates

app = FastAPI(title="HireIQ API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(candidates.router)
```

- [ ] **Step 2: Update migration to import Candidate model**

Replace `backend/migrations/init_db.py` with:

```python
# backend/migrations/init_db.py
from app.database import Base, engine
import app.main  # noqa: F401 — importing app.main triggers:
                 # candidates router → Candidate model → registers with Base
                 # All models are registered before create_all runs.

if __name__ == "__main__":
    Base.metadata.create_all(bind=engine)
    print("Database initialised.")
```

- [ ] **Step 3: Run the migration to create the candidates table**

```bash
cd backend && python -m migrations.init_db
```

Expected output:
```
Database initialised.
```

Verify the table was created:

```bash
cd backend && python -c "
import sqlite3
conn = sqlite3.connect('hireiq.db')
cursor = conn.execute(\"SELECT name FROM sqlite_master WHERE type='table'\")
print([row[0] for row in cursor.fetchall()])
"
```

Expected output includes `candidates`:
```
['candidates']
```

- [ ] **Step 4: Run all backend tests**

```bash
cd backend && pytest -v
```

Expected: all tests pass — health tests (3) + resume parser tests (9) + candidates router tests (13) = 25 passing.

- [ ] **Step 5: Commit**

```bash
git add backend/app/main.py backend/migrations/init_db.py
git commit -m "feat: register candidates router and update migration to create candidates table"
```

---

### Phase 4: Frontend

---

### Task 8: ResumeUpload Component (TDD)

**Files:**
- Create: `frontend/src/components/ResumeUpload.tsx`
- Create (test): `frontend/src/__tests__/ResumeUpload.test.tsx`

- [ ] **Step 1: Create components directory and stub component**

```bash
mkdir -p frontend/src/components
```

Create stub `frontend/src/components/ResumeUpload.tsx`:

```tsx
// frontend/src/components/ResumeUpload.tsx
export function ResumeUpload() {
  return <div>TODO</div>
}
```

- [ ] **Step 2: Write failing tests**

Create `frontend/src/__tests__/ResumeUpload.test.tsx`:

```tsx
// frontend/src/__tests__/ResumeUpload.test.tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { ResumeUpload } from '../components/ResumeUpload'

const server = setupServer()

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('ResumeUpload', () => {
  describe('initial render', () => {
    it('renders a file input with aria-label "Resume file"', () => {
      render(<ResumeUpload />)
      expect(screen.getByLabelText(/resume file/i)).toBeInTheDocument()
    })

    it('renders an upload button that is initially disabled', () => {
      render(<ResumeUpload />)
      expect(screen.getByRole('button', { name: /^upload$/i })).toBeDisabled()
    })

    it('does not show any error alert initially', () => {
      render(<ResumeUpload />)
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  describe('client-side validation', () => {
    it('shows error alert when user selects an unsupported file type', async () => {
      const user = userEvent.setup()
      render(<ResumeUpload />)

      const input = screen.getByLabelText(/resume file/i)
      const file = new File(['content'], 'resume.doc', { type: 'application/msword' })
      await user.upload(input, file)

      expect(screen.getByRole('alert')).toHaveTextContent(/only pdf or \.txt/i)
    })

    it('shows error alert when user selects a file over 5 MB', async () => {
      const user = userEvent.setup()
      render(<ResumeUpload />)

      const input = screen.getByLabelText(/resume file/i)
      const bigContent = 'x'.repeat(5 * 1024 * 1024 + 1)
      const file = new File([bigContent], 'big.pdf', { type: 'application/pdf' })
      await user.upload(input, file)

      expect(screen.getByRole('alert')).toHaveTextContent(/5 mb or smaller/i)
    })

    it('enables upload button when a valid file is selected', async () => {
      const user = userEvent.setup()
      render(<ResumeUpload />)

      const input = screen.getByLabelText(/resume file/i)
      const file = new File(['resume content'], 'resume.pdf', { type: 'application/pdf' })
      await user.upload(input, file)

      expect(screen.getByRole('button', { name: /^upload$/i })).toBeEnabled()
    })

    it('clears any previous error when a valid file is selected', async () => {
      const user = userEvent.setup()
      render(<ResumeUpload />)

      const input = screen.getByLabelText(/resume file/i)

      // First pick an invalid file to trigger error
      const bad = new File(['x'], 'bad.exe', { type: 'application/x-msdownload' })
      await user.upload(input, bad)
      expect(screen.getByRole('alert')).toBeInTheDocument()

      // Then pick a valid file — error should clear
      const good = new File(['content'], 'good.txt', { type: 'text/plain' })
      await user.upload(input, good)
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  describe('form submission — success', () => {
    it('shows success message with filename after upload', async () => {
      server.use(
        http.post('/api/candidates/resume', () =>
          HttpResponse.json(
            {
              id: 42,
              filename: 'alice_resume.pdf',
              uploaded_at: '2026-05-15T10:00:00+00:00',
              text_preview: 'Alice Johnson, Senior Engineer',
            },
            { status: 201 }
          )
        )
      )

      const user = userEvent.setup()
      render(<ResumeUpload />)

      const input = screen.getByLabelText(/resume file/i)
      await user.upload(input, new File(['pdf bytes'], 'alice_resume.pdf', { type: 'application/pdf' }))
      await user.click(screen.getByRole('button', { name: /^upload$/i }))

      await waitFor(() => {
        expect(screen.getByText(/uploaded/i)).toBeInTheDocument()
        expect(screen.getByText('alice_resume.pdf')).toBeInTheDocument()
      })
    })

    it('shows text preview from API response', async () => {
      server.use(
        http.post('/api/candidates/resume', () =>
          HttpResponse.json(
            {
              id: 1,
              filename: 'resume.txt',
              uploaded_at: '2026-05-15T10:00:00+00:00',
              text_preview: 'John Doe Resume Preview',
            },
            { status: 201 }
          )
        )
      )

      const user = userEvent.setup()
      render(<ResumeUpload />)

      const input = screen.getByLabelText(/resume file/i)
      await user.upload(input, new File(['content'], 'resume.txt', { type: 'text/plain' }))
      await user.click(screen.getByRole('button', { name: /^upload$/i }))

      await waitFor(() => {
        expect(screen.getByText(/John Doe Resume Preview/)).toBeInTheDocument()
      })
    })
  })

  describe('form submission — error', () => {
    it('shows API error detail on 400 response', async () => {
      server.use(
        http.post('/api/candidates/resume', () =>
          HttpResponse.json(
            { detail: 'File exceeds the 5 MB limit. Please upload a smaller file.' },
            { status: 400 }
          )
        )
      )

      const user = userEvent.setup()
      render(<ResumeUpload />)

      const input = screen.getByLabelText(/resume file/i)
      await user.upload(input, new File(['bytes'], 'resume.pdf', { type: 'application/pdf' }))
      await user.click(screen.getByRole('button', { name: /^upload$/i }))

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('File exceeds the 5 MB limit.')
      })
    })

    it('shows network error message on fetch failure', async () => {
      server.use(
        http.post('/api/candidates/resume', () => HttpResponse.error())
      )

      const user = userEvent.setup()
      render(<ResumeUpload />)

      const input = screen.getByLabelText(/resume file/i)
      await user.upload(input, new File(['bytes'], 'resume.pdf', { type: 'application/pdf' }))
      await user.click(screen.getByRole('button', { name: /^upload$/i }))

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/network error/i)
      })
    })

    it('shows loading text on button while uploading', async () => {
      let resolveUpload!: () => void
      server.use(
        http.post('/api/candidates/resume', () =>
          new Promise((resolve) => {
            resolveUpload = () =>
              resolve(
                HttpResponse.json(
                  { id: 1, filename: 'r.pdf', uploaded_at: '', text_preview: '' },
                  { status: 201 }
                )
              )
          })
        )
      )

      const user = userEvent.setup()
      render(<ResumeUpload />)

      const input = screen.getByLabelText(/resume file/i)
      await user.upload(input, new File(['bytes'], 'r.pdf', { type: 'application/pdf' }))
      user.click(screen.getByRole('button', { name: /^upload$/i }))

      await waitFor(() => {
        expect(screen.getByRole('button')).toHaveTextContent(/uploading/i)
      })

      resolveUpload()
    })
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd frontend && npm test -- ResumeUpload.test.tsx 2>&1 | tail -20
```

Expected: multiple failures — stub component renders "TODO" and has none of the expected elements.

- [ ] **Step 4: Implement ResumeUpload component**

Replace `frontend/src/components/ResumeUpload.tsx` with:

```tsx
// frontend/src/components/ResumeUpload.tsx
import { useState, ChangeEvent, FormEvent } from 'react'

const MAX_BYTES = 5 * 1024 * 1024 // 5 MB
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

    if (!selected) {
      setFile(null)
      return
    }

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

  const isLoading = uploadState.status === 'loading'

  return (
    <form onSubmit={handleSubmit}>
      <h2>Upload Resume</h2>

      <div>
        <label htmlFor="resume-file">Resume file</label>
        <input
          id="resume-file"
          type="file"
          accept=".pdf,.txt"
          aria-label="Resume file"
          onChange={handleFileChange}
          disabled={isLoading}
        />
        <small>Accepted: PDF or .txt — max 5 MB</small>
      </div>

      <button type="submit" disabled={!file || isLoading}>
        {isLoading ? 'Uploading…' : 'Upload'}
      </button>

      {uploadState.status === 'error' && (
        <p role="alert" style={{ color: 'red' }}>
          {uploadState.message}
        </p>
      )}

      {uploadState.status === 'success' && (
        <div>
          <p>
            ✅ Uploaded <strong>{uploadState.filename}</strong> (ID: {uploadState.id})
          </p>
          {uploadState.preview && (
            <pre style={{ fontSize: '0.75rem', maxHeight: '6rem', overflow: 'auto' }}>
              {uploadState.preview}
            </pre>
          )}
        </div>
      )}
    </form>
  )
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd frontend && npm test -- ResumeUpload.test.tsx 2>&1 | tail -30
```

Expected: all tests pass. Look for output like:
```
✓ ResumeUpload > initial render > renders a file input...
✓ ResumeUpload > initial render > renders an upload button that is initially disabled
...
16 tests passed
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ResumeUpload.tsx frontend/src/__tests__/ResumeUpload.test.tsx
git commit -m "feat: add ResumeUpload component with full test coverage"
```

---

### Task 9: Integrate ResumeUpload into App.tsx

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Add ResumeUpload to App.tsx**

Replace `frontend/src/App.tsx` with:

```tsx
// frontend/src/App.tsx
import { useEffect, useState } from 'react'
import { ResumeUpload } from './components/ResumeUpload'

function App() {
  const [status, setStatus] = useState<string>('loading…')

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((d) => setStatus(d.status))
      .catch(() => setStatus('unreachable'))
  }, [])

  return (
    <div>
      <h1>HireIQ</h1>
      <p>API status: <strong>{status}</strong></p>
      <ResumeUpload />
    </div>
  )
}

export default App
```

- [ ] **Step 2: Run existing App tests to confirm they still pass**

```bash
cd frontend && npm test -- App.test.tsx 2>&1 | tail -10
```

Expected: all 4 existing App tests still pass. Adding `<ResumeUpload />` should not break them because the component does not make API calls on mount.

- [ ] **Step 3: Run all frontend tests**

```bash
cd frontend && npm test 2>&1 | tail -10
```

Expected: all tests (App.test.tsx + ResumeUpload.test.tsx) pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: integrate ResumeUpload component into App"
```

---

### Phase 5: Testing & Validation

---

### Task 10: Full Test Suite Validation

- [ ] **Step 1: Run complete backend test suite with coverage**

```bash
cd backend && pytest -v --cov=app --cov-report=term-missing
```

Expected output includes:
```
tests/test_health.py::... PASSED (3 tests)
tests/test_resume_parser.py::... PASSED (9 tests)
tests/test_candidates_router.py::... PASSED (13 tests)
---------- coverage: app/ ----------
TOTAL                                     XX%
25 passed
```

Coverage should be ≥ 80% for `app/`. Key modules to check: `app/services/resume_parser.py`, `app/routers/candidates.py`.

- [ ] **Step 2: Run complete frontend test suite with coverage**

```bash
cd frontend && npm run test:coverage 2>&1 | tail -20
```

Expected: all tests pass; coverage ≥ 80% for `src/components/ResumeUpload.tsx`.

- [ ] **Step 3: Run the linter**

```bash
make lint
```

Expected: no errors from `ruff` (backend) or `eslint`+`tsc` (frontend).

- [ ] **Step 4: Run migration on a fresh database**

```bash
# Simulate fresh environment
cd backend && rm -f hireiq.db && python -m migrations.init_db
```

Expected output:
```
Database initialised.
```

Verify:
```bash
cd backend && python -c "
import sqlite3, os
conn = sqlite3.connect('hireiq.db')
cursor = conn.execute(\"PRAGMA table_info(candidates)\")
cols = [row[1] for row in cursor.fetchall()]
print('Columns:', cols)
assert 'id' in cols
assert 'resume_text' in cols
assert 'uploaded_at' in cols
print('Schema OK')
"
```

Expected:
```
Columns: ['id', 'resume_filename', 'resume_content_type', 'resume_text', 'uploaded_at']
Schema OK
```

- [ ] **Step 5: Manual smoke test — start both servers**

```bash
make dev
# In another terminal:
```

Open browser at `http://localhost:5173`. Verify:
- HireIQ heading is visible
- API status shows `ok`
- Upload Resume form is visible

- [ ] **Step 6: Manual smoke test — upload a .txt file**

Create a test file and upload it:
```bash
echo "Jane Smith\nSoftware Engineer\n10 years Python" > /tmp/test_resume.txt
```

Using curl (or the browser form):
```bash
curl -s -X POST http://localhost:8000/candidates/resume \
  -F "file=@/tmp/test_resume.txt;type=text/plain" | python3 -m json.tool
```

Expected response:
```json
{
  "id": 1,
  "filename": "test_resume.txt",
  "uploaded_at": "2026-05-15T...",
  "text_preview": "Jane Smith\nSoftware Engineer\n10 years Python"
}
```

- [ ] **Step 7: Manual smoke test — test 400 for unsupported file**

```bash
curl -s -X POST http://localhost:8000/candidates/resume \
  -F "file=@/tmp/test_resume.txt;type=application/msword" | python3 -m json.tool
```

Expected:
```json
{
  "detail": "Unsupported file type 'application/msword'. Please upload a PDF (.pdf) or plain-text (.txt) file."
}
```

HTTP status 400 confirmed by:
```bash
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8000/candidates/resume \
  -F "file=@/tmp/test_resume.txt;type=application/msword"
```
Expected: `400`

- [ ] **Step 8: Manual smoke test — test 400 for oversized file**

```bash
dd if=/dev/urandom of=/tmp/big_resume.txt bs=1M count=6 2>/dev/null
curl -s -X POST http://localhost:8000/candidates/resume \
  -F "file=@/tmp/big_resume.txt;type=text/plain" | python3 -m json.tool
```

Expected:
```json
{
  "detail": "File exceeds the 5 MB limit. Please upload a smaller file."
}
```

- [ ] **Step 9: Final commit**

```bash
git add .
git status  # verify nothing unexpected is staged
git commit -m "chore: verify all tests pass and smoke tests complete for resume upload feature"
```

---

## Impacted Files / Modules

| File | Type | Change |
|------|------|--------|
| `backend/requirements.txt` | Modified | Added pdfplumber, python-multipart |
| `backend/app/database.py` | Modified | Added `get_db()` function |
| `backend/app/main.py` | Modified | Added `candidates` router import + `include_router` |
| `backend/app/models/__init__.py` | Created | Package marker |
| `backend/app/models/candidate.py` | Created | Candidate ORM model (`candidates` table) |
| `backend/app/services/__init__.py` | Created | Package marker |
| `backend/app/services/resume_parser.py` | Created | `extract_text()` function |
| `backend/app/routers/candidates.py` | Created | `POST /candidates/resume` endpoint |
| `backend/migrations/init_db.py` | Modified | Import candidate model so migration covers new table |
| `backend/tests/conftest.py` | Created | In-memory test DB + client fixture |
| `backend/tests/test_resume_parser.py` | Created | 9 unit tests for resume_parser |
| `backend/tests/test_candidates_router.py` | Created | 13 route integration tests |
| `frontend/src/components/ResumeUpload.tsx` | Created | Upload form component |
| `frontend/src/__tests__/ResumeUpload.test.tsx` | Created | 16 component tests |
| `frontend/src/App.tsx` | Modified | Added `<ResumeUpload />` |

---

## Risks & Mitigation

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| pdfplumber cannot extract text from scanned (image-only) PDFs | Medium | Returns empty string; `text_preview` in response will be empty. No error raised — accepted per design doc. |
| Password-protected PDFs cause extraction exception | Low | Router catches all extraction exceptions and returns 422 with readable message. |
| `file.content_type` can be spoofed by the client | Medium | Server validates the MIME type reported by the browser. For M1 this is sufficient; magic-byte validation can be added in M2. |
| Large `.txt` files may have non-UTF-8 content | Low | `errors="replace"` in UTF-8 decode ensures no crash; garbled characters are acceptable. |
| `file.filename` is `None` | Low | Router defaults to `"resume"` when `file.filename` is `None`. |
| SQLite WAL mode write contention | Very Low | M1 is single-developer; SQLite handles this at M1 scale. |
| Existing `App.test.tsx` breaks after adding `<ResumeUpload />` | Low | `ResumeUpload` makes no API calls on mount. Existing tests verified in Task 9 Step 2. |

---

## Validation Checklist

- [ ] `POST /candidates/resume` accepts `.txt` file and returns 201 with `id`, `filename`, `uploaded_at`, `text_preview`
- [ ] `POST /candidates/resume` accepts `.pdf` file (via pdfplumber) and returns 201
- [ ] `POST /candidates/resume` returns 400 with clear message for unsupported file types
- [ ] `POST /candidates/resume` returns 400 with "5 MB" mentioned for oversized files
- [ ] `POST /candidates/resume` returns 422 when extraction fails (e.g., corrupted PDF)
- [ ] Extracted text is stored in `candidates` table with `uploaded_at` timestamp
- [ ] React UI shows file input accepting `.pdf` and `.txt` only
- [ ] React UI shows error immediately (client-side) for wrong type or oversized file
- [ ] React UI shows success state with filename and text preview after upload
- [ ] React UI shows error state with server's error detail on API failure
- [ ] All backend tests pass: `cd backend && pytest -v` — 25 tests
- [ ] All frontend tests pass: `cd frontend && npm test` — 20 tests
- [ ] Linter passes: `make lint` — no errors
- [ ] Migration is idempotent: running `make migrate` twice does not error
- [ ] No regressions in existing health endpoint tests
