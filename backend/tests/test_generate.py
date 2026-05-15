"""Tests for POST /generate endpoint (AI question generation)."""
from unittest.mock import patch

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
