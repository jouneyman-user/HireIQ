# AI Question Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Issue:** [#4 — AI question generation — call Claude API and return categorised questions](https://github.com/jouneyman-user/HireIQ/issues/4)
> **Spec:** issue description (spec file not yet created)
> **Date:** 2026-05-15
> **Effort:** L (Large)
> **Milestone:** M2 — Core Agent

**Goal:** Replace the `/generate` stub with a real Claude API integration that returns at least 3 interview questions per category (Technical, Behavioural, Culture Fit), each with a follow-up and "what to listen for" note.

**Architecture:** A new `backend/app/services/claude_service.py` module owns all Claude API interaction — prompt construction, API call, response parsing, and error wrapping. The `generate.py` router stays thin: validate input, call the service, map errors to HTTP status codes. Tests mock the service layer, not the raw Anthropic client.

**Tech Stack:** FastAPI, Pydantic v2, anthropic Python SDK (`anthropic>=0.25.0`), pytest + `unittest.mock`

---

## Preconditions

- Issue #3 (Job Role Form) is merged; `POST /resumes/` and `POST /generate/` routes both exist.
- `backend/` Python deps are installed: `pip install -r requirements.txt`.
- All existing tests pass: `cd backend && pytest` — confirm before starting.
- You have an `ANTHROPIC_API_KEY` available for manual smoke-testing (tests use mocks and do **not** require a real key).

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| **Modify** | `backend/requirements.txt` | Add `anthropic>=0.25.0` |
| **Modify** | `backend/.env.example` | Document `ANTHROPIC_API_KEY` |
| **Create** | `backend/app/services/__init__.py` | Package marker |
| **Create** | `backend/app/services/claude_service.py` | Prompt builder, API call, response parser, error types |
| **Modify** | `backend/app/routers/generate.py` | Replace stub with real call; updated request/response models |
| **Modify** | `backend/tests/test_generate.py` | Replace stub tests; mock service; cover 200/422/502 paths |

---

## Step-by-Step Plan

### Phase 1: Preparation

- [ ] **Step 1.1: Confirm all existing tests pass**

  ```bash
  cd backend && pytest -v
  ```

  Expected: all tests green. If any fail, stop and fix before continuing.

- [ ] **Step 1.2: Review existing stub**

  Read `backend/app/routers/generate.py`. Note the current `GenerateRequest` fields (`resume_id`, `job_title`, `seniority_level`, `key_skills`) and `GenerateResponse`. These will be replaced in Phase 3.

- [ ] **Step 1.3: Review existing stub tests**

  Read `backend/tests/test_generate.py`. Note that tests use `resume_id` and assert 202 + stub message. All of these will be replaced in Phase 4.

---

### Phase 2: Add Dependency and Environment Variable

- [ ] **Step 2.1: Write the failing import test**

  In a temporary scratch area, verify the package is not yet installed:

  ```bash
  cd backend && python -c "import anthropic" 2>&1
  ```

  Expected: `ModuleNotFoundError: No module named 'anthropic'`

- [ ] **Step 2.2: Add `anthropic` to requirements.txt**

  Open `backend/requirements.txt` and add this line after the existing deps:

  ```
  anthropic>=0.25.0
  ```

  Full file should look like:

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

- [ ] **Step 2.3: Install the new dependency**

  ```bash
  cd backend && pip install -r requirements.txt
  ```

  Expected: `Successfully installed anthropic-...`

- [ ] **Step 2.4: Verify import works**

  ```bash
  cd backend && python -c "import anthropic; print(anthropic.__version__)"
  ```

  Expected: a version string (e.g. `0.25.0` or later).

- [ ] **Step 2.5: Document `ANTHROPIC_API_KEY` in `.env.example`**

  Open `backend/.env.example` and append:

  ```
  # Anthropic Claude API key — required for POST /generate
  # Obtain from https://console.anthropic.com/settings/keys
  ANTHROPIC_API_KEY=your_anthropic_api_key_here
  ```

- [ ] **Step 2.6: Commit**

  ```bash
  cd backend
  git add requirements.txt .env.example
  git commit -m "chore: add anthropic SDK dependency and document ANTHROPIC_API_KEY"
  ```

---

### Phase 3: Create the Claude Service

- [ ] **Step 3.1: Create the services package**

  Create `backend/app/services/__init__.py` with an empty body:

  ```python
  ```

  (Empty file — just marks the directory as a Python package.)

