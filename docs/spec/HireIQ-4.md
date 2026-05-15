# Issue Specification

> **Issue:** [#4 — AI question generation — call Claude API and return categorised questions](https://github.com/jouneyman-user/HireIQ/issues/4)
> **Date:** 2026-05-15
> **Effort:** L (Large)
> **Milestone:** M2 — Core Agent
> **Labels:** backend, AI

---

## Issue Summary

Implement a `POST /generate` endpoint on the FastAPI backend that accepts a candidate's resume text and role details, calls the Anthropic Claude API, and returns at least 3 tailored interview questions in each of three categories (Technical, Behavioural, Culture Fit). Each question includes a suggested follow-up and a "what to listen for" coaching note. Claude API errors are caught and surfaced as `502` responses with a user-friendly message.

---

## Problem Statement

HireIQ's core value proposition is AI-generated, tailored interview questions. Milestone 1 established the foundation scaffold (FastAPI backend, SQLite, React frontend) and Issue #2 added resume upload and storage. This issue delivers the intelligence layer:

- There is currently no endpoint that invokes the Claude AI model.
- Recruiters cannot generate interview questions from stored resume data.
- The output must be structured and categorised so downstream UI components (M3) can render it meaningfully.

Without this feature, HireIQ is purely a file-storage application.

---

## Current Behavior

- No `/generate` route exists on the FastAPI backend.
- No integration with the Anthropic Claude API exists anywhere in the codebase.
- The `backend/requirements.txt` does not include `anthropic`.
- `backend/.env.example` does not document `ANTHROPIC_API_KEY`.

---

## Expected Behavior

1. A client (recruiter or internal UI) sends `POST /api/generate` with:
   - `resume_text` — the raw text of the candidate's resume
   - `role_title` — the job title being hired for
   - (optional) `role_description` — a summary of the role's responsibilities
   - (optional) `company_name` — the hiring company's name (for culture-fit context)
2. The backend constructs a prompt and calls the Claude API.
3. The endpoint returns a JSON response containing exactly three categories, each with **at least 3** questions:
   - `technical` — assesses hard skills and domain knowledge
   - `behavioural` — probes past behaviour and soft skills (STAR-method aligned)
   - `culture_fit` — evaluates alignment with company values and ways of working
4. Each question object includes:
   - `question` — the interview question text
   - `follow_up` — a suggested follow-up probe
   - `what_to_listen_for` — coaching note for the recruiter
5. If the Claude API returns an error (network, rate limit, server fault), the endpoint responds with `502 Bad Gateway` and a user-friendly message.

---

## Root Cause Analysis

The M1 codebase provides the following building blocks that this feature will extend:

| Existing Asset | Role in this Feature |
|----------------|---------------------|
| `backend/app/main.py` | App factory — will register the new `generate` router |
| `backend/app/database.py` | SQLAlchemy engine/session — not needed for generation itself, but available if caching is added later |
| `backend/app/routers/health.py` | Pattern to follow for new router files |
| `backend/migrations/init_db.py` | Import hook — no new tables required for this feature |
| `backend/requirements.txt` | Needs `anthropic>=0.28.0` added |
| `backend/.env.example` | Needs `ANTHROPIC_API_KEY` documented |

What is missing:

| Layer | Gap |
|-------|-----|
| Backend | `POST /generate` FastAPI route |
| Backend | Pydantic request/response schemas |
| Backend | Claude API client service with prompt engineering |
| Backend | Error handling: Claude API → HTTP 502 |
| Deps | `anthropic` Python SDK |
| Config | `ANTHROPIC_API_KEY` environment variable |

---

## Proposed Solution

### Architecture Overview

```
Client (React / curl / test)
  │  POST /api/generate
  │  { resume_text, role_title, role_description?, company_name? }
  ▼
FastAPI  →  POST /generate  (backend/app/routers/generate.py)
  │
  ├── Validate request body (Pydantic)
  ├── Call QuestionGeneratorService.generate(request)
  │     ├── Build structured prompt
  │     ├── POST to Claude API  (claude-3-5-haiku-20241022, max_tokens=2048)
  │     ├── Parse JSON from Claude response
  │     └── Validate: ≥ 3 questions per category
  │
  ├── On Claude API error → raise HTTPException(502, user-friendly message)
  └── Return GenerateResponse  (200 OK)
        {
          "technical":    [ { question, follow_up, what_to_listen_for }, … ],
          "behavioural":  [ … ],
          "culture_fit":  [ … ]
        }
```

---

### Step 1 — Pydantic Schemas (`backend/app/schemas/generate.py`)

```python
from typing import List, Optional
from pydantic import BaseModel, Field


class GenerateRequest(BaseModel):
    resume_text: str = Field(..., min_length=50,
                             description="Raw extracted text from the candidate's resume")
    role_title: str = Field(..., min_length=2,
                            description="Job title being interviewed for, e.g. 'Senior Backend Engineer'")
    role_description: Optional[str] = Field(
        None, description="Optional summary of responsibilities and requirements"
    )
    company_name: Optional[str] = Field(
        None, description="Hiring company name for culture-fit context"
    )


class Question(BaseModel):
    question: str
    follow_up: str
    what_to_listen_for: str


class GenerateResponse(BaseModel):
    technical: List[Question]
    behavioural: List[Question]
    culture_fit: List[Question]
```

**Why a `min_length` on `resume_text`?** A 50-character minimum prevents trivially empty requests that would waste Claude API tokens and return low-quality output.

---

### Step 2 — Question Generator Service (`backend/app/services/question_generator.py`)

```python
import json
import os
from typing import Any

import anthropic

from app.schemas.generate import GenerateRequest, GenerateResponse, Question

_SYSTEM_PROMPT = """\
You are an expert technical recruiter and interview coach.
Given a candidate's resume and a target role, generate structured interview questions.

Return ONLY valid JSON matching this exact schema — no markdown fences, no prose:
{
  "technical":   [ { "question": "...", "follow_up": "...", "what_to_listen_for": "..." }, ... ],
  "behavioural": [ { "question": "...", "follow_up": "...", "what_to_listen_for": "..." }, ... ],
  "culture_fit": [ { "question": "...", "follow_up": "...", "what_to_listen_for": "..." }, ... ]
}

Rules:
- Minimum 3 questions per category.
- Each question must be specific to the resume and role provided.
- follow_up: one targeted probing question to deepen the answer.
- what_to_listen_for: 1-2 sentences coaching the recruiter on strong vs. weak signals.
- Behavioural questions must be STAR-method compatible (situation, task, action, result).
- Culture-fit questions must reference the company name when provided.
"""


def _build_user_prompt(req: GenerateRequest) -> str:
    lines = [
        f"Role Title: {req.role_title}",
    ]
    if req.company_name:
        lines.append(f"Company: {req.company_name}")
    if req.role_description:
        lines.append(f"Role Description:\n{req.role_description}")
    lines.append(f"\nCandidate Resume:\n{req.resume_text}")
    return "\n".join(lines)


def _parse_response(raw: str) -> dict[str, Any]:
    """Parse the Claude JSON response; raise ValueError if malformed."""
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Claude returned non-JSON output: {exc}") from exc

    for category in ("technical", "behavioural", "culture_fit"):
        if category not in data:
            raise ValueError(f"Missing required category '{category}' in Claude response")
        if len(data[category]) < 3:
            raise ValueError(
                f"Category '{category}' has fewer than 3 questions "
                f"({len(data[category])} returned)"
            )
    return data


def generate_questions(req: GenerateRequest) -> GenerateResponse:
    """
    Call the Claude API and return a validated GenerateResponse.
    Raises:
        anthropic.APIError subclasses — propagated to the router for 502 mapping.
        ValueError — if Claude's response does not match the expected schema.
    """
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not set")

    client = anthropic.Anthropic(api_key=api_key)

    message = client.messages.create(
        model="claude-3-5-haiku-20241022",
        max_tokens=2048,
        system=_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": _build_user_prompt(req)}],
    )

    raw_content = message.content[0].text
    data = _parse_response(raw_content)

    return GenerateResponse(
        technical=[Question(**q) for q in data["technical"]],
        behavioural=[Question(**q) for q in data["behavioural"]],
        culture_fit=[Question(**q) for q in data["culture_fit"]],
    )
```

**Model choice (`claude-3-5-haiku-20241022`):** Haiku provides the best latency/cost ratio for structured generation tasks. Upgrade to Sonnet if output quality proves insufficient.

**Why ask Claude for raw JSON (no markdown fences)?** Downstream parsing is simpler and more reliable. The system prompt explicitly forbids fences, and `_parse_response` validates the result.

**Why validate minimum 3 questions per category in `_parse_response`?** Ensures the acceptance criterion is enforced at the service layer, not just by contract. If Claude returns fewer, the service raises `ValueError`, which the router converts to a meaningful error.

---

### Step 3 — Generate Router (`backend/app/routers/generate.py`)

```python
from fastapi import APIRouter, HTTPException
import anthropic

from app.schemas.generate import GenerateRequest, GenerateResponse
from app.services.question_generator import generate_questions

router = APIRouter(prefix="/generate", tags=["generate"])


@router.post("", response_model=GenerateResponse, status_code=200)
def generate(request: GenerateRequest) -> GenerateResponse:
    """
    Generate categorised interview questions from a resume and role details.

    Returns Technical, Behavioural, and Culture Fit question sets.
    Each question includes a follow-up and a 'what to listen for' coaching note.
    """
    try:
        return generate_questions(request)
    except anthropic.APIStatusError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"AI service error: {exc.message}. Please try again shortly.",
        )
    except anthropic.APIConnectionError:
        raise HTTPException(
            status_code=502,
            detail="Could not reach the AI service. Please check your connection and try again.",
        )
    except anthropic.RateLimitError:
        raise HTTPException(
            status_code=502,
            detail="AI service rate limit reached. Please wait a moment before retrying.",
        )
    except anthropic.APIError as exc:
        # Catch-all for any other Anthropic SDK errors
        raise HTTPException(
            status_code=502,
            detail=f"Unexpected AI service error. Please try again later. ({type(exc).__name__})",
        )
    except ValueError as exc:
        # Malformed or insufficient Claude output
        raise HTTPException(
            status_code=502,
            detail=f"AI returned an unexpected response format. Please retry. ({exc})",
        )
```

**Why catch `ValueError` as 502 rather than 500?** The root cause is Claude returning an unexpected payload — an upstream fault, not a server-side bug. `502 Bad Gateway` is semantically correct.

**Why not catch `RuntimeError` (missing API key)?** A missing `ANTHROPIC_API_KEY` is a configuration error. Let it surface as a 500 so operators notice it immediately rather than masking it behind a user-friendly 502.

---

### Step 4 — Register Router in `backend/app/main.py`

```python
# Add to existing imports
from app.routers import generate

# Add after existing include_router calls
app.include_router(generate.router)
```

---

### Step 5 — Updated `requirements.txt`

```
fastapi>=0.111.0
uvicorn[standard]>=0.29.0
sqlalchemy>=2.0.0
python-dotenv>=1.0.0
python-multipart>=0.0.9
pdfplumber>=0.11.0
anthropic>=0.28.0      # Anthropic Claude API SDK
ruff>=0.4.0
pytest>=8.0.0
pytest-asyncio>=0.23.0
httpx>=0.27.0
```

---

### Step 6 — Updated `.env.example`

```dotenv
# SQLAlchemy database URL. Defaults to local SQLite file.
DATABASE_URL=sqlite:///./hireiq.db

# Anthropic API key — required for POST /generate
# Obtain from https://console.anthropic.com/
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

---

### Step 7 — Updated Directory Structure

```
HireIQ/
├── backend/
│   ├── app/
│   │   ├── main.py                          # register generate router
│   │   ├── database.py                      # (unchanged)
│   │   ├── models/                          # (from Issue #2)
│   │   │   ├── __init__.py
│   │   │   └── candidate.py
│   │   ├── schemas/
│   │   │   ├── __init__.py                  # NEW — package marker
│   │   │   └── generate.py                  # NEW — GenerateRequest / GenerateResponse / Question
│   │   ├── routers/
│   │   │   ├── health.py                    # (unchanged)
│   │   │   ├── candidates.py               # (from Issue #2)
│   │   │   └── generate.py                  # NEW — POST /generate
│   │   └── services/
│   │       ├── __init__.py                  # (from Issue #2)
│   │       ├── resume_extractor.py          # (from Issue #2)
│   │       └── question_generator.py        # NEW — Claude API integration
│   ├── migrations/
│   │   └── init_db.py                       # (unchanged — no new tables)
│   ├── requirements.txt                     # + anthropic>=0.28.0
│   └── .env.example                         # + ANTHROPIC_API_KEY
```

---

### Step 8 — Tests (`backend/tests/test_generate.py`)

```python
"""Unit tests for POST /generate — uses httpx TestClient and mocks Claude."""
import json
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

VALID_PAYLOAD = {
    "resume_text": "Jane Doe — 5 years Python backend engineering at Acme Corp. "
                   "Led migration from Django to FastAPI, reduced p99 latency by 40%. "
                   "Mentored 3 junior engineers. BSc Computer Science.",
    "role_title": "Senior Backend Engineer",
    "company_name": "StartupXYZ",
}

MOCK_CLAUDE_JSON = {
    "technical": [
        {
            "question": "Walk me through the FastAPI migration you led.",
            "follow_up": "What were the biggest architectural challenges?",
            "what_to_listen_for": "Look for specifics on async patterns and migration strategy.",
        },
        {
            "question": "How do you approach database query optimisation in Python?",
            "follow_up": "Can you give a concrete example from your current role?",
            "what_to_listen_for": "Strong candidates will mention profiling tools and index strategy.",
        },
        {
            "question": "Describe your experience with CI/CD pipelines.",
            "follow_up": "How did you handle flaky tests?",
            "what_to_listen_for": "Listen for ownership and systematic debugging approach.",
        },
    ],
    "behavioural": [
        {
            "question": "Tell me about a time you mentored a junior engineer.",
            "follow_up": "What was the outcome, and what would you do differently?",
            "what_to_listen_for": "Strong signal: specific growth metrics, patience, structured feedback.",
        },
        {
            "question": "Describe a situation where a project deadline was at risk.",
            "follow_up": "How did you communicate the risk to stakeholders?",
            "what_to_listen_for": "Look for proactive communication and prioritisation under pressure.",
        },
        {
            "question": "Tell me about a technical disagreement with a colleague.",
            "follow_up": "How was it resolved, and what did you learn?",
            "what_to_listen_for": "Seek evidence of intellectual humility and constructive conflict.",
        },
    ],
    "culture_fit": [
        {
            "question": "What attracts you to StartupXYZ specifically?",
            "follow_up": "How does it align with your long-term goals?",
            "what_to_listen_for": "Genuine research about the company vs. generic answers.",
        },
        {
            "question": "How do you stay current with backend engineering trends?",
            "follow_up": "What's the last technical book or talk that changed your thinking?",
            "what_to_listen_for": "Curiosity and self-directed learning are strong signals.",
        },
        {
            "question": "Describe your ideal team working style.",
            "follow_up": "How do you handle disagreements on architectural direction?",
            "what_to_listen_for": "Fit with collaborative, async-first culture.",
        },
    ],
}


def _make_mock_message(json_data: dict) -> MagicMock:
    msg = MagicMock()
    msg.content = [MagicMock(text=json.dumps(json_data))]
    return msg


@patch("app.services.question_generator.anthropic.Anthropic")
def test_generate_success(mock_anthropic_cls):
    mock_client = MagicMock()
    mock_client.messages.create.return_value = _make_mock_message(MOCK_CLAUDE_JSON)
    mock_anthropic_cls.return_value = mock_client

    response = client.post("/generate", json=VALID_PAYLOAD)

    assert response.status_code == 200
    data = response.json()
    for category in ("technical", "behavioural", "culture_fit"):
        assert len(data[category]) >= 3
        for q in data[category]:
            assert "question" in q
            assert "follow_up" in q
            assert "what_to_listen_for" in q


@patch("app.services.question_generator.anthropic.Anthropic")
def test_generate_claude_api_error_returns_502(mock_anthropic_cls):
    import anthropic as sdk

    mock_client = MagicMock()
    mock_client.messages.create.side_effect = sdk.APIStatusError(
        message="Internal Server Error",
        response=MagicMock(status_code=500),
        body={},
    )
    mock_anthropic_cls.return_value = mock_client

    response = client.post("/generate", json=VALID_PAYLOAD)

    assert response.status_code == 502
    assert "AI service error" in response.json()["detail"]


def test_generate_missing_resume_text_returns_422():
    response = client.post("/generate", json={"role_title": "Engineer"})
    assert response.status_code == 422


def test_generate_resume_too_short_returns_422():
    response = client.post(
        "/generate",
        json={"resume_text": "short", "role_title": "Engineer"},
    )
    assert response.status_code == 422
```

---

## Impacted Areas

| File / Module | Change Type | Notes |
|---|---|---|
| `backend/app/schemas/__init__.py` | **New** | Package marker |
| `backend/app/schemas/generate.py` | **New** | `GenerateRequest`, `GenerateResponse`, `Question` Pydantic models |
| `backend/app/services/question_generator.py` | **New** | Claude API call, prompt engineering, JSON parsing, validation |
| `backend/app/routers/generate.py` | **New** | `POST /generate` — orchestrates service call, maps errors to HTTP |
| `backend/app/main.py` | **Modified** | Register `generate` router |
| `backend/requirements.txt` | **Modified** | Add `anthropic>=0.28.0` |
| `backend/.env.example` | **Modified** | Document `ANTHROPIC_API_KEY` |
| `backend/tests/test_generate.py` | **New** | Unit tests with mocked Claude client |

---

## Edge Cases & Risks

| Scenario | Mitigation |
|----------|-----------|
| Claude returns fewer than 3 questions per category | `_parse_response` raises `ValueError`; router returns 502 with "unexpected response format" message |
| Claude returns markdown-fenced JSON (```json ... ```) | System prompt explicitly forbids fences; if Claude non-complies, add a strip-fence pre-processing step in `_parse_response` |
| Claude returns valid JSON but wrong keys (e.g. `behavioral` vs `behavioural`) | `_parse_response` checks for all three required keys and raises `ValueError` on mismatch |
| `ANTHROPIC_API_KEY` missing from `.env` | `RuntimeError` raised in service → FastAPI returns 500; operators must set the key |
| Claude rate limit hit (429) | `anthropic.RateLimitError` caught → 502 with user-friendly retry message |
| Claude API connection timeout | `anthropic.APIConnectionError` caught → 502 with connectivity message |
| Very long resume (token limit exceeded) | Claude will truncate or error; consider truncating `resume_text` to ~8,000 chars before sending |
| Role description + resume exceed context window | Summarise or truncate `role_description` if combined tokens approach model limit |
| Injected prompt in resume text | Claude's system prompt scope limits the damage; no direct command execution risk |
| No auth on `/generate` endpoint | Consistent with M1/M2 scope; add API key or JWT guard in a later milestone |
| Caching identical requests | Not in scope for M2; consider Redis-backed cache keyed on `hash(resume_text + role_title)` in M3 |

---

## Acceptance Criteria

- [ ] `POST /api/generate` accepts `resume_text` and `role_title` (plus optional `role_description`, `company_name`) and calls the Claude API
- [ ] Response contains questions grouped into `technical`, `behavioural`, and `culture_fit`
- [ ] Each question includes `question`, `follow_up`, and `what_to_listen_for` fields
- [ ] Minimum of 3 questions per category are returned
- [ ] Claude API errors (network, rate limit, server fault) are caught and return `502` with a user-friendly message
- [ ] Missing or invalid request body returns `422 Unprocessable Entity`
- [ ] Unit tests pass with a mocked Claude client (no real API calls in CI)
- [ ] `ANTHROPIC_API_KEY` is documented in `backend/.env.example` but never committed

---

## Notes

- **Model selection:** `claude-3-5-haiku-20241022` is the recommended default for speed and cost at M2. Swap to `claude-sonnet-4-5` if output quality requires it — just change the string in `question_generator.py`.
- **Prompt caching:** The static `_SYSTEM_PROMPT` is an ideal candidate for Anthropic's prompt caching feature (`cache_control: {"type": "ephemeral"}`). Add this in a follow-up if token costs become significant.
- **Streaming:** Not implemented at M2. If the recruiter UI needs progressive rendering, add a `/generate/stream` endpoint using `client.messages.stream()` in a later milestone.
- **Persistence:** Generated question sets are not stored in the database at M2. Add a `question_sets` table linked to `candidates` in M3 if history/replay is required.
- **No frontend changes in this issue:** The `POST /generate` endpoint is backend-only. Frontend integration (displaying questions, selecting a candidate from the DB, submitting the form) is a separate M3 issue.

---

*Spec generated autonomously by the Super Skills agent — no user interaction required.*
