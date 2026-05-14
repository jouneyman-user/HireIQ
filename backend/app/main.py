from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.models import resume  # noqa: F401 — registers Resume with Base
from app.routers import health, resumes

app = FastAPI(title="HireIQ API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(resumes.router)