- [ ] **Step 3.2: Write the failing test for `generate_interview_questions`**

  Open `backend/tests/test_generate.py` and **replace its entire contents** with:

  ```python
  """Tests for POST /generate endpoint (AI question generation)."""
  from unittest.mock import patch

  import pytest
  from fastapi.testclient import TestClient

  from app.main import app

  client = TestClient(app)

  # ── shared fixtures ───────────────────────────────────────────────────────────

  _SAMPLE_QUESTIONS = {
      "technical": [
          {"text": "Q-T1", "follow_up": "FU-T1", "what_to_listen_for": "W-T1"},
          {"text": "Q-T2", "follow_up": "FU-T2", "what_to_listen_for": "W-T2"},
          {"text": "Q-T3", "follow_up": "FU-T3", "what_to_listen_for": "W-T3"},
      ],
      "behavioural": [
          {"text": "Q-B1", "follow_up": "FU-B1", "what_to_listen_for": "W-B1"},
          {"text": "Q-B2", "follow_up": "FU-B2", "what_to_listen_for": "W-B2"},
          {"text": "Q-B3", "follow_up": "FU-B3", "what_to_listen_for": "W-B3"},
      ],
      "culture_fit": [
          {"text": "Q-C1", "follow_up": "FU-C1", "what_to_listen_for": "W-C1"},
          {"text": "Q-C2", "follow_up": "FU-C2", "what_to_listen_for": "W-C2"},
          {"text": "Q-C3", "follow_up": "FU-C3", "what_to_listen_for": "W-C3"},
      ],
  }


  def _valid_payload() -> dict:
      return {
          "resume_text": "Alice has 5 years of Python backend experience building REST APIs.",
          "job_title": "Backend Engineer",
          "seniority_level": "Senior",
          "key_skills": ["Python", "FastAPI", "PostgreSQL"],
      }


  # ── happy path ────────────────────────────────────────────────────────────────

  @patch("app.routers.generate.generate_interview_questions", return_value=_SAMPLE_QUESTIONS)
  def test_generate_returns_200_with_valid_payload(_mock):
      """POST /generate/ with valid payload returns HTTP 200."""
      response = client.post("/generate/", json=_valid_payload())
      assert response.status_code == 200


  @patch("app.routers.generate.generate_interview_questions", return_value=_SAMPLE_QUESTIONS)
  def test_generate_response_has_three_categories(_mock):
      """Response body contains technical, behavioural, and culture_fit keys."""
      data = client.post("/generate/", json=_valid_payload()).json()
      assert "technical" in data
      assert "behavioural" in data
      assert "culture_fit" in data


  @patch("app.routers.generate.generate_interview_questions", return_value=_SAMPLE_QUESTIONS)
  def test_each_category_has_at_least_three_questions(_mock):
      """Each category list has >= 3 questions."""
      data = client.post("/generate/", json=_valid_payload()).json()
      assert len(data["technical"]) >= 3
      assert len(data["behavioural"]) >= 3
      assert len(data["culture_fit"]) >= 3


  @patch("app.routers.generate.generate_interview_questions", return_value=_SAMPLE_QUESTIONS)
  def test_each_question_has_required_fields(_mock):
      """Each question object has text, follow_up, and what_to_listen_for."""
      data = client.post("/generate/", json=_valid_payload()).json()
      for category in ("technical", "behavioural", "culture_fit"):
          for question in data[category]:
              assert "text" in question
              assert "follow_up" in question
              assert "what_to_listen_for" in question


  # ── 502 — Claude API error ────────────────────────────────────────────────────

  @patch("app.routers.generate.generate_interview_questions")
  def test_generate_returns_502_on_claude_api_error(mock_gen):
      """When Claude API fails, POST /generate/ returns HTTP 502."""
      from app.services.claude_service import ClaudeServiceError
      mock_gen.side_effect = ClaudeServiceError("Claude API request failed: connection error")
      response = client.post("/generate/", json=_valid_payload())
      assert response.status_code == 502


  @patch("app.routers.generate.generate_interview_questions")
  def test_generate_502_detail_is_a_non_empty_string(mock_gen):
      """502 response detail must be a non-empty human-readable string."""
      from app.services.claude_service import ClaudeServiceError
      mock_gen.side_effect = ClaudeServiceError("Claude API request failed: timeout")
      detail = client.post("/generate/", json=_valid_payload()).json()["detail"]
      assert isinstance(detail, str)
      assert len(detail) > 0


  # ── 422 — input validation ────────────────────────────────────────────────────

  def test_generate_returns_422_when_resume_text_empty():
      """POST /generate/ with whitespace-only resume_text returns 422."""
      payload = _valid_payload()
      payload["resume_text"] = "   "
      assert client.post("/generate/", json=payload).status_code == 422


  def test_generate_returns_422_when_job_title_empty():
      """POST /generate/ with whitespace-only job_title returns 422."""
      payload = _valid_payload()
      payload["job_title"] = "   "
      assert client.post("/generate/", json=payload).status_code == 422


  def test_generate_returns_422_when_seniority_empty():
      """POST /generate/ with whitespace-only seniority_level returns 422."""
      payload = _valid_payload()
      payload["seniority_level"] = "   "
      assert client.post("/generate/", json=payload).status_code == 422


  def test_generate_returns_422_when_key_skills_empty():
      """POST /generate/ with empty key_skills list returns 422."""
      payload = _valid_payload()
      payload["key_skills"] = []
      assert client.post("/generate/", json=payload).status_code == 422


  def test_generate_returns_422_when_missing_required_field():
      """POST /generate/ without resume_text triggers FastAPI automatic 422."""
      payload = _valid_payload()
      del payload["resume_text"]
      assert client.post("/generate/", json=payload).status_code == 422
  ```

