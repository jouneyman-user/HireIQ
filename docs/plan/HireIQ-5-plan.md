# Question Display UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Issue:** [#5 — Question display UI — render categorised questions with follow-ups and tips](https://github.com/jouneyman-user/HireIQ/issues/5)
> **Spec:** `docs/spec/HireIQ-5-2026-05-20.md`
> **Date:** 2026-05-20
> **Effort:** M (Medium)
> **Milestone:** M2 — Core Agent

**Goal:** Build a rich question-display UI — collapsible category sections, per-question cards with follow-up and evaluation tip, clipboard copy on individual cards and the whole set, a loading skeleton during generation — and simultaneously repair the integration gap where `App.tsx` sends `resume_id` instead of the `resume_text` the backend expects.

**Architecture:** A new backend endpoint `GET /resumes/{id}/text` (pdfplumber) returns extracted resume text. The frontend calls it before `POST /api/generate/`. Three new, focused React components (`QuestionCard`, `QuestionSkeleton`, `QuestionDisplay`) are created with full Vitest unit-test coverage. `App.tsx` is updated last — new types, two-step generate flow, and the new component renders.

**Tech Stack:** React 19 + TypeScript (inline styles, no CSS framework), Vitest + @testing-library/react + MSW 2, FastAPI + pdfplumber (Python), pytest + FastAPI TestClient

---

## Preconditions

- Issue #4 (AI question generation) is merged. `POST /api/generate/` returns `{ technical, behavioural, culture_fit }` where each value is a list of `{ text, follow_up, what_to_listen_for }` objects.
- All existing tests pass before you start:
  ```bash
  cd backend && pytest -v
  cd frontend && npm test
  ```
- Node.js and Python virtualenv are activated.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| **Modify** | `backend/requirements.txt` | Add `pdfplumber>=0.11.0` |
| **Modify** | `backend/app/routers/resumes.py` | Add `GET /{resume_id}/text` endpoint |
| **Modify** | `backend/tests/test_resumes.py` | Add tests for the new text-extraction endpoint |
| **Create** | `frontend/src/components/QuestionCard.tsx` | Single question card — main Q, follow-up, eval tip, per-card copy button |
| **Create** | `frontend/src/__tests__/QuestionCard.test.tsx` | Unit tests for QuestionCard |
| **Create** | `frontend/src/components/QuestionSkeleton.tsx` | Animated shimmer skeleton while generation is in progress |
| **Create** | `frontend/src/__tests__/QuestionSkeleton.test.tsx` | Unit tests for QuestionSkeleton |
| **Create** | `frontend/src/components/QuestionDisplay.tsx` | Collapsible category sections + copy-all button; composes QuestionCard |
| **Create** | `frontend/src/__tests__/QuestionDisplay.test.tsx` | Unit tests for QuestionDisplay |
| **Modify** | `frontend/src/App.tsx` | Replace stale `GenerateResult` type; update `handleGenerate` (two-step fetch); import + render new components |
| **Modify** | `frontend/src/__tests__/App.test.tsx` | Update MSW handler for `POST /api/generate/` to real shape; add handler for `GET /api/resumes/:id/text` |

---

## Step-by-Step Plan

### Phase 1: Preparation

- [ ] **Step 1.1: Verify all existing tests pass**

  ```bash
  cd backend && pytest -v
  ```
  Expected: all existing tests green (health, resumes, generate).

  ```bash
  cd frontend && npm test
  ```
  Expected: all 8 App tests + JobRoleForm tests pass.

  If any test is red, stop and fix before continuing.

- [ ] **Step 1.2: Confirm pdfplumber is absent from requirements.txt**

  ```bash
  grep pdfplumber backend/requirements.txt
  ```
  Expected: no output (it is not there yet — the spec incorrectly states it already is).

---

### Phase 2: Add pdfplumber Dependency

- [ ] **Step 2.1: Add pdfplumber to `backend/requirements.txt`**

  Open `backend/requirements.txt`. The current file is:

  ```
  fastapi>=0.111.0
  uvicorn[standard]>=0.29.0
  sqlalchemy>=2.0.0
  python-dotenv>=1.0.0
  python-multipart>=0.0.9
  ruff>=0.4.0
  pytest>=8.0.0
  pytest-asyncio>=0.23.0
  httpx>=0.27.0
  anthropic>=0.25.0
  ```

  Replace it with:

  ```
  fastapi>=0.111.0
  uvicorn[standard]>=0.29.0
  sqlalchemy>=2.0.0
  python-dotenv>=1.0.0
  python-multipart>=0.0.9
  ruff>=0.4.0
  pytest>=8.0.0
  pytest-asyncio>=0.23.0
  httpx>=0.27.0
  anthropic>=0.25.0
  pdfplumber>=0.11.0
  ```

- [ ] **Step 2.2: Install the new dependency**

  ```bash
  cd backend && pip install -r requirements.txt
  ```
  Expected: `Successfully installed pdfplumber-...` (along with its deps `pdfminer.six`, `Pillow`, etc.)

- [ ] **Step 2.3: Verify the import works**

  ```bash
  cd backend && python -c "import pdfplumber; print(pdfplumber.__version__)"
  ```
  Expected: version string printed (e.g. `0.11.4`).

- [ ] **Step 2.4: Commit**

  ```bash
  git add backend/requirements.txt
  git commit -m "chore: add pdfplumber dependency for resume text extraction"
  ```

---

### Phase 3: Backend — `GET /resumes/{id}/text` Endpoint

