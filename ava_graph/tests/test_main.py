"""Tests for FastAPI main application setup."""

import os
import pytest

# Must be set before importing app — triggers module-level ALLOWED_ORIGINS and SENTRY_DSN checks
os.environ.setdefault("ALLOWED_ORIGINS", "http://testserver,http://localhost:3000")
os.environ.setdefault("SENTRY_DSN", "https://fake@sentry.io/0")

from fastapi.testclient import TestClient

from ava_graph.main import app


@pytest.fixture
def client():
    """Create a TestClient for the FastAPI app."""
    return TestClient(app)


def test_app_starts(client):
    """Test that root endpoint returns app info."""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Ava Booking Agent"
    assert data["version"] == "1.0.0"


def test_health_check(client):
    """Health endpoint returns status + checks dict regardless of dep state."""
    response = client.get("/health")
    assert response.status_code in (200, 503)
    data = response.json()
    assert data["status"] in ("ok", "degraded")
    assert "checks" in data
    assert "version" in data


def test_cors_headers(client):
    """CORS headers present for allowed origins, absent for disallowed."""
    response = client.get("/", headers={"Origin": "http://testserver"})
    assert response.status_code == 200
    assert "access-control-allow-origin" in response.headers

    response_blocked = client.get("/", headers={"Origin": "http://evil.example.com"})
    assert response_blocked.status_code == 200
    assert response_blocked.headers.get("access-control-allow-origin") != "http://evil.example.com"
