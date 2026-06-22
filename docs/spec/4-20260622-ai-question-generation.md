# Issue #4 Spec — AI Question Generation (Claude API Integration)

> **Ticket:** [jouneyman-user/HireIQ#4](https://github.com/jouneyman-user/HireIQ/issues/4)
> **Date:** 2026-06-22
> **Effort:** L (Large)
> **Milestone:** M2 — Core Agent
> **Labels:** backend, AI
> **Status:** Closed (Completed)

---

## Ticket Summary

Implement a `POST /generate` endpoint that accepts resume text and role details, calls the Anthropic Claude API, and returns categorised interview questions (Technical, Behavioural, Culture Fit). Each question includes a follow-up and a "what to listen for" coaching note. Minimum 3 questions per category. Claude API errors return 502 with a user-friendly message.

---

## Acceptance Criteria

- [x] `POST /api/generate` accepts `resume_text` and role details, calls Claude API
- [x] Response contains questions grouped into: `technical`, `behavioural`, `culture_fit`
- [x] Each question includes: `text`, `follow_up`, `what_to_listen_for`
- [x] Minimum of 3 questions per category are returned
- [x] API errors from Claude are caught and return a 502 with a user-friendly message

---

## Current Codebase Analysis

### What Already Exists

| Asset | Status | Notes |
|-------|--------|-------|
| `backend/app/routers/generate.py` | **Implemented** | `POST /generate` endpoint with Pydantic request/response models |
| `backend/app/services/claude_service.py` | **Implemented** | Claude API integration with prompt construction, API call, response parsing |
| `backend/requirements.txt` | **Has `anthropic>=0.25.0`** | Claude SDK already included |
| `backend/.env.example` | **Documents `ANTHROPIC_API_KEY`** | API key env var documented |
| `backend/app/main.py` | **Registers generate router** | `app.include_router(generate.router)` present |
| `backend/tests/test_generate.py` | **Implemented** | Unit tests with mocked Claude client |

### Current Implementation Details

**Request Schema (`GenerateRequest`):**
- `resume_text: str` — candidate resume text
- `job_title: str` — target job title
- `seniority_level: str` — e.g. "Junior", "Mid", "Senior"
- `key_skills: list[str]` — required skills for the role

**Response Schema (`GenerateResponse`):**
- `technical: list[Question]`
- `behavioural: list[Question]`
- `culture_fit: list[Question]`

**Question Schema:**
- `text: str` — the interview question
- `follow_up: str` — suggested follow-up probe
- `what_to_listen_for: str` — recruiter coaching note

**Claude Model:** `claude-sonnet-4-5` with `max_tokens=2048`

**Error Handling:**
- Empty input validation → HTTP 422
- Claude API errors → `ClaudeServiceError` → HTTP 502
- Non-JSON response → HTTP 502
- Fewer than 3 questions per category → HTTP 502

---

## Architecture

```
Client (React / curl / test)
  │  POST /api/generate
  │  { resume_text, job_title, seniority_level, key_skills }
  ▼
FastAPI  →  POST /generate  (backend/app/routers/generate.py)
  │
  ├── Validate request body (Pydantic + manual field checks)
  ├── Call generate_interview_questions() from claude_service.py
  │     ├── Build structured prompt with resume + role context
  │     ├── POST to Claude API  (claude-sonnet-4-5, max_tokens=2048)
  │     ├── Parse JSON from Claude response
  │     └── Validate: ≥ 3 questions per category (technical, behavioural, culture_fit)
  │
  ├── On Claude API error → ClaudeServiceError → HTTP 502
  └── Return GenerateResponse  (200 OK)
        {
          "technical":    [ { text, follow_up, what_to_listen_for }, … ],
          "behavioural":  [ … ],
          "culture_fit":  [ … ]
        }
```

---

## File Inventory

| File | Status | Purpose |
|------|--------|---------|
| `backend/app/routers/generate.py` | Exists | `POST /generate` endpoint, request/response models |
| `backend/app/services/claude_service.py` | Exists | Claude API client, prompt builder, response validator |
| `backend/app/main.py` | Exists | App factory, registers `generate` router |
| `backend/.env.example` | Exists | Documents `ANTHROPIC_API_KEY` |
| `backend/requirements.txt` | Exists | Includes `anthropic>=0.25.0` |
| `backend/tests/test_generate.py` | Exists | Unit tests with mocked Claude client |

---

## Edge Cases & Risks

| Scenario | Mitigation |
|----------|-----------|
| Claude returns fewer than 3 questions per category | `ClaudeServiceError` raised → HTTP 502 |
| Claude returns non-JSON | `json.JSONDecodeError` caught → `ClaudeServiceError` → HTTP 502 |
| `ANTHROPIC_API_KEY` missing | `anthropic.Anthropic()` raises error → caught as `ClaudeServiceError` |
| Claude rate limit hit | `anthropic.APIError` caught → HTTP 502 |
| Empty/blank input fields | Manual validation → HTTP 422 |
| Very long resume (token limit) | No truncation at M2; consider in M3 |
| No auth on `/generate` | Consistent with M1/M2 scope; add in later milestone |

---

## Test Coverage

| Test | Description |
|------|-------------|
| Happy path | Mock Claude returns valid JSON → 200 with correct structure |
| Claude API error | `anthropic.APIError` → 502 |
| Non-JSON response | Mock Claude returns plain text → 502 |
| Fewer than 3 questions | Mock Claude returns 2 questions per category → 502 |
| Empty resume_text | 422 with validation message |
| Empty job_title | 422 with validation message |
| Empty seniority_level | 422 with validation message |
| Empty key_skills | 422 with validation message |

---

## Deployment Impact

- **Makefile:** No changes required
- **.env.example:** Already documents `ANTHROPIC_API_KEY`
- **requirements.txt:** Already includes `anthropic>=0.25.0`
- **Database:** No migrations needed — no new tables
- **Frontend:** No frontend changes in this issue — backend-only endpoint
- **Vite proxy:** `/api/generate` already proxied to FastAPI

---

## Notes

- **Model selection:** `claude-sonnet-4-5` is currently used. Upgrade/downgrade by changing the model string in `claude_service.py`.
- **Prompt caching:** The static `_SYSTEM_PROMPT` is a candidate for Anthropic's prompt caching (`cache_control: {"type": "ephemeral"}`). Add in a follow-up if token costs become significant.
- **Streaming:** Not implemented. Add a `/generate/stream` endpoint using `client.messages.stream()` in a later milestone if progressive rendering is needed.
- **Persistence:** Generated questions are not stored. Add a `question_sets` table in M3 if history/replay is required.

---

*Spec generated 2026-06-22 by autonomous agent. Implementation already present in codebase.*
