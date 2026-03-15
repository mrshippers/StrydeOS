"""Tests for FastAPI main application setup."""

import pytest
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
    """Test that health check endpoint returns ok status."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"


def test_cors_headers(client):
    """Test that CORS headers are present in response."""
    response = client.get("/", headers={"Origin": "http://example.com"})
    assert response.status_code == 200
    # CORS headers should be in the response
    assert "access-control-allow-origin" in response.headers
