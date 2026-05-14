"""Tests for the /health endpoint."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_returns_200():
    """GET /health should return HTTP 200."""
    response = client.get("/health")
    assert response.status_code == 200


def test_health_returns_ok_status():
    """GET /health should return {"status": "ok", ...}."""
    response = client.get("/health")
    data = response.json()
    assert data["status"] == "ok"


def test_health_returns_iso8601_timestamp():
    """GET /health should include an ISO-8601 UTC timestamp."""
    response = client.get("/health")
    data = response.json()
    assert "timestamp" in data
    # ISO-8601 timestamps end with +00:00 for UTC
    assert "+00:00" in data["timestamp"] or data["timestamp"].endswith("Z")
