"""Tests for the /resumes endpoints."""
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


def _pdf_file():
    return ("file", ("test.pdf", io.BytesIO(b"%PDF-1.4 fake content"), "application/pdf"))


def _docx_file():
    return (
        "file",
        (
            "test.docx",
            io.BytesIO(b"PK fake docx content"),
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ),
    )


def test_upload_returns_201():
    """POST /resumes/ with a valid PDF should return HTTP 201."""
    response = client.post(
        "/resumes/",
        data={"candidate_name": "Alice", "candidate_email": "alice@test.com"},
        files=[_pdf_file()],
    )
    assert response.status_code == 201


def test_upload_returns_resume_metadata():
    """POST /resumes/ response body should include all resume metadata fields."""
    response = client.post(
        "/resumes/",
        data={"candidate_name": "Alice", "candidate_email": "alice@test.com"},
        files=[_pdf_file()],
    )
    data = response.json()
    assert data["candidate_name"] == "Alice"
    assert data["candidate_email"] == "alice@test.com"
    assert data["content_type"] == "application/pdf"
    assert data["original_filename"] == "test.pdf"
    assert "id" in data
    assert "stored_filename" in data
    assert "file_size_bytes" in data
    assert "uploaded_at" in data


def test_upload_rejects_invalid_type():
    """POST /resumes/ with a non-PDF/DOCX file should return HTTP 415."""
    bad_file = ("file", ("test.txt", io.BytesIO(b"hello"), "text/plain"))
    response = client.post(
        "/resumes/",
        data={"candidate_name": "Bob", "candidate_email": "bob@test.com"},
        files=[bad_file],
    )
    assert response.status_code == 415


def test_upload_rejects_large_file():
    """POST /resumes/ with a file exceeding 10 MB should return HTTP 413."""
    large_content = b"x" * (10 * 1024 * 1024 + 1)
    large_file = ("file", ("big.pdf", io.BytesIO(large_content), "application/pdf"))
    response = client.post(
        "/resumes/",
        data={"candidate_name": "Carol", "candidate_email": "carol@test.com"},
        files=[large_file],
    )
    assert response.status_code == 413


def test_list_resumes():
    """GET /resumes/ should return all uploaded resumes."""
    client.post(
        "/resumes/",
        data={"candidate_name": "Alice", "candidate_email": "alice@test.com"},
        files=[_pdf_file()],
    )
    response = client.get("/resumes/")
    assert response.status_code == 200
    assert len(response.json()) >= 1


def test_list_resumes_ordered():
    """GET /resumes/ should return resumes with newest upload first."""
    client.post(
        "/resumes/",
        data={"candidate_name": "Alice", "candidate_email": "alice@test.com"},
        files=[_pdf_file()],
    )
    client.post(
        "/resumes/",
        data={"candidate_name": "Bob", "candidate_email": "bob@test.com"},
        files=[_docx_file()],
    )
    response = client.get("/resumes/")
    data = response.json()
    assert response.status_code == 200
    assert len(data) == 2
    # Newest first — Bob was uploaded second
    assert data[0]["candidate_name"] == "Bob"
    assert data[1]["candidate_name"] == "Alice"


def test_get_resume_by_id():
    """GET /resumes/{id} should return the resume with the matching ID."""
    upload = client.post(
        "/resumes/",
        data={"candidate_name": "Alice", "candidate_email": "alice@test.com"},
        files=[_pdf_file()],
    )
    resume_id = upload.json()["id"]
    response = client.get(f"/resumes/{resume_id}")
    assert response.status_code == 200
    assert response.json()["id"] == resume_id


def test_get_resume_404():
    """GET /resumes/{id} with a non-existent ID should return HTTP 404."""
    response = client.get("/resumes/99999")
    assert response.status_code == 404
