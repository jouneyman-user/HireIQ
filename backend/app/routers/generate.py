"""Generate endpoint — POST /generate — calls Claude API and returns categorised questions."""
import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.claude_service import ClaudeServiceError, generate_interview_questions

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/generate", tags=["generate"])


# ── request / response models ─────────────────────────────────────────────────

class GenerateRequest(BaseModel):
    resume_text: str
    job_title: str
    seniority_level: str
    key_skills: list[str]


class Question(BaseModel):
    text: str
    follow_up: str
    what_to_listen_for: str


class GenerateResponse(BaseModel):
    technical: list[Question]
    behavioural: list[Question]
    culture_fit: list[Question]


# ── endpoint ──────────────────────────────────────────────────────────────────

@router.post("/", status_code=200, response_model=GenerateResponse)
def generate_questions(payload: GenerateRequest) -> GenerateResponse:
    """Call Claude API and return interview questions grouped by category.

    Returns 200 with categorised questions on success.
    Returns 422 if any required field is blank / empty.
    Returns 502 if the Claude API is unavailable or returns an unusable response.
    """
    if not payload.resume_text.strip():
        raise HTTPException(status_code=422, detail="resume_text must not be empty.")
    if not payload.job_title.strip():
        raise HTTPException(status_code=422, detail="job_title must not be empty.")
    if not payload.seniority_level.strip():
        raise HTTPException(status_code=422, detail="seniority_level must not be empty.")
    if not payload.key_skills:
        raise HTTPException(
            status_code=422, detail="key_skills must contain at least one entry."
        )

    try:
        result = generate_interview_questions(
            resume_text=payload.resume_text,
            job_title=payload.job_title,
            seniority_level=payload.seniority_level,
            key_skills=payload.key_skills,
        )
    except ClaudeServiceError as exc:
        logger.error("ClaudeServiceError: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return GenerateResponse(
        technical=[Question(**q) for q in result["technical"]],
        behavioural=[Question(**q) for q in result["behavioural"]],
        culture_fit=[Question(**q) for q in result["culture_fit"]],
    )