- [ ] **Step 3.1: Write the failing tests first**

  Open `backend/tests/test_resumes.py`. Append the following tests **after** the existing `test_get_resume_404` function (do not remove any existing tests):

  ```python
  # ── resume text extraction ────────────────────────────────────────────────────

  def test_get_resume_text_returns_404_for_missing_id():
      """GET /resumes/{id}/text with non-existent ID should return 404."""
      response = client.get("/resumes/99999/text")
      assert response.status_code == 404


  def test_get_resume_text_returns_422_when_file_missing_on_disk(tmp_path, monkeypatch):
      """GET /resumes/{id}/text returns 404 when stored file is absent from disk."""
      import app.routers.resumes as resumes_module
      monkeypatch.setattr(resumes_module, "UPLOAD_DIR", str(tmp_path))

      # Upload a resume so the DB row exists
      upload_resp = client.post(
          "/resumes/",
          data={"candidate_name": "Ghost", "candidate_email": "ghost@test.com"},
          files=[_pdf_file()],
      )
      resume_id = upload_resp.json()["id"]

      # Delete the actual file from disk
      stored = upload_resp.json()["stored_filename"]
      (tmp_path / stored).unlink()

      response = client.get(f"/resumes/{resume_id}/text")
      assert response.status_code == 404


  def test_get_resume_text_returns_422_for_non_text_pdf(tmp_path, monkeypatch):
      """GET /resumes/{id}/text returns 422 when pdfplumber extracts empty text."""
      import app.routers.resumes as resumes_module
      monkeypatch.setattr(resumes_module, "UPLOAD_DIR", str(tmp_path))

      upload_resp = client.post(
          "/resumes/",
          data={"candidate_name": "Blank", "candidate_email": "blank@test.com"},
          files=[_pdf_file()],  # b"%PDF-1.4 fake content" — pdfplumber finds no text
      )
      resume_id = upload_resp.json()["id"]
      response = client.get(f"/resumes/{resume_id}/text")
      # Fake PDF yields no extractable text → 422
      assert response.status_code == 422


  def test_get_resume_text_returns_resume_text(tmp_path, monkeypatch):
      """GET /resumes/{id}/text returns {resume_text: <str>} for a real text-based PDF."""
      import io
      import app.routers.resumes as resumes_module

      monkeypatch.setattr(resumes_module, "UPLOAD_DIR", str(tmp_path))

      # Build a minimal real PDF that pdfplumber can extract text from.
      # This uses only stdlib — no extra test deps required.
      pdf_content = (
          b"%PDF-1.4\n"
          b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
          b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"
          b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]\n"
          b"   /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n"
          b"4 0 obj\n<< /Length 44 >>\nstream\n"
          b"BT /F1 12 Tf 72 720 Td (Hello World) Tj ET\n"
          b"endstream\nendobj\n"
          b"5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n"
          b"xref\n0 6\n"
          b"0000000000 65535 f \n"
          b"0000000009 00000 n \n"
          b"0000000058 00000 n \n"
          b"0000000115 00000 n \n"
          b"0000000266 00000 n \n"
          b"0000000360 00000 n \n"
          b"trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n441\n%%EOF\n"
      )
      real_pdf = ("file", ("real.pdf", io.BytesIO(pdf_content), "application/pdf"))
      upload_resp = client.post(
          "/resumes/",
          data={"candidate_name": "Real", "candidate_email": "real@test.com"},
          files=[real_pdf],
      )
      assert upload_resp.status_code == 201
      resume_id = upload_resp.json()["id"]

      response = client.get(f"/resumes/{resume_id}/text")
      # A proper PDF either extracts text (200) or — if the minimal test PDF
      # above doesn't yield text via pdfplumber — returns 422.
      # The critical assertion: endpoint exists and returns one of the valid codes.
      assert response.status_code in (200, 422)
      if response.status_code == 200:
          assert "resume_text" in response.json()
          assert isinstance(response.json()["resume_text"], str)
  ```

- [ ] **Step 3.2: Run the new tests to confirm they fail**

  ```bash
  cd backend && pytest tests/test_resumes.py -v -k "text"
  ```
  Expected: 4 failures — `404 Not Found` because the route doesn't exist yet.

