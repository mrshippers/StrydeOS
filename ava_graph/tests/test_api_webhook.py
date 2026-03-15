"""Tests for FastAPI webhook endpoint."""

from fastapi.testclient import TestClient
from ava_graph.main import app


def test_webhook_call_started():
    """Test webhook_type=call_started creates session and returns at interrupt point."""
    client = TestClient(app)
    payload = {
        "call_id": "call_123",
        "patient_name": "John Doe",
        "patient_phone": "07700000000",
        "requested_service": "Physio",
        "preferred_time": "14:00",
    }
    response = client.post(
        "/api/webhook/ava?webhook_type=call_started&clinic_id=clinic_1&pms_type=cliniko",
        json=payload,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["session_id"] == "call_123"
    assert "response_message" in data
    assert data["status"] == "awaiting_confirmation"


def test_webhook_patient_confirmed():
    """Test webhook_type=patient_confirmed resumes graph from checkpoint."""
    client = TestClient(app)

    # First, call_started to create session
    payload_start = {
        "call_id": "call_456",
        "patient_name": "Jane Smith",
        "patient_phone": "07700000001",
        "requested_service": "Massage",
        "preferred_time": "10:00",
    }
    response = client.post(
        "/api/webhook/ava?webhook_type=call_started&clinic_id=clinic_1&pms_type=cliniko",
        json=payload_start,
    )
    assert response.status_code == 200

    # Then, patient_confirmed to resume
    payload_confirm = {
        "session_id": "call_456",
        "confirmed": True,
    }
    response = client.post(
        "/api/webhook/ava?webhook_type=patient_confirmed",
        json=payload_confirm,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["session_id"] == "call_456"
    assert data["status"] == "confirmed"


def test_webhook_missing_required_params_call_started():
    """Test 400 Bad Request when required params missing for call_started."""
    client = TestClient(app)
    payload = {
        "call_id": "call_789",
        # Missing patient_name
        "patient_phone": "07700000002",
    }
    response = client.post(
        "/api/webhook/ava?webhook_type=call_started&clinic_id=clinic_1&pms_type=cliniko",
        json=payload,
    )
    assert response.status_code == 400


def test_webhook_missing_required_params_patient_confirmed():
    """Test 400 Bad Request when required params missing for patient_confirmed."""
    client = TestClient(app)
    payload = {
        # Missing session_id
        "confirmed": True,
    }
    response = client.post(
        "/api/webhook/ava?webhook_type=patient_confirmed",
        json=payload,
    )
    assert response.status_code == 400


def test_webhook_invalid_webhook_type():
    """Test 400 Bad Request for invalid webhook_type."""
    client = TestClient(app)
    payload = {
        "call_id": "call_999",
        "patient_name": "Test User",
        "patient_phone": "07700000003",
    }
    response = client.post(
        "/api/webhook/ava?webhook_type=invalid_type&clinic_id=clinic_1&pms_type=cliniko",
        json=payload,
    )
    assert response.status_code == 400
