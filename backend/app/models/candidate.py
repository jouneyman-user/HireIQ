# backend/app/models/candidate.py

from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, DateTime
from app.database import Base


class Candidate(Base):
    __tablename__ = "candidates"

    id = Column(Integer, primary_key=True, autoincrement=True)
    resume_filename = Column(String(255), nullable=False)
    resume_content_type = Column(String(64), nullable=False)
    resume_text = Column(Text, nullable=False)
    uploaded_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
