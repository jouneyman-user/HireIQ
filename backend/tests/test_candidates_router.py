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
