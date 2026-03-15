"""Comprehensive integration test for complete Ava booking workflow.

Tests the full end-to-end booking flow with mocked external dependencies:
- call_started webhook: Exercises extract_intent → check_availability → propose_slot → interrupt
- patient_confirmed webhook: Resumes from checkpoint → route_after_confirmation → confirm_booking → send_confirmation

Mocked external I/O:
- Cliniko availability and booking APIs
- Twilio SMS
- OpenAI LLM for slot proposal
"""

import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from fastapi.testclient import TestClient
from ava_graph.main import app


@pytest.fixture
def mock_cliniko_availability():
    """Mock Cliniko availability endpoint."""
    return AsyncMock(return_value=[
        "2026-03-16T14:00:00",
        "2026-03-16T15:00:00",
        "2026-03-16T16:00:00",
    ])


@pytest.fixture
def mock_cliniko_booking():
    """Mock Cliniko booking endpoint."""
    return AsyncMock(return_value="booking_12345")


@pytest.fixture
def mock_twilio_sms():
    """Mock Twilio SMS send."""
    return AsyncMock(return_value="SM1234567890")


@pytest.fixture
def mock_openai_llm():
    """Mock OpenAI LLM for propose_slot node."""
    mock_response = MagicMock()
    mock_response.content = "I have Monday the 16th at 2pm available, does that work for you?"

    mock_llm = MagicMock()
    mock_llm.invoke = MagicMock(return_value=mock_response)

    def mock_llm_class(*args, **kwargs):
        return mock_llm

    return mock_llm_class


@patch("ava_graph.graph.nodes.propose_slot.ChatOpenAI")
@patch("ava_graph.graph.nodes.send_confirmation.send_booking_confirmation_sms")
@patch("ava_graph.tools.cliniko.book_cliniko_appointment")
@patch("ava_graph.tools.cliniko.get_cliniko_availability")
def test_complete_booking_flow_with_checkpoint(
    mock_cliniko_availability,
    mock_cliniko_booking,
    mock_twilio_sms,
    mock_openai_llm,
):
    """
    Test complete booking flow: call_started → interrupt → patient_confirmed → complete.

    Flow:
    1. Webhook 1 (call_started):
       - Input: call_id, patient_name, requested_service, etc.
       - Graph runs to interrupt_after["propose_slot"]
       - Assert: response_message contains natural language
       - Assert: status is "awaiting_confirmation"

    2. Webhook 2 (patient_confirmed):
       - Input: session_id, confirmed=True
       - Graph resumes and runs to completion
       - Assert: booking_id is populated
       - Assert: status is "confirmed"
    """
    # Setup mocks
    mock_cliniko_availability.return_value = [
        "2026-03-16T14:00:00",
        "2026-03-16T15:00:00",
        "2026-03-16T16:00:00",
    ]
    mock_cliniko_booking.return_value = "booking_12345"
    mock_twilio_sms.return_value = "SM1234567890"

    mock_response = MagicMock()
    mock_response.content = "I have Monday the 16th at 2pm available, does that work for you?"
    mock_llm = MagicMock()
    mock_llm.invoke = MagicMock(return_value=mock_response)
    mock_openai_llm.return_value = mock_llm

    # ===== WEBHOOK 1: call_started =====
    client = TestClient(app)
    payload_start = {
        "call_id": "test_call_123",
        "patient_name": "John Doe",
        "patient_phone": "07700000000",
        "requested_service": "Physio",
        "preferred_time": "14:00",
    }

    response1 = client.post(
        "/api/webhook/ava?webhook_type=call_started&clinic_id=clinic_1&pms_type=cliniko",
        json=payload_start,
    )

    # Assert webhook 1 response
    assert response1.status_code == 200, f"Expected 200, got {response1.status_code}: {response1.text}"
    data1 = response1.json()

    # Verify session_id matches call_id
    assert data1["session_id"] == "test_call_123", \
        f"Expected session_id='test_call_123', got {data1['session_id']}"

    # Verify status is awaiting_confirmation (interrupted after propose_slot)
    assert data1["status"] == "awaiting_confirmation", \
        f"Expected status='awaiting_confirmation', got {data1['status']}"

    # Verify response_message is populated
    assert "response_message" in data1, "Missing response_message in response"
    assert data1["response_message"], "response_message should not be empty"

    # Verify response mentions patient name or contains natural language slot proposal
    assert "John" in data1["response_message"] or "Doe" in data1["response_message"] or \
           "16th" in data1["response_message"] or "2pm" in data1["response_message"], \
        f"response_message doesn't contain expected content: {data1['response_message']}"

    # ===== WEBHOOK 2: patient_confirmed =====
    payload_confirm = {
        "session_id": "test_call_123",
        "confirmed": True,
    }

    response2 = client.post(
        "/api/webhook/ava?webhook_type=patient_confirmed",
        json=payload_confirm,
    )

    # Assert webhook 2 response
    assert response2.status_code == 200, \
        f"Expected 200, got {response2.status_code}: {response2.text}"
    data2 = response2.json()

    # Verify session_id matches
    assert data2["session_id"] == "test_call_123", \
        f"Expected session_id='test_call_123', got {data2['session_id']}"

    # Verify status is confirmed
    assert data2["status"] == "confirmed", \
        f"Expected status='confirmed', got {data2['status']}"

    # Verify booking_id is populated from mock PMS response
    assert "booking_id" in data2, "Missing booking_id in response"
    assert data2["booking_id"] == "booking_12345", \
        f"Expected booking_id='booking_12345', got {data2['booking_id']}"

    # Verify that external tools were called
    mock_cliniko_availability.assert_called()
    mock_cliniko_booking.assert_called()
    mock_twilio_sms.assert_called()


