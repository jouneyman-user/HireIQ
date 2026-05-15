"""Generate endpoint — POST /generate (stub; AI generation is a future milestone)."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.resume import Resume

router = APIRouter(prefix="/generate", tags=["generate"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class GenerateRequest(BaseModel):
    resume_id: int
    job_title: str
    seniority_level: str
    key_skills: list[str]


class GenerateResponse(BaseModel):
    message: str
    resume_id: int
    job_title: str
    seniority_level: str
    key_skills: list[str]


@router.post("/", status_code=202, response_model=GenerateResponse)
def generate_questions(payload: GenerateRequest, db: Session = Depends(get_db)):
    """Validate request and return a stub response. AI generation is deferred."""
    resume = db.query(Resume).filter(Resume.id == payload.resume_id).first()
    if not resume:
        raise HTTPException(status_code=404, detail=f"Resume {payload.resume_id} not found.")

    if not payload.job_title.strip():
        raise HTTPException(status_code=422, detail="job_title must not be empty.")
    if not payload.seniority_level.strip():
        raise HTTPException(status_code=422, detail="seniority_level must not be empty.")
    if not payload.key_skills:
        raise HTTPException(status_code=422, detail="key_skills must contain at least one entry.")

    # Stub response — AI generation will be implemented in a future milestone
    return GenerateResponse(
        message="Generation queued (stub — AI integration pending)",
        resume_id=payload.resume_id,
        job_title=payload.job_title,
        seniority_level=payload.seniority_level,
        key_skills=payload.key_skills,
    )