- [ ] **Step 3.3: Run the tests to confirm they fail**

  ```bash
  cd backend && pytest tests/test_generate.py -v
  ```

  Expected: multiple failures — `ImportError` on `app.services.claude_service` and `app.routers.generate.generate_interview_questions` not found.

- [ ] **Step 3.4: Create `backend/app/services/claude_service.py`**

  Create the file with this exact content:

  ```python
  """Claude API service — prompt construction, API call, and response parsing."""
  import json
  import logging
  import os

  import anthropic

  logger = logging.getLogger(__name__)

  _SYSTEM_PROMPT = (
      "You are an expert technical recruiter. Your task is to generate tailored "
      "interview questions based on a candidate's resume and the target role. "
      "You must respond with valid JSON only — no prose, no markdown fences, "
      "just the raw JSON object."
  )


  def _build_user_prompt(
      resume_text: str,
      job_title: str,
      seniority_level: str,
      key_skills: list[str],
  ) -> str:
      skills_str = ", ".join(key_skills)
      return (
          f"Generate interview questions for this candidate.\n\n"
          f"RESUME:\n{resume_text}\n\n"
          f"ROLE:\n"
          f"- Job Title: {job_title}\n"
          f"- Seniority Level: {seniority_level}\n"
          f"- Required Skills: {skills_str}\n\n"
          f"Generate at least 3 questions in each of these categories:\n"
          f"1. technical — questions that test domain knowledge and hands-on skills\n"
          f"2. behavioural — STAR-format questions about past experiences\n"
          f"3. culture_fit — questions that probe values, work style, and team fit\n\n"
          f"For each question provide:\n"
          f'- "text": the interview question\n'
          f'- "follow_up": one suggested follow-up question\n'
          f'- "what_to_listen_for": a note for the recruiter on what a strong answer contains\n\n'
          f"Respond ONLY with this JSON structure (no other text):\n"
          f'{{\n'
          f'  "technical": [{{"text": "...", "follow_up": "...", "what_to_listen_for": "..."}}],\n'
          f'  "behavioural": [{{"text": "...", "follow_up": "...", "what_to_listen_for": "..."}}],\n'
          f'  "culture_fit": [{{"text": "...", "follow_up": "...", "what_to_listen_for": "..."}}]\n'
          f"}}"
      )


  class ClaudeServiceError(Exception):
      """Raised when the Claude API returns an error or an unusable response."""

      def __init__(self, message: str, status_code: int = 502) -> None:
          super().__init__(message)
          self.status_code = status_code


  def generate_interview_questions(
      resume_text: str,
      job_title: str,
      seniority_level: str,
      key_skills: list[str],
  ) -> dict:
      """Call Claude API and return parsed question categories.

      Returns a dict with keys: technical, behavioural, culture_fit.
      Each value is a list of dicts with keys: text, follow_up, what_to_listen_for.

      Raises:
          ClaudeServiceError: on API failure, non-JSON response, or < 3 questions
                              per category.
      """
      api_key = os.getenv("ANTHROPIC_API_KEY")
      client = anthropic.Anthropic(api_key=api_key)

      try:
          message = client.messages.create(
              model="claude-sonnet-4-5",
              max_tokens=2048,
              system=_SYSTEM_PROMPT,
              messages=[
                  {
                      "role": "user",
                      "content": _build_user_prompt(
                          resume_text, job_title, seniority_level, key_skills
                      ),
                  }
              ],
          )
      except anthropic.APIError as exc:
          logger.error("Claude API request failed: %s", exc)
          raise ClaudeServiceError(
              f"The AI service is temporarily unavailable. Please try again later. ({exc})"
          ) from exc

      raw_text = message.content[0].text

      try:
          data = json.loads(raw_text)
      except json.JSONDecodeError as exc:
          logger.error("Claude returned non-JSON response: %.200s", raw_text)
          raise ClaudeServiceError(
              "The AI service returned an unexpected response. Please try again later."
          ) from exc

      _required_categories = ("technical", "behavioural", "culture_fit")
      for category in _required_categories:
          if category not in data:
              logger.error("Claude response missing category '%s'", category)
              raise ClaudeServiceError(
                  "The AI service returned an incomplete response. Please try again later."
              )
          if len(data[category]) < 3:
              logger.error(
                  "Claude returned %d questions for '%s' (minimum 3 required)",
                  len(data[category]),
                  category,
              )
              raise ClaudeServiceError(
                  "The AI service returned too few questions. Please try again later."
              )

      return data
  ```