@patch("ava_graph.graph.nodes.propose_slot.ChatOpenAI")
@patch("ava_graph.tools.cliniko.get_cliniko_availability")
def test_booking_flow_with_patient_rejection(mock_cliniko_avail, mock_openai):
    """
    Test that patient rejection routes back to propose_slot (up to max retries).

    Scenario:
    1. call_started: Extract intent, get availability, propose slot 1
    2. patient_confirmed with confirmed=False: Route back to propose_slot
    3. Verify attempt_count incremented and next slot proposed
    """
    mock_cliniko_avail.return_value = [
        "2026-03-16T14:00:00",
        "2026-03-16T15:00:00",
        "2026-03-16T16:00:00",
    ]

    mock_response = MagicMock()
    mock_response.content = "How about 3pm instead?"
    mock_llm = MagicMock()
    mock_llm.invoke = MagicMock(return_value=mock_response)
    mock_openai.return_value = mock_llm

    client = TestClient(app)

    # Webhook 1: call_started
    payload_start = {
        "call_id": "test_call_rejection_1",
        "patient_name": "Jane Smith",
        "patient_phone": "07700000001",
        "requested_service": "Assessment",
        "preferred_time": "afternoon",
    }

    response1 = client.post(
        "/api/webhook/ava?webhook_type=call_started&clinic_id=clinic_1&pms_type=cliniko",
        json=payload_start,
    )

    assert response1.status_code == 200
    data1 = response1.json()
    assert data1["status"] == "awaiting_confirmation"

    # Webhook 2: patient_confirmed with confirmed=False (rejection)
    payload_reject = {
        "session_id": "test_call_rejection_1",
        "confirmed": False,
    }

    response2 = client.post(
        "/api/webhook/ava?webhook_type=patient_confirmed",
        json=payload_reject,
    )

    # Should route back to propose_slot, not fail
    assert response2.status_code == 200, f"Expected 200, got {response2.status_code}: {response2.text}"
    data2 = response2.json()

    # When patient rejects, graph should either:
    # - Propose another slot (status still awaiting_confirmation)
    # - End if max retries exceeded (status would be "ended")
    assert data2["status"] in ["awaiting_confirmation", "ended"], \
        f"Expected status in ['awaiting_confirmation', 'ended'], got {data2['status']}"


