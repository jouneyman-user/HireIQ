from fastapi import APIRouter
from datetime import datetime, timezone

router = APIRouter()


@router.get("/health", status_code=200)
def health_check():
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}
