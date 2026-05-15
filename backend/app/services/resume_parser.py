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
