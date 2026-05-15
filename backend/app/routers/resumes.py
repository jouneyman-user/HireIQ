import os
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.resume import Resume

UPLOAD_DIR = "uploads/resumes"
# DOCX content-type: application/vnd.openxmlformats-officedocument.wordprocessingml.document
ALLOWED_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
MAX_FILE_BYTES = 10 * 1024 * 1024  # 10 MB

# Defence-in-depth: create upload directory if migration hasn't run yet
os.makedirs(UPLOAD_DIR, exist_ok=True)

router = APIRouter(prefix="/resumes", tags=["resumes"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/", status_code=201)
async def upload_resume(
    candidate_name: str = Form(...),
    candidate_email: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=415, detail="Only PDF and DOCX files are accepted.")

    contents = await file.read()
    if len(contents) > MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds 10 MB limit.")

    ext = os.path.splitext(file.filename or "")[1].lower() or ".bin"
    stored_name = f"{uuid.uuid4()}{ext}"
    dest = os.path.join(UPLOAD_DIR, stored_name)

    with open(dest, "wb") as f:
        f.write(contents)

    resume = Resume(
        candidate_name=candidate_name,
        candidate_email=candidate_email,
        original_filename=file.filename or stored_name,
        stored_filename=stored_name,
        content_type=file.content_type,
        file_size_bytes=len(contents),
        uploaded_at=datetime.utcnow(),
    )
    db.add(resume)
    db.commit()
    db.refresh(resume)
    return resume


@router.get("/")
def list_resumes(db: Session = Depends(get_db)):
    return db.query(Resume).order_by(Resume.uploaded_at.desc()).all()


@router.get("/{resume_id}")
def get_resume(resume_id: int, db: Session = Depends(get_db)):
    resume = db.query(Resume).filter(Resume.id == resume_id).first()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found.")
    return resume
