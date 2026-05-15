"""Claude API service — prompt construction, API call, and response parsing."""
import json
import logging
import os

import anthropic

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = (
    "You are an expert technical recruiter. Your task is to generate tailored "
    "interview questions based on a candidate's resume and the target role. "
    "You must respond with valid JSON only — no prose, no markdown fences, "
    "just the raw JSON object."
)


def _build_user_prompt(
    resume_text: str,
    job_title: str,
    seniority_level: str,
    key_skills: list[str],
) -> str:
    skills_str = ", ".join(key_skills)
    return (
        f"Generate interview questions for this candidate.\n\n"
        f"RESUME:\n{resume_text}\n\n"
        f"ROLE:\n"
        f"- Job Title: {job_title}\n"
        f"- Seniority Level: {seniority_level}\n"
        f"- Required Skills: {skills_str}\n\n"
        f"Generate at least 3 questions in each of these categories:\n"
        f"1. technical — questions that test domain knowledge and hands-on skills\n"
        f"2. behavioural — STAR-format questions about past experiences\n"
        f"3. culture_fit — questions that probe values, work style, and team fit\n\n"
        f"For each question provide:\n"
        f'- "text": the interview question\n'
        f'- "follow_up": one suggested follow-up question\n'
        f'- "what_to_listen_for": a note for the recruiter on what a strong answer contains\n\n'
        f"Respond ONLY with this JSON structure (no other text):\n"
        f"{{\n"
        f'  "technical": [{{"text": "...", "follow_up": "...", "what_to_listen_for": "..."}}],\n'
        f'  "behavioural": [{{"text": "...", "follow_up": "...", "what_to_listen_for": "..."}}],\n'
        f'  "culture_fit": [{{"text": "...", "follow_up": "...", "what_to_listen_for": "..."}}]\n'
        f"}}"
    )


class ClaudeServiceError(Exception):
    """Raised when the Claude API returns an error or an unusable response."""

    def __init__(self, message: str, status_code: int = 502) -> None:
        super().__init__(message)
        self.status_code = status_code


def generate_interview_questions(
    resume_text: str,
    job_title: str,
    seniority_level: str,
    key_skills: list[str],
) -> dict:
    """Call Claude API and return parsed question categories.

    Returns a dict with keys: technical, behavioural, culture_fit.
    Each value is a list of dicts with keys: text, follow_up, what_to_listen_for.

    Raises:
        ClaudeServiceError: on API failure, non-JSON response, or < 3 questions
                            per category.
    """
    api_key = os.getenv("ANTHROPIC_API_KEY")
    client = anthropic.Anthropic(api_key=api_key)

    try:
        message = client.messages.create(
            model="claude-sonnet-4-5",
            max_tokens=2048,
            system=_SYSTEM_PROMPT,
            messages=[
                {
                    "role": "user",
                    "content": _build_user_prompt(
                        resume_text, job_title, seniority_level, key_skills
                    ),
                }
            ],
        )
    except anthropic.APIError as exc:
        logger.error("Claude API request failed: %s", exc)
        raise ClaudeServiceError(
            f"The AI service is temporarily unavailable. Please try again later. ({exc})"
        ) from exc

    raw_text = message.content[0].text

    try:
        data = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        logger.error("Claude returned non-JSON response: %.200s", raw_text)
        raise ClaudeServiceError(
            "The AI service returned an unexpected response. Please try again later."
        ) from exc

    _required_categories = ("technical", "behavioural", "culture_fit")
    for category in _required_categories:
        if category not in data:
            logger.error("Claude response missing category '%s'", category)
            raise ClaudeServiceError(
                "The AI service returned an incomplete response. Please try again later."
            )
        if len(data[category]) < 3:
            logger.error(
                "Claude returned %d questions for '%s' (minimum 3 required)",
                len(data[category]),
                category,
            )
            raise ClaudeServiceError(
                "The AI service returned too few questions. Please try again later."
            )

    return data
