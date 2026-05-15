"""Tests for the POST /generate endpoint."""
import io

import pytest
from fastapi.testclient import TestClient

import app.routers.resumes as resumes_module
from app.database import Base, engine
from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_db(tmp_path, monkeypatch):
    """Run against a fresh DB schema; redirect uploads to a temp directory."""
    monkeypatch.setattr(resumes_module, "UPLOAD_DIR", str(tmp_path))
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


def _seed_resume(tmp_path, monkeypatch) -> int:
    """Upload a dummy resume and return its id."""
    monkeypatch.setattr(resumes_module, "UPLOAD_DIR", str(tmp_path))
    response = client.post(
        "/resumes/",
        data={"candidate_name": "Alice", "candidate_email": "alice@test.com"},
        files=[("file", ("test.pdf", io.BytesIO(b"%PDF-1.4 fake"), "application/pdf"))],
    )
    assert response.status_code == 201
    return response.json()["id"]


def _valid_payload(resume_id: int) -> dict:
    return {
        "resume_id": resume_id,
        "job_title": "Frontend Engineer",
        "seniority_level": "Senior",
        "key_skills": ["TypeScript", "React"],
    }


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


def test_generate_returns_202_with_valid_payload(tmp_path, monkeypatch):
    """POST /generate/ with a valid payload should return HTTP 202 with echoed fields."""
    resume_id = _seed_resume(tmp_path, monkeypatch)
    response = client.post("/generate/", json=_valid_payload(resume_id))
    assert response.status_code == 202
    data = response.json()
    assert "message" in data
    assert data["resume_id"] == resume_id
    assert data["job_title"] == "Frontend Engineer"
    assert data["seniority_level"] == "Senior"
    assert data["key_skills"] == ["TypeScript", "React"]


def test_generate_response_contains_stub_message(tmp_path, monkeypatch):
    """Response message should indicate a stub / pending AI integration."""
    resume_id = _seed_resume(tmp_path, monkeypatch)
    response = client.post("/generate/", json=_valid_payload(resume_id))
    assert response.status_code == 202
    assert "stub" in response.json()["message"].lower()


# ---------------------------------------------------------------------------
# 404 — resume not found
# ---------------------------------------------------------------------------


def test_generate_returns_404_when_resume_not_found():
    """POST /generate/ with a non-existent resume_id should return HTTP 404."""
    response = client.post(
        "/generate/",
        json={
            "resume_id": 99999,
            "job_title": "Engineer",
            "seniority_level": "Mid-Level",
            "key_skills": ["Python"],
        },
    )
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# 422 — validation errors on payload fields
# ---------------------------------------------------------------------------


def test_generate_returns_422_when_job_title_empty(tmp_path, monkeypatch):
    """POST /generate/ with an empty job_title should return HTTP 422."""
    resume_id = _seed_resume(tmp_path, monkeypatch)
    payload = _valid_payload(resume_id)
    payload["job_title"] = "   "  # whitespace only
    response = client.post("/generate/", json=payload)
    assert response.status_code == 422


def test_generate_returns_422_when_seniority_empty(tmp_path, monkeypatch):
    """POST /generate/ with an empty seniority_level should return HTTP 422."""
    resume_id = _seed_resume(tmp_path, monkeypatch)
    payload = _valid_payload(resume_id)
    payload["seniority_level"] = "   "  # whitespace only
    response = client.post("/generate/", json=payload)
    assert response.status_code == 422


def test_generate_returns_422_when_key_skills_empty(tmp_path, monkeypatch):
    """POST /generate/ with an empty key_skills list should return HTTP 422."""
    resume_id = _seed_resume(tmp_path, monkeypatch)
    payload = _valid_payload(resume_id)
    payload["key_skills"] = []
    response = client.post("/generate/", json=payload)
    assert response.status_code == 422


def test_generate_returns_422_when_missing_resume_id():
    """POST /generate/ without resume_id should trigger FastAPI's automatic 422."""
    response = client.post(
        "/generate/",
        json={
            "job_title": "Engineer",
            "seniority_level": "Mid-Level",
            "key_skills": ["Python"],
        },
    )
    assert response.status_code == 422
