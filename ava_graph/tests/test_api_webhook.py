"""Tests for FastAPI webhook endpoint."""

from unittest.mock import patch, AsyncMock, MagicMock
from fastapi.testclient import TestClient
from ava_graph.main import app


def _mock_llm(content="I have Tuesday at 2pm, does that work for you?"):
    """Helper: build a mock ChatAnthropic class and instance."""
    mock_response = MagicMock()
    mock_response.content = content
    mock_llm_instance = MagicMock()
    mock_llm_instance.invoke = MagicMock(return_value=mock_response)
    mock_cls = MagicMock(return_value=mock_llm_instance)
    return mock_cls


@patch("ava_graph.graph.nodes.propose_slot.ChatAnthropic")
@patch(
    "ava_graph.graph.nodes.check_availability.get_cliniko_availability",
    new_callable=AsyncMock,
)
def test_webhook_call_started(mock_avail, mock_llm_cls):
    """Test webhook_type=call_started creates session and returns at interrupt point."""
    mock_avail.return_value = ["2026-04-21T14:00:00", "2026-04-21T15:00:00"]
    mock_llm_cls.side_effect = None
    mock_llm_cls.return_value = _mock_llm().return_value

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
    # Validate ElevenLabs Conversational AI response format
    assert "response" in data
    assert isinstance(data["response"], str)
    assert "end_conversation" in data
    assert data["end_conversation"] is False  # At interrupt point, don't end


@patch("ava_graph.graph.nodes.send_confirmation.send_booking_confirmation_sms", new_callable=AsyncMock)
@patch("ava_graph.graph.nodes.confirm_booking.book_cliniko_appointment", new_callable=AsyncMock)
@patch("ava_graph.graph.nodes.propose_slot.ChatAnthropic")
@patch(
    "ava_graph.graph.nodes.check_availability.get_cliniko_availability",
    new_callable=AsyncMock,
)
def test_webhook_patient_confirmed(mock_avail, mock_llm_cls, mock_book, mock_sms):
    """Test webhook_type=patient_confirmed resumes graph from checkpoint."""
    mock_avail.return_value = ["2026-04-21T14:00:00"]
    mock_book.return_value = "booking_12345"
    mock_sms.return_value = "SM1234567890"

    mock_response = MagicMock()
    mock_response.content = "Tuesday at 2pm works?"
    mock_llm_instance = MagicMock()
    mock_llm_instance.invoke = MagicMock(return_value=mock_response)
    mock_llm_cls.return_value = mock_llm_instance

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
    # Validate ElevenLabs Conversational AI response format
    assert "response" in data
    assert isinstance(data["response"], str)
    assert "end_conversation" in data
    assert data["end_conversation"] is True  # Booking confirmed, end call


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
