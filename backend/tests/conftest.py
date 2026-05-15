# backend/tests/conftest.py
"""Shared pytest fixtures for backend tests."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app

# Import model to register it with Base before create_all
import app.models.candidate  # noqa: F401

TEST_DATABASE_URL = "sqlite:///:memory:"
test_engine = create_engine(
    TEST_DATABASE_URL, connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(
    autocommit=False, autoflush=False, bind=test_engine
)


@pytest.fixture
def client():
    """
    TestClient with an isolated in-memory SQLite DB.

    - Creates all tables before the test.
    - Overrides get_db so routes use the test DB, not hireiq.db.
    - Drops all tables after the test for full isolation.
    """
    Base.metadata.create_all(bind=test_engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=test_engine)