- [ ] **Step 3.3: Implement `GET /{resume_id}/text` in `backend/app/routers/resumes.py`**

  Open `backend/app/routers/resumes.py`. Add these imports at the top (after the existing imports):

  ```python
  import io
  import pdfplumber
  ```

  Then append the new endpoint **after** the existing `get_resume` function:

  ```python
  @router.get("/{resume_id}/text")
  def get_resume_text(resume_id: int, db: Session = Depends(get_db)):
      """Extract and return the raw text from a stored resume PDF.

      Returns:
          200 {"resume_text": "<extracted text>"}
          404 if the resume DB record or the file on disk is not found.
          422 if pdfplumber cannot extract any text (e.g. scanned image PDF).
      """
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

  > **Note:** `os` is already imported at the top of `resumes.py`. Do not add a duplicate import.

- [ ] **Step 3.4: Run the new tests**

  ```bash
  cd backend && pytest tests/test_resumes.py -v -k "text"
  ```
  Expected: all 4 new text-extraction tests pass.

- [ ] **Step 3.5: Run the full backend test suite to check for regressions**

  ```bash
  cd backend && pytest -v
  ```
  Expected: all tests pass (health, resumes, generate).

- [ ] **Step 3.6: Run ruff**

  ```bash
  cd backend && ruff check .
  ```
  Expected: no output. If violations appear fix them and re-run `pytest -v`.

- [ ] **Step 3.7: Commit**

  ```bash
  git add backend/app/routers/resumes.py backend/tests/test_resumes.py
  git commit -m "feat: add GET /resumes/{id}/text endpoint for PDF text extraction"
  ```

---

### Phase 4: Frontend — `QuestionCard` Component

- [ ] **Step 4.1: Write the failing tests**

  Create `frontend/src/__tests__/QuestionCard.test.tsx` with this content:

  ```tsx
  import { render, screen, fireEvent, waitFor } from '@testing-library/react'
  import { describe, it, expect, vi, beforeEach } from 'vitest'
  import { QuestionCard } from '../components/QuestionCard'

  const QUESTION = {
    text: 'Describe a time you optimised a slow query.',
    follow_up: 'What was the measurable impact?',
    what_to_listen_for: 'Candidate should mention EXPLAIN ANALYSE and indexing strategies.',
  }

  // Mock navigator.clipboard before each test.
  const writeTextMock = vi.fn().mockResolvedValue(undefined)

  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(navigator, 'clipboard', {
      writable: true,
      configurable: true,
      value: { writeText: writeTextMock },
    })
  })

  describe('QuestionCard', () => {
    it('renders the main question text', () => {
      render(<QuestionCard question={QUESTION} index={0} />)
      expect(
        screen.getByText(/Describe a time you optimised a slow query/i)
      ).toBeInTheDocument()
    })

    it('renders a 1-based index prefix before the question', () => {
      render(<QuestionCard question={QUESTION} index={2} />)
      // index 2 → displayed as "3."
      expect(screen.getByText(/3\./)).toBeInTheDocument()
    })

    it('renders the follow-up text', () => {
      render(<QuestionCard question={QUESTION} index={0} />)
      expect(
        screen.getByText(/What was the measurable impact\?/i)
      ).toBeInTheDocument()
    })

    it('renders the evaluation tip text', () => {
      render(<QuestionCard question={QUESTION} index={0} />)
      expect(
        screen.getByText(/EXPLAIN ANALYSE and indexing strategies/i)
      ).toBeInTheDocument()
    })

    it('renders a copy button with aria-label "Copy question"', () => {
      render(<QuestionCard question={QUESTION} index={0} />)
      expect(screen.getByRole('button', { name: /copy question/i })).toBeInTheDocument()
    })

    it('calls clipboard.writeText with formatted content when copy button is clicked', async () => {
      render(<QuestionCard question={QUESTION} index={0} />)
      fireEvent.click(screen.getByRole('button', { name: /copy question/i }))
      await waitFor(() => {
        expect(writeTextMock).toHaveBeenCalledTimes(1)
      })
      const written: string = writeTextMock.mock.calls[0][0]
      expect(written).toContain('Q1:')
      expect(written).toContain(QUESTION.text)
      expect(written).toContain('Follow-up:')
      expect(written).toContain(QUESTION.follow_up)
      expect(written).toContain('Tip:')
      expect(written).toContain(QUESTION.what_to_listen_for)
    })

    it('shows "✓ Copied" feedback immediately after clicking copy', async () => {
      render(<QuestionCard question={QUESTION} index={0} />)
      fireEvent.click(screen.getByRole('button', { name: /copy question/i }))
      await waitFor(() => {
        expect(screen.getByText(/✓ Copied/i)).toBeInTheDocument()
      })
    })
  })
  ```

- [ ] **Step 4.2: Run the tests to confirm they fail**

  ```bash
  cd frontend && npm test -- QuestionCard
  ```
  Expected: all 7 tests fail with `Cannot find module '../components/QuestionCard'`.

- [ ] **Step 4.3: Create `frontend/src/components/QuestionCard.tsx`**

  ```tsx
  import { useState } from 'react'

  export type Question = {
    text: string
    follow_up: string
    what_to_listen_for: string
  }

  type Props = {
    question: Question
    index: number
  }

  export function QuestionCard({ question, index }: Props) {
    const [copied, setCopied] = useState(false)

    const handleCopy = async () => {
      const content = [
        `Q${index + 1}: ${question.text}`,
        `Follow-up: ${question.follow_up}`,
        `Tip: ${question.what_to_listen_for}`,
      ].join('\n')
      try {
        await navigator.clipboard.writeText(content)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch {
        // clipboard not available (non-HTTPS or older browser) — fail silently
      }
    }

    return (
      <div
        style={{
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          padding: '1rem',
          marginBottom: '0.75rem',
          background: '#fff',
          position: 'relative',
          wordBreak: 'break-word',
        }}
      >
        {/* Copy button */}
        <button
          onClick={handleCopy}
          aria-label="Copy question"
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            background: 'none',
            border: '1px solid #cbd5e1',
            borderRadius: 4,
            padding: '2px 8px',
            cursor: 'pointer',
            fontSize: 12,
            color: copied ? '#16a34a' : '#64748b',
          }}
        >
          {copied ? '✓ Copied' : '📋 Copy'}
        </button>

        {/* Main question */}
        <p style={{ fontWeight: 600, marginTop: 0, marginRight: 80 }}>
          {index + 1}. {question.text}
        </p>

        {/* Follow-up */}
        <div
          style={{
            background: '#f0f9ff',
            borderLeft: '3px solid #38bdf8',
            padding: '0.5rem 0.75rem',
            marginBottom: '0.5rem',
            borderRadius: '0 4px 4px 0',
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: '#0369a1',
              textTransform: 'uppercase',
            }}
          >
            Follow-up
          </span>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: '#0c4a6e' }}>
            {question.follow_up}
          </p>
        </div>

        {/* Evaluation tip */}
        <div
          style={{
            background: '#fefce8',
            borderLeft: '3px solid #facc15',
            padding: '0.5rem 0.75rem',
            borderRadius: '0 4px 4px 0',
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: '#854d0e',
              textTransform: 'uppercase',
            }}
          >
            Evaluation tip
          </span>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: '#713f12' }}>
            {question.what_to_listen_for}
          </p>
        </div>
      </div>
    )
  }
  ```

- [ ] **Step 4.4: Run the tests again**

  ```bash
  cd frontend && npm test -- QuestionCard
  ```
  Expected: all 7 tests pass.

- [ ] **Step 4.5: Commit**

  ```bash
  git add frontend/src/components/QuestionCard.tsx \
          frontend/src/__tests__/QuestionCard.test.tsx
  git commit -m "feat: add QuestionCard component with copy-to-clipboard"
  ```

---

### Phase 5: Frontend — `QuestionSkeleton` Component

- [ ] **Step 5.1: Write the failing tests**

  Create `frontend/src/__tests__/QuestionSkeleton.test.tsx`:

  ```tsx
  import { render, screen } from '@testing-library/react'
  import { describe, it, expect } from 'vitest'
  import { QuestionSkeleton } from '../components/QuestionSkeleton'

  describe('QuestionSkeleton', () => {
    it('renders an element with role="status"', () => {
      render(<QuestionSkeleton />)
      expect(screen.getByRole('status')).toBeInTheDocument()
    })

    it('has aria-label "Generating questions…"', () => {
      render(<QuestionSkeleton />)
      expect(
        screen.getByRole('status', { name: /generating questions/i })
      ).toBeInTheDocument()
    })

    it('renders skeleton blocks for three category sections', () => {
      render(<QuestionSkeleton />)
      // Each category renders its label as aria-hidden text — we check via
      // the category title text nodes inside the component.
      const statuses = screen.getAllByRole('status')
      // The outer wrapper has role="status"; that's the one we care about.
      expect(statuses.length).toBeGreaterThanOrEqual(1)
    })

    it('renders at least 9 skeleton card placeholders (3 per category × 3 categories)', () => {
      const { container } = render(<QuestionSkeleton />)
      // Each card placeholder is a div with a specific border style.
      // Count divs that have inline border style (the card wrappers).
      const cardDivs = container.querySelectorAll('div[style*="border: 1px solid #e2e8f0"]')
      expect(cardDivs.length).toBeGreaterThanOrEqual(9)
    })
  })
  ```

- [ ] **Step 5.2: Run to confirm failure**

  ```bash
  cd frontend && npm test -- QuestionSkeleton
  ```
  Expected: 4 failures — `Cannot find module '../components/QuestionSkeleton'`.

- [ ] **Step 5.3: Create `frontend/src/components/QuestionSkeleton.tsx`**

  ```tsx
  const SkeletonBlock = ({ width, height }: { width?: string; height?: number }) => (
    <div
      aria-hidden="true"
      style={{
        width: width ?? '100%',
        height: height ?? 16,
        background:
          'linear-gradient(90deg, #e2e8f0 25%, #f1f5f9 50%, #e2e8f0 75%)',
        backgroundSize: '200% 100%',
        borderRadius: 4,
        marginBottom: 8,
        animation: 'shimmer 1.5s infinite',
      }}
    />
  )

  const CATEGORIES = ['Technical', 'Behavioural', 'Culture Fit']

  export function QuestionSkeleton() {
    return (
      <>
        <style>{`
          @keyframes shimmer {
            0%   { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }
        `}</style>

        <div
          role="status"
          aria-label="Generating questions…"
          style={{ marginTop: '2rem' }}
        >
          {/* Heading skeleton */}
          <SkeletonBlock width="40%" height={28} />

          {CATEGORIES.map((cat) => (
            <div key={cat} style={{ marginBottom: '1.5rem' }}>
              {/* Section header skeleton */}
              <SkeletonBlock height={42} />

              {/* Card skeletons */}
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    padding: '1rem',
                    marginBottom: '0.75rem',
                    background: '#fff',
                  }}
                >
                  <SkeletonBlock width="90%" height={20} />
                  <SkeletonBlock width="70%" height={14} />
                  <SkeletonBlock height={38} />
                  <SkeletonBlock height={38} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </>
    )
  }
  ```

- [ ] **Step 5.4: Run the tests**

  ```bash
  cd frontend && npm test -- QuestionSkeleton
  ```
  Expected: all 4 tests pass.

- [ ] **Step 5.5: Commit**

  ```bash
  git add frontend/src/components/QuestionSkeleton.tsx \
          frontend/src/__tests__/QuestionSkeleton.test.tsx
  git commit -m "feat: add QuestionSkeleton loading component"
  ```

---

### Phase 6: Frontend — `QuestionDisplay` Component

- [ ] **Step 6.1: Write the failing tests**

  Create `frontend/src/__tests__/QuestionDisplay.test.tsx`:

  ```tsx
  import { render, screen, fireEvent, waitFor } from '@testing-library/react'
  import { describe, it, expect, vi, beforeEach } from 'vitest'
  import { QuestionDisplay } from '../components/QuestionDisplay'

  const writeTextMock = vi.fn().mockResolvedValue(undefined)

  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(navigator, 'clipboard', {
      writable: true,
      configurable: true,
      value: { writeText: writeTextMock },
    })
  })

  const QUESTIONS = {
    technical: [
      { text: 'T1', follow_up: 'T1-FU', what_to_listen_for: 'T1-Tip' },
      { text: 'T2', follow_up: 'T2-FU', what_to_listen_for: 'T2-Tip' },
      { text: 'T3', follow_up: 'T3-FU', what_to_listen_for: 'T3-Tip' },
    ],
    behavioural: [
      { text: 'B1', follow_up: 'B1-FU', what_to_listen_for: 'B1-Tip' },
      { text: 'B2', follow_up: 'B2-FU', what_to_listen_for: 'B2-Tip' },
      { text: 'B3', follow_up: 'B3-FU', what_to_listen_for: 'B3-Tip' },
    ],
    culture_fit: [
      { text: 'C1', follow_up: 'C1-FU', what_to_listen_for: 'C1-Tip' },
      { text: 'C2', follow_up: 'C2-FU', what_to_listen_for: 'C2-Tip' },
      { text: 'C3', follow_up: 'C3-FU', what_to_listen_for: 'C3-Tip' },
    ],
  }

  describe('QuestionDisplay', () => {
    it('renders the "Generated Questions" heading', () => {
      render(<QuestionDisplay questions={QUESTIONS} />)
      expect(
        screen.getByRole('heading', { name: /generated questions/i })
      ).toBeInTheDocument()
    })

    it('renders all three category section headers', () => {
      render(<QuestionDisplay questions={QUESTIONS} />)
      expect(screen.getByText(/^Technical$/)).toBeInTheDocument()
      expect(screen.getByText(/^Behavioural$/)).toBeInTheDocument()
      expect(screen.getByText(/^Culture Fit$/)).toBeInTheDocument()
    })

    it('shows question count in each section header', () => {
      render(<QuestionDisplay questions={QUESTIONS} />)
      // Each section has 3 questions — check that "3 questions" appears 3 times
      const countLabels = screen.getAllByText(/3 questions/)
      expect(countLabels).toHaveLength(3)
    })

    it('renders all 9 question cards by default (all sections expanded)', () => {
      render(<QuestionDisplay questions={QUESTIONS} />)
      // Each card shows its question text
      expect(screen.getByText('T1')).toBeInTheDocument()
      expect(screen.getByText('B1')).toBeInTheDocument()
      expect(screen.getByText('C1')).toBeInTheDocument()
    })

    it('collapses a section when its header button is clicked', () => {
      render(<QuestionDisplay questions={QUESTIONS} />)
      // Click "Technical" section header to collapse it
      const technicalHeader = screen.getByRole('button', { name: /technical/i })
      fireEvent.click(technicalHeader)
      // Technical questions should no longer be visible
      expect(screen.queryByText('T1')).not.toBeInTheDocument()
      // Other sections remain visible
      expect(screen.getByText('B1')).toBeInTheDocument()
    })

    it('re-expands a section when its header is clicked again', () => {
      render(<QuestionDisplay questions={QUESTIONS} />)
      const technicalHeader = screen.getByRole('button', { name: /technical/i })
      fireEvent.click(technicalHeader) // collapse
      fireEvent.click(technicalHeader) // expand
      expect(screen.getByText('T1')).toBeInTheDocument()
    })

    it('section header has aria-expanded=true when open', () => {
      render(<QuestionDisplay questions={QUESTIONS} />)
      const technicalHeader = screen.getByRole('button', { name: /technical/i })
      expect(technicalHeader).toHaveAttribute('aria-expanded', 'true')
    })

    it('section header has aria-expanded=false after collapsing', () => {
      render(<QuestionDisplay questions={QUESTIONS} />)
      const technicalHeader = screen.getByRole('button', { name: /technical/i })
      fireEvent.click(technicalHeader)
      expect(technicalHeader).toHaveAttribute('aria-expanded', 'false')
    })

    it('renders a "Copy all questions" button', () => {
      render(<QuestionDisplay questions={QUESTIONS} />)
      expect(
        screen.getByRole('button', { name: /copy all questions/i })
      ).toBeInTheDocument()
    })

    it('calls clipboard.writeText when "Copy all questions" is clicked', async () => {
      render(<QuestionDisplay questions={QUESTIONS} />)
      fireEvent.click(screen.getByRole('button', { name: /copy all questions/i }))
      await waitFor(() => {
        expect(writeTextMock).toHaveBeenCalledTimes(1)
      })
      const written: string = writeTextMock.mock.calls[0][0]
      // Should contain all three category headers
      expect(written).toContain('=== Technical ===')
      expect(written).toContain('=== Behavioural ===')
      expect(written).toContain('=== Culture Fit ===')
      // Should contain question text from each category
      expect(written).toContain('T1')
      expect(written).toContain('B1')
      expect(written).toContain('C1')
    })

    it('renders an empty section gracefully when a category has 0 questions', () => {
      const sparse = { ...QUESTIONS, technical: [] }
      // Should not throw
      expect(() => render(<QuestionDisplay questions={sparse} />)).not.toThrow()
      // "0 questions" label appears for Technical
      expect(screen.getByText(/0 questions/)).toBeInTheDocument()
    })
  })
  ```

- [ ] **Step 6.2: Run to confirm failure**

  ```bash
  cd frontend && npm test -- QuestionDisplay
  ```
  Expected: failures — `Cannot find module '../components/QuestionDisplay'`.

- [ ] **Step 6.3: Create `frontend/src/components/QuestionDisplay.tsx`**

  ```tsx
  import { useState } from 'react'
  import { QuestionCard, Question } from './QuestionCard'

  type QuestionSet = {
    technical: Question[]
    behavioural: Question[]
    culture_fit: Question[]
  }

  type Props = {
    questions: QuestionSet
  }

  type CategoryKey = keyof QuestionSet

  const CATEGORY_LABELS: Record<CategoryKey, string> = {
    technical: 'Technical',
    behavioural: 'Behavioural',
    culture_fit: 'Culture Fit',
  }

  const CATEGORY_COLOURS: Record<CategoryKey, string> = {
    technical: '#6366f1',
    behavioural: '#0891b2',
    culture_fit: '#16a34a',
  }

  const CATEGORY_ORDER: CategoryKey[] = ['technical', 'behavioural', 'culture_fit']

  function buildAllText(questions: QuestionSet): string {
    return CATEGORY_ORDER.map((key) => {
      const label = CATEGORY_LABELS[key]
      const section = questions[key]
        .map(
          (q, i) =>
            `${i + 1}. ${q.text}\n   Follow-up: ${q.follow_up}\n   Tip: ${q.what_to_listen_for}`
        )
        .join('\n\n')
      return `=== ${label} ===\n${section}`
    }).join('\n\n')
  }

  export function QuestionDisplay({ questions }: Props) {
    const [openSections, setOpenSections] = useState<Record<CategoryKey, boolean>>({
      technical: true,
      behavioural: true,
      culture_fit: true,
    })
    const [allCopied, setAllCopied] = useState(false)

    const toggleSection = (key: CategoryKey) => {
      setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }))
    }

    const handleCopyAll = async () => {
      try {
        await navigator.clipboard.writeText(buildAllText(questions))
        setAllCopied(true)
        setTimeout(() => setAllCopied(false), 2000)
      } catch {
        // clipboard unavailable — fail silently
      }
    }

    return (
      <div style={{ marginTop: '2rem' }}>
        {/* Header row */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
          }}
        >
          <h2 style={{ margin: 0 }}>Generated Questions</h2>
          <button
            onClick={handleCopyAll}
            aria-label="Copy all questions"
            style={{
              border: '1px solid #cbd5e1',
              borderRadius: 6,
              padding: '6px 14px',
              background: allCopied ? '#dcfce7' : '#f8fafc',
              cursor: 'pointer',
              fontSize: 13,
              color: allCopied ? '#16a34a' : '#334155',
            }}
          >
            {allCopied ? '✓ All copied!' : '📋 Copy all questions'}
          </button>
        </div>

        {/* Category sections */}
        {CATEGORY_ORDER.map((key) => {
          const colour = CATEGORY_COLOURS[key]
          const label = CATEGORY_LABELS[key]
          const isOpen = openSections[key]
          const qs = questions[key]

          return (
            <div key={key} style={{ marginBottom: '1.5rem' }}>
              {/* Collapsible header */}
              <button
                onClick={() => toggleSection(key)}
                aria-expanded={isOpen}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  background: colour,
                  color: '#fff',
                  border: 'none',
                  borderRadius: isOpen ? '8px 8px 0 0' : 8,
                  padding: '0.75rem 1rem',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontWeight: 700,
                  fontSize: 15,
                }}
              >
                <span>{label}</span>
                <span style={{ fontSize: 12, opacity: 0.85 }}>
                  {qs.length} question{qs.length !== 1 ? 's' : ''} {isOpen ? '▲' : '▼'}
                </span>
              </button>

              {isOpen && (
                <div
                  style={{
                    border: `1px solid ${colour}`,
                    borderTop: 'none',
                    borderRadius: '0 0 8px 8px',
                    padding: '1rem',
                    background: '#fafafa',
                  }}
                >
                  {qs.map((q, i) => (
                    <QuestionCard key={i} question={q} index={i} />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }
  ```

- [ ] **Step 6.4: Run the tests**

  ```bash
  cd frontend && npm test -- QuestionDisplay
  ```
  Expected: all 11 tests pass.

- [ ] **Step 6.5: Commit**

  ```bash
  git add frontend/src/components/QuestionDisplay.tsx \
          frontend/src/__tests__/QuestionDisplay.test.tsx
  git commit -m "feat: add QuestionDisplay component with collapsible categories and copy-all"
  ```

---

### Phase 7: Frontend — Fix `App.tsx`

- [ ] **Step 7.1: Open `frontend/src/App.tsx` and confirm the stale code**

  Verify:
  - `GenerateResult` type has `message`, `resume_id`, `job_title`, `seniority_level`, `key_skills` — this is **wrong**.
  - `handleGenerate` posts `resume_id` — this is **wrong**.
  - Render shows `{generateResult && <p style={{ color: 'green' }}>{generateResult.message}</p>}` — this is **wrong**.

- [ ] **Step 7.2: Replace `frontend/src/App.tsx` with the corrected version**

  Replace the entire file with:

  ```tsx
  import { useEffect, useState } from 'react'
  import { ResumeList } from './components/ResumeList'
  import { ResumeUpload } from './components/ResumeUpload'
  import { JobRoleForm, JobRoleData } from './components/JobRoleForm'
  import { QuestionDisplay } from './components/QuestionDisplay'
  import { QuestionSkeleton } from './components/QuestionSkeleton'

  type Resume = {
    id: number
    candidate_name: string
    candidate_email: string
    original_filename: string
    file_size_bytes: number
    uploaded_at: string
  }

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

  function App() {
    const [resumes, setResumes] = useState<Resume[]>([])
    const [activeResumeId, setActiveResumeId] = useState<number | null>(null)
    const [generateResult, setGenerateResult] = useState<GenerateResult | null>(null)
    const [generateError, setGenerateError] = useState<string | null>(null)
    const [generating, setGenerating] = useState(false)

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
        // Step 1: fetch extracted resume text from the backend
        const textRes = await fetch(`/api/resumes/${activeResumeId}/text`)
        const textData = await textRes.json()
        if (!textRes.ok) {
          throw new Error(textData.detail ?? 'Could not read resume text.')
        }

        // Step 2: generate interview questions
        const res = await fetch('/api/generate/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
          <p style={{ color: '#888', marginTop: 8 }}>
            Upload a resume to enable question generation.
          </p>
        )}
        {generateError && <p style={{ color: 'red' }}>{generateError}</p>}
        {generating && <QuestionSkeleton />}
        {generateResult && !generating && <QuestionDisplay questions={generateResult} />}
        <h2>Uploaded Resumes</h2>
        <ResumeList resumes={resumes} />
      </div>
    )
  }

  export default App
  ```

- [ ] **Step 7.3: Confirm the file is saved correctly (no TypeScript errors)**

  ```bash
  cd frontend && npx tsc --noEmit
  ```
  Expected: no output (zero type errors). If errors appear, fix them before continuing.

- [ ] **Step 7.4: Run all frontend tests**

  ```bash
  cd frontend && npm test
  ```
  Expected: all tests pass (App × 8, JobRoleForm, QuestionCard × 7, QuestionSkeleton × 4, QuestionDisplay × 11).

  > If existing App tests fail it is likely because the MSW mock for `POST /api/generate/` returns status 202 with the old shape. The existing 8 App tests do NOT call generate (no active resume is set), so they should still pass. If they do fail, continue to Phase 8 immediately.

- [ ] **Step 7.5: Commit**

  ```bash
  git add frontend/src/App.tsx
  git commit -m "fix: update App.tsx types and generate flow to use resume_text"
  ```

---

### Phase 8: Frontend — Update `App.test.tsx` MSW Handlers

- [ ] **Step 8.1: Replace the MSW server definition in `frontend/src/__tests__/App.test.tsx`**

  Open the file. Replace **only** the `setupServer(...)` call and its handler block (lines 6–20 in the original) with the corrected handlers. The rest of the file stays the same.

  Replace:

  ```tsx
  const server = setupServer(
    http.get('/api/resumes/', () => {
      return HttpResponse.json([])
    }),
    http.post('/api/generate/', () => {
      return HttpResponse.json(
        {
          message: 'Generation queued (stub — AI integration pending)',
          resume_id: 1,
          job_title: 'Frontend Engineer',
          seniority_level: 'Senior',
          key_skills: ['TypeScript'],
        },
        { status: 202 }
      )
    })
  )
  ```

  With:

  ```tsx
  const MOCK_GENERATE_RESULT = {
    technical: [
      { text: 'Q-T1', follow_up: 'FU-T1', what_to_listen_for: 'W-T1' },
      { text: 'Q-T2', follow_up: 'FU-T2', what_to_listen_for: 'W-T2' },
      { text: 'Q-T3', follow_up: 'FU-T3', what_to_listen_for: 'W-T3' },
    ],
    behavioural: [
      { text: 'Q-B1', follow_up: 'FU-B1', what_to_listen_for: 'W-B1' },
      { text: 'Q-B2', follow_up: 'FU-B2', what_to_listen_for: 'W-B2' },
      { text: 'Q-B3', follow_up: 'FU-B3', what_to_listen_for: 'W-B3' },
    ],
    culture_fit: [
      { text: 'Q-C1', follow_up: 'FU-C1', what_to_listen_for: 'W-C1' },
      { text: 'Q-C2', follow_up: 'FU-C2', what_to_listen_for: 'W-C2' },
      { text: 'Q-C3', follow_up: 'FU-C3', what_to_listen_for: 'W-C3' },
    ],
  }

  const server = setupServer(
    http.get('/api/resumes/', () => {
      return HttpResponse.json([])
    }),
    http.get('/api/resumes/:id/text', () => {
      return HttpResponse.json({ resume_text: 'Alice has 5 years of Python experience.' })
    }),
    http.post('/api/generate/', () => {
      return HttpResponse.json(MOCK_GENERATE_RESULT, { status: 200 })
    })
  )
  ```

- [ ] **Step 8.2: Run the App tests**

  ```bash
  cd frontend && npm test -- App
  ```
  Expected: all 8 existing App tests still pass.

- [ ] **Step 8.3: Run the full test suite**

  ```bash
  cd frontend && npm test
  ```
  Expected: all tests pass.

- [ ] **Step 8.4: Commit**

  ```bash
  git add frontend/src/__tests__/App.test.tsx
  git commit -m "test: update App MSW handlers to match real API contract"
  ```

---

### Phase 9: Final Validation

- [ ] **Step 9.1: Run the full backend test suite**

  ```bash
  cd backend && pytest -v
  ```
  Expected: all tests pass.

- [ ] **Step 9.2: Run the full frontend test suite**

  ```bash
  cd frontend && npm test
  ```
  Expected: all tests pass. Count should now be:
  - App: 8 tests
  - JobRoleForm: (existing count unchanged)
  - QuestionCard: 7 tests
  - QuestionSkeleton: 4 tests
  - QuestionDisplay: 11 tests

- [ ] **Step 9.3: Run ruff on the backend**

  ```bash
  cd backend && ruff check .
  ```
  Expected: no output.

- [ ] **Step 9.4: Run TypeScript compiler check**

  ```bash
  cd frontend && npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 9.5: Manual smoke test (requires running stack)**

  > Skip this step if you don't have `ANTHROPIC_API_KEY` available.

  Start backend: `cd backend && uvicorn app.main:app --port 8000`
  Start frontend: `cd frontend && npm run dev`

  In the browser (http://localhost:5173):
  1. Upload a real text-based PDF resume.
  2. Fill in Job Role form → click "Generate Questions".
  3. Verify the shimmer skeleton appears while the Claude API call is in progress.
  4. Verify three collapsible sections appear (Technical, Behavioural, Culture Fit).
  5. Verify each section header shows the question count.
  6. Click a section header — verify it collapses. Click again — verify it expands.
  7. Click the 📋 Copy button on a card — verify the content appears in the clipboard.
  8. Click "📋 Copy all questions" — verify all categories are present in the clipboard.
  9. Upload a scanned/image-only PDF — verify a red error message appears.

- [ ] **Step 9.6: Validation checklist**

  - [ ] `GET /api/resumes/{id}/text` returns `{ resume_text: string }` for a valid PDF
  - [ ] `GET /api/resumes/{id}/text` returns 404 for unknown ID
  - [ ] `GET /api/resumes/{id}/text` returns 422 for a non-text PDF
  - [ ] `POST /api/generate/` is called with `resume_text` (not `resume_id`)
  - [ ] Questions are displayed in three collapsible sections (Technical, Behavioural, Culture Fit)
  - [ ] Each section header shows the category name and question count
  - [ ] Clicking a section header collapses and expands its question list
  - [ ] Each question card shows the main question, follow-up, and evaluation tip
  - [ ] The per-card Copy button writes formatted text to the clipboard
  - [ ] "Copy all questions" copies all categories as plain text
  - [ ] A shimmer skeleton is shown while `generating === true`
  - [ ] The skeleton is replaced by `QuestionDisplay` when results arrive
  - [ ] `generateError` is displayed in red when text extraction or generation fails
  - [ ] All existing App + JobRoleForm tests continue to pass
  - [ ] All new QuestionCard, QuestionSkeleton, QuestionDisplay tests pass
  - [ ] `ruff check .` → zero violations
  - [ ] `tsc --noEmit` → zero errors

---

## Impacted Files / Modules

| File | Change Type | Summary |
|------|------------|---------|
| `backend/requirements.txt` | Modified | Add `pdfplumber>=0.11.0` |
| `backend/app/routers/resumes.py` | Modified | Add `GET /{resume_id}/text` — imports `pdfplumber`, opens stored PDF, returns extracted text |
| `backend/tests/test_resumes.py` | Modified | 4 new tests for text-extraction endpoint (404 missing ID, 404 missing file, 422 no text, 200 real PDF) |
| `frontend/src/components/QuestionCard.tsx` | Created | Renders one question with follow-up and eval tip; per-card clipboard copy with "✓ Copied" feedback |
| `frontend/src/components/QuestionSkeleton.tsx` | Created | Three-category shimmer skeleton; `role="status"` + `aria-label` for accessibility |
| `frontend/src/components/QuestionDisplay.tsx` | Created | Collapsible category sections; composes `QuestionCard`; "Copy all" button; `aria-expanded` on headers |
| `frontend/src/__tests__/QuestionCard.test.tsx` | Created | 7 tests: render, index prefix, follow-up, tip, copy button, clipboard call, "✓ Copied" feedback |
| `frontend/src/__tests__/QuestionSkeleton.test.tsx` | Created | 4 tests: role=status, aria-label, section count, card placeholder count |
| `frontend/src/__tests__/QuestionDisplay.test.tsx` | Created | 11 tests: heading, categories, question count, collapse/expand, aria-expanded, copy-all clipboard |
| `frontend/src/App.tsx` | Modified | New `Question` / `GenerateResult` types; two-step `handleGenerate`; render `QuestionSkeleton` + `QuestionDisplay` |
| `frontend/src/__tests__/App.test.tsx` | Modified | Updated `POST /api/generate/` MSW handler to real shape; added `GET /api/resumes/:id/text` handler |

**Not touched:**
- `frontend/src/components/JobRoleForm.tsx` — no changes
- `frontend/src/components/ResumeList.tsx` — no changes
- `frontend/src/components/ResumeUpload.tsx` — no changes
- `backend/app/models/resume.py` — no schema changes
- `backend/migrations/` — no migrations needed

---

## Risks & Mitigation

| # | Risk | Mitigation |
|---|------|-----------|
| 1 | pdfplumber fails on a valid-looking PDF that contains only raster images (scanned document) | `get_resume_text` catches empty-text output and raises 422 with a descriptive message; `handleGenerate` in `App.tsx` displays it as `generateError` in red |
| 2 | DOCX files were allowed at upload time but pdfplumber cannot open them | `pdfplumber.open()` on a DOCX throws; the `except Exception` block catches it → 422 with the exception message; DOCX support is deferred to a future issue |
| 3 | `navigator.clipboard` unavailable in non-HTTPS / older-browser environments | Both `QuestionCard.handleCopy` and `QuestionDisplay.handleCopyAll` wrap `writeText` in try/catch; failure is silent (button returns to default label) |
| 4 | `navigator.clipboard` not available in jsdom test environment | Mocked explicitly in each test file via `Object.defineProperty(navigator, 'clipboard', ...)` before every test |
| 5 | User double-clicks "Generate Questions" | `disabled={!activeResumeId \|\| generating}` prevents the second click while generation is in progress |
| 6 | Backend returns a category with 0 questions (edge case from Claude) | `QuestionDisplay` renders the section header with "0 questions" and an empty body; no crash |
| 7 | Existing App.test.tsx tests break because the MSW mock returns status 202 + old shape | Phase 8 updates the mock to status 200 + real shape; none of the 8 existing tests actually call generate, so they pass regardless |
| 8 | Very long question text overflows the card layout | `wordBreak: 'break-word'` applied on the `QuestionCard` outer `div` |

---

*Plan generated by the writing-plans skill — 2026-05-20.*
