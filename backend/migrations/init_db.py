from app.database import Base, engine
import app.main  # noqa: F401 — triggers model imports so Base knows about all tables

if __name__ == "__main__":
    Base.metadata.create_all(bind=engine)
    print("Database initialised.")