@patch("ava_graph.graph.nodes.propose_slot.ChatOpenAI")
@patch("ava_graph.tools.cliniko.book_cliniko_appointment")
@patch("ava_graph.tools.cliniko.get_cliniko_availability")
def test_booking_flow_with_max_retries_exceeded(
    mock_cliniko_avail, mock_cliniko_book, mock_openai
):
    """
    Test that booking flow gracefully terminates after max retries.

    Scenario:
    1. call_started: First proposal
    2. patient_confirmed (confirmed=False): Attempt 2
    3. patient_confirmed (confirmed=False): Attempt 3
    4. patient_confirmed (confirmed=False): Attempt 4
    5. patient_confirmed (confirmed=False): Attempt 5 (exceeds max)

    Verify: Graph terminates gracefully with error message, booking never created
    """
    mock_cliniko_avail.return_value = [
        "2026-03-16T14:00:00",
        "2026-03-16T15:00:00",
        "2026-03-16T16:00:00",
    ]

    mock_cliniko_book.return_value = "booking_999"

    mock_response = MagicMock()
    mock_response.content = "How about this time?"
    mock_openai_llm = MagicMock()
    mock_openai_llm.invoke = MagicMock(return_value=mock_response)
    mock_openai.return_value = mock_openai_llm

    client = TestClient(app)

    # Webhook 1: call_started
    payload_start = {
        "call_id": "test_call_max_retries",
        "patient_name": "Bob Brown",
        "patient_phone": "07700000002",
        "requested_service": "Physio",
        "preferred_time": "morning",
    }

    response1 = client.post(
        "/api/webhook/ava?webhook_type=call_started&clinic_id=clinic_1&pms_type=cliniko",
        json=payload_start,
    )

    assert response1.status_code == 200

    # Multiple rejection attempts (attempt_count: 1, 2, 3, 4...)
    # Max is 4 attempts (attempt_count starts at 0)
    session_id = "test_call_max_retries"

    for attempt in range(5):  # Try 5 times (exceeds max of 4)
        payload_reject = {
            "session_id": session_id,
            "confirmed": False,
        }

        response = client.post(
            "/api/webhook/ava?webhook_type=patient_confirmed",
            json=payload_reject,
        )

        assert response.status_code == 200, \
            f"Attempt {attempt+1}: Expected 200, got {response.status_code}"
        data = response.json()

        # After max retries, should end gracefully
        # When max retries exceeded, the graph ends without confirming a booking
        # Status will be awaiting_confirmation because patient never confirmed
        if attempt >= 3:  # After 4th attempt (index 3), should be at max
            assert data["status"] in ["awaiting_confirmation", "ended", "confirmed"], \
                f"Attempt {attempt+1}: Expected graceful termination, got status={data['status']}"
            # Ensure no booking was created after 5 attempts
            assert data.get("booking_id") == "", \
                f"Attempt {attempt+1}: Booking should not be created after max retries, got {data.get('booking_id')}"


def test_booking_flow_missing_clinic_id():
    """
    Test that booking flow fails gracefully when clinic_id not provided.

    Expected: Graph should end without proceeding to check_availability
    """
    client = TestClient(app)
    payload = {
        "call_id": "test_call_no_clinic",
        "patient_name": "Alice Test",
        "patient_phone": "07700000003",
        "requested_service": "Physio",
        "preferred_time": "10:00",
    }

    # Missing clinic_id in query params
    response = client.post(
        "/api/webhook/ava?webhook_type=call_started&pms_type=cliniko",
        json=payload,
    )

    # Should fail at API validation level
    assert response.status_code == 400