- [ ] **Step 3.5: Run the tests again — partial progress expected**

  ```bash
  cd backend && pytest tests/test_generate.py -v
  ```

  Expected: tests that reference `ClaudeServiceError` now import correctly; tests that hit the endpoint still fail because `generate.py` hasn't been updated yet. You should see failures on the 200 path and 502 path tests.

---

### Phase 4: Update the Generate Router

- [ ] **Step 4.1: Replace `backend/app/routers/generate.py`**

  Replace the entire file contents with:

  ```python
  """Generate endpoint — POST /generate — calls Claude API and returns categorised questions."""
  import logging

  from fastapi import APIRouter, HTTPException
  from pydantic import BaseModel

  from app.services.claude_service import ClaudeServiceError, generate_interview_questions

  logger = logging.getLogger(__name__)

  router = APIRouter(prefix="/generate", tags=["generate"])


  # ── request / response models ─────────────────────────────────────────────────

  class GenerateRequest(BaseModel):
      resume_text: str
      job_title: str
      seniority_level: str
      key_skills: list[str]


  class Question(BaseModel):
      text: str
      follow_up: str
      what_to_listen_for: str


  class GenerateResponse(BaseModel):
      technical: list[Question]
      behavioural: list[Question]
      culture_fit: list[Question]


  # ── endpoint ──────────────────────────────────────────────────────────────────

  @router.post("/", status_code=200, response_model=GenerateResponse)
  def generate_questions(payload: GenerateRequest) -> GenerateResponse:
      """Call Claude API and return interview questions grouped by category.

      Returns 200 with categorised questions on success.
      Returns 422 if any required field is blank / empty.
      Returns 502 if the Claude API is unavailable or returns an unusable response.
      """
      if not payload.resume_text.strip():
          raise HTTPException(status_code=422, detail="resume_text must not be empty.")
      if not payload.job_title.strip():
          raise HTTPException(status_code=422, detail="job_title must not be empty.")
      if not payload.seniority_level.strip():
          raise HTTPException(status_code=422, detail="seniority_level must not be empty.")
      if not payload.key_skills:
          raise HTTPException(
              status_code=422, detail="key_skills must contain at least one entry."
          )

      try:
          result = generate_interview_questions(
              resume_text=payload.resume_text,
              job_title=payload.job_title,
              seniority_level=payload.seniority_level,
              key_skills=payload.key_skills,
          )
      except ClaudeServiceError as exc:
          logger.error("ClaudeServiceError: %s", exc)
          raise HTTPException(status_code=502, detail=str(exc)) from exc

      return GenerateResponse(
          technical=[Question(**q) for q in result["technical"]],
          behavioural=[Question(**q) for q in result["behavioural"]],
          culture_fit=[Question(**q) for q in result["culture_fit"]],
      )
  ```

- [ ] **Step 4.2: Run the full generate test suite**

  ```bash
  cd backend && pytest tests/test_generate.py -v
  ```

  Expected: **all tests pass**.

- [ ] **Step 4.3: Run the full backend test suite to check for regressions**

  ```bash
  cd backend && pytest -v
  ```

  Expected: all tests pass including `test_health.py` and `test_resumes.py`.

- [ ] **Step 4.4: Commit**

  ```bash
  cd backend
  git add app/services/__init__.py app/services/claude_service.py \
          app/routers/generate.py tests/test_generate.py
  git commit -m "feat: implement Claude API question generation (POST /generate)"
  ```

---

### Phase 5: Lint and Final Validation

