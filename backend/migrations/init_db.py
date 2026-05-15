# backend/migrations/init_db.py
from app.database import Base, engine
import app.main  # noqa: F401 — importing app.main triggers:
                 # candidates router → Candidate model → registers with Base
                 # All models are registered before create_all runs.

if __name__ == "__main__":
    Base.metadata.create_all(bind=engine)
    print("Database initialised.")