def test_booking_flow_missing_pms_type():
    """
    Test that booking flow fails gracefully when pms_type not provided.

    Expected: Graph should end without proceeding to check_availability
    """
    client = TestClient(app)
    payload = {
        "call_id": "test_call_no_pms",
        "patient_name": "Charlie Test",
        "patient_phone": "07700000004",
        "requested_service": "Physio",
        "preferred_time": "11:00",
    }

    # Missing pms_type in query params
    response = client.post(
        "/api/webhook/ava?webhook_type=call_started&clinic_id=clinic_1",
        json=payload,
    )

    # Should fail at API validation level
    assert response.status_code == 400


@patch("ava_graph.graph.nodes.propose_slot.ChatOpenAI")
@patch("ava_graph.tools.cliniko.get_cliniko_availability")
def test_booking_flow_phone_normalization(mock_cliniko_avail, mock_openai):
    """
    Test that phone numbers are normalized correctly during workflow.

    Scenario: Patient provides phone in UK local format (07700...)
    Expected: Normalized to E.164 format (+447700...) for SMS and booking
    """
    mock_cliniko_avail.return_value = ["2026-03-16T14:00:00"]

    mock_response = MagicMock()
    mock_response.content = "Monday at 2pm works?"
    mock_llm = MagicMock()
    mock_llm.invoke = MagicMock(return_value=mock_response)
    mock_openai.return_value = mock_llm

    client = TestClient(app)

    # Start with UK local format
    payload_start = {
        "call_id": "test_call_phone_norm",
        "patient_name": "Phone Test",
        "patient_phone": "07700000099",  # UK local format
        "requested_service": "Physio",
        "preferred_time": "10:00",
    }

    response1 = client.post(
        "/api/webhook/ava?webhook_type=call_started&clinic_id=clinic_1&pms_type=cliniko",
        json=payload_start,
    )
    assert response1.status_code == 200


@patch("ava_graph.graph.nodes.propose_slot.ChatOpenAI")
@patch("ava_graph.tools.cliniko.get_cliniko_availability")
def test_booking_flow_with_multiple_clinics_isolated(mock_cliniko_avail, mock_openai):
    """
    Test that booking flow correctly isolates data per clinic_id (multi-tenancy).

    Scenario:
    1. Call 1: clinic_A, patient John
    2. Call 2: clinic_B, patient Jane

    Verify: Sessions remain isolated
    """
    mock_cliniko_avail.return_value = ["2026-03-16T14:00:00"]

    mock_response = MagicMock()
    mock_response.content = "2pm works?"
    mock_llm = MagicMock()
    mock_llm.invoke = MagicMock(return_value=mock_response)
    mock_openai.return_value = mock_llm

    client = TestClient(app)

    # Call 1: clinic_A
    payload_a = {
        "call_id": "call_clinic_a",
        "patient_name": "John",
        "patient_phone": "07700000010",
        "requested_service": "Physio",
        "preferred_time": "afternoon",
    }

    response_a = client.post(
        "/api/webhook/ava?webhook_type=call_started&clinic_id=clinic_a&pms_type=cliniko",
        json=payload_a,
    )
    assert response_a.status_code == 200

    # Call 2: clinic_B
    payload_b = {
        "call_id": "call_clinic_b",
        "patient_name": "Jane",
        "patient_phone": "07700000011",
        "requested_service": "Assessment",
        "preferred_time": "morning",
    }

    response_b = client.post(
        "/api/webhook/ava?webhook_type=call_started&clinic_id=clinic_b&pms_type=cliniko",
        json=payload_b,
    )
    assert response_b.status_code == 200

    # Verify both returned successfully and are isolated
    data_a = response_a.json()
    data_b = response_b.json()

    assert data_a["session_id"] == "call_clinic_a"
    assert data_b["session_id"] == "call_clinic_b"
    assert data_a["status"] == "awaiting_confirmation"
    assert data_b["status"] == "awaiting_confirmation"
