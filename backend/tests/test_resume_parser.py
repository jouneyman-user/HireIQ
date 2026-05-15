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