- [ ] **Step 5.1: Run ruff linter**

  ```bash
  cd backend && ruff check .
  ```

  Expected: no output (zero violations). If violations appear, fix them:

  Common fixes:
  - `E501` (line too long): break long strings across continuation lines
  - `F401` (unused import): remove the import
  - `I001` (import order): rearrange to stdlib → third-party → local

- [ ] **Step 5.2: Re-run full test suite after lint fixes**

  ```bash
  cd backend && pytest -v
  ```

  Expected: all tests pass.

- [ ] **Step 5.3: Verify acceptance criteria manually (optional smoke test)**

  Only run this if you have a real `ANTHROPIC_API_KEY` in `backend/.env`. Start the server:

  ```bash
  cd backend && uvicorn app.main:app --port 8000
  ```

  In another terminal:

  ```bash
  curl -s -X POST http://localhost:8000/generate/ \
    -H "Content-Type: application/json" \
    -d '{
      "resume_text": "Jane Doe. 7 years Python. Led API design at Acme Corp. Proficient in FastAPI, PostgreSQL, Redis.",
      "job_title": "Senior Backend Engineer",
      "seniority_level": "Senior",
      "key_skills": ["Python", "FastAPI", "PostgreSQL"]
    }' | python3 -m json.tool
  ```

  Expected: JSON with `technical`, `behavioural`, `culture_fit` arrays, each with ≥ 3 objects containing `text`, `follow_up`, `what_to_listen_for`.

  Test the 502 path by temporarily setting `ANTHROPIC_API_KEY=invalid_key` and re-running the curl command. Expected: `{"detail": "The AI service is temporarily unavailable..."}` with HTTP 502.

- [ ] **Step 5.4: Final commit (if any lint fixes were needed)**

  ```bash
  git add -p   # stage only lint-related changes
  git commit -m "style: fix ruff violations in claude_service and generate router"
  ```

---

## Impacted Files / Modules

| File | Change Type | Summary |
|------|------------|---------|
| `backend/requirements.txt` | Modified | Add `anthropic>=0.25.0` |
| `backend/.env.example` | Modified | Document `ANTHROPIC_API_KEY` |
| `backend/app/services/__init__.py` | Created | Python package marker |
| `backend/app/services/claude_service.py` | Created | Prompt builder, `generate_interview_questions()`, `ClaudeServiceError` |
| `backend/app/routers/generate.py` | Modified | Replace stub with real Claude-backed endpoint; new request/response models |
| `backend/tests/test_generate.py` | Modified | Replace stub tests; mock service; 200/422/502 coverage |

**Not touched:**
- `backend/app/main.py` — generate router already registered
- `backend/app/models/resume.py` — no model changes needed
- `backend/migrations/` — no schema changes
- `frontend/` — frontend wiring is a separate milestone task

---

## Risks & Mitigation

| # | Risk | Mitigation |
|---|------|-----------|
| 1 | Claude returns valid JSON but with < 3 questions in a category | `claude_service.py` validates count and raises `ClaudeServiceError` → 502 |
| 2 | Claude returns non-JSON (e.g. apology text) | `json.JSONDecodeError` caught → 502 with user-friendly message |
| 3 | `ANTHROPIC_API_KEY` not set in `.env` | `anthropic.Anthropic(api_key=None)` raises `AuthenticationError` → caught by `APIError` handler → 502 |
| 4 | Rate limit exceeded | `anthropic.RateLimitError` is a subclass of `APIError` → caught → 502 |
| 5 | `anthropic` SDK version breaks interface | Pinned with `>=0.25.0`; SDK is stable; `client.messages.create()` API unchanged since 0.18 |
| 6 | Regressions in existing resume tests | Full `pytest` run in Step 4.3 catches this before commit |
| 7 | `resume_id` removed from request contract | Existing generate stub tests are fully replaced; no other code references the old `GenerateRequest` |

---

## Validation Checklist

- [ ] `POST /generate/` accepts `resume_text`, `job_title`, `seniority_level`, `key_skills`
- [ ] Response contains `technical`, `behavioural`, `culture_fit` arrays
- [ ] Each question object has `text`, `follow_up`, `what_to_listen_for`
- [ ] Each category contains ≥ 3 questions (enforced in service layer and validated by tests)
- [ ] Claude API errors return HTTP 502 with a human-readable `detail` string
- [ ] Whitespace-only / empty fields return HTTP 422
- [ ] `ruff check .` passes with zero violations
- [ ] Full `pytest` suite passes (no regressions in health or resume tests)
- [ ] `ANTHROPIC_API_KEY` documented in `.env.example` but never committed to source
