# backend/app/routers/candidates.py
"""Candidates router — resume upload endpoint."""

from datetime import datetime, timezone

from fastapi import APIRouter, File, HTTPException, UploadFile, status, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.candidate import Candidate
from app.services.resume_parser import extract_text

MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB in bytes
ALLOWED_CONTENT_TYPES = {"application/pdf", "text/plain"}

router = APIRouter(prefix="/candidates", tags=["candidates"])


@router.post("/resume", status_code=status.HTTP_201_CREATED)
async def upload_resume(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """
    Upload a candidate's resume (PDF or plain text).

    - Validates file content type (application/pdf or text/plain).
    - Enforces a 5 MB file size limit.
    - Extracts plain text from the uploaded file.
    - Persists extracted text + metadata to the candidates table.

    Returns:
        201: { id, filename, uploaded_at, text_preview }
        400: Invalid content type or file too large.
        422: File is valid but text could not be extracted.
    """
    # --- Validate content type first (before reading the full body) ---
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Unsupported file type '{file.content_type}'. "
                "Please upload a PDF (.pdf) or plain-text (.txt) file."
            ),
        )

    # --- Read body and validate size ---
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File exceeds the 5 MB limit. Please upload a smaller file.",
        )

    # --- Extract text ---
    try:
        text = extract_text(content, file.content_type)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Could not extract text from the uploaded file: {exc}",
        ) from exc

    # --- Persist candidate record ---
    candidate = Candidate(
        resume_filename=file.filename or "resume",
        resume_content_type=file.content_type,
        resume_text=text,
        uploaded_at=datetime.now(timezone.utc),
    )
    db.add(candidate)
    db.commit()
    db.refresh(candidate)

    return {
        "id": candidate.id,
        "filename": candidate.resume_filename,
        "uploaded_at": candidate.uploaded_at.isoformat(),
        "text_preview": text[:200],
    }
