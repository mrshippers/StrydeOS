"""Tests for send_confirmation node."""

import pytest
from unittest.mock import patch, AsyncMock
from ava_graph.graph.nodes.send_confirmation import send_confirmation
from ava_graph.graph.state import AvaState


@pytest.mark.asyncio
async def test_send_confirmation_sends_sms_and_returns_response():
    """Verify send_confirmation sends SMS and generates final response."""
    state = AvaState(
        patient_name="John Doe",
        patient_phone="07700000000",
        requested_service="Physio",
        preferred_time="Tuesday",
        clinic_id="clinic_001",
        pms_type="writeupp",
        available_slots=[],
        confirmed_slot="2026-03-16T14:00:00",
        patient_confirmed=True,
        response_message="Great!",
        session_id="session_abc",
        attempt_count=1,
        messages=[],
        booking_id="booking_123",
    )

    with patch("ava_graph.graph.nodes.send_confirmation.send_booking_confirmation_sms") as mock_sms:
        mock_sms.return_value = "sms_id_123"

        result = await send_confirmation(state)

        assert "Perfect" in result["response_message"] or "confirmed" in result["response_message"].lower()
        mock_sms.assert_called_once()


@pytest.mark.asyncio
async def test_send_confirmation_formats_datetime_correctly():
    """Verify datetime is formatted as readable string."""
    state = AvaState(
        patient_name="Jane Smith",
        patient_phone="07755123456",
        requested_service="Physio",
        preferred_time="Monday",
        clinic_id="clinic_002",
        pms_type="cliniko",
        available_slots=[],
        confirmed_slot="2026-03-16T14:00:00",
        patient_confirmed=True,
        response_message="",
        session_id="session_xyz",
        attempt_count=1,
        messages=[],
        booking_id="booking_456",
    )

    with patch("ava_graph.graph.nodes.send_confirmation.send_booking_confirmation_sms") as mock_sms:
        mock_sms.return_value = "sms_id_456"

        result = await send_confirmation(state)

        # Check that the datetime was formatted correctly
        assert "Monday, March 16 at 2:00 PM" in result["response_message"]
        assert "Jane Smith" in result["response_message"]


@pytest.mark.asyncio
async def test_send_confirmation_handles_missing_phone():
    """Verify send_confirmation handles missing phone gracefully."""
    state = AvaState(
        patient_name="Bob Johnson",
        patient_phone="",
        requested_service="Physio",
        preferred_time="Wednesday",
        clinic_id="clinic_003",
        pms_type="writeupp",
        available_slots=[],
        confirmed_slot="2026-03-17T10:30:00",
        patient_confirmed=True,
        response_message="",
        session_id="session_def",
        attempt_count=1,
        messages=[],
        booking_id="booking_789",
    )

    with patch("ava_graph.graph.nodes.send_confirmation.send_booking_confirmation_sms") as mock_sms:
        result = await send_confirmation(state)

        # SMS should not be called if phone is empty
        mock_sms.assert_not_called()
        # But confirmation response should still be generated
        assert "booked" in result["response_message"].lower()


@pytest.mark.asyncio
async def test_send_confirmation_updates_messages_transcript():
    """Verify send_confirmation appends response to messages."""
    state = AvaState(
        patient_name="Alice Wonder",
        patient_phone="07700999999",
        requested_service="Physio",
        preferred_time="Friday",
        clinic_id="clinic_004",
        pms_type="jane",
        available_slots=[],
        confirmed_slot="2026-03-20T16:00:00",
        patient_confirmed=True,
        response_message="",
        session_id="session_ghi",
        attempt_count=1,
        messages=["Hello", "How can I help?"],
        booking_id="booking_999",
    )

    with patch("ava_graph.graph.nodes.send_confirmation.send_booking_confirmation_sms") as mock_sms:
        mock_sms.return_value = "sms_id_999"

        result = await send_confirmation(state)

        # Check messages were appended
        assert len(result["messages"]) == 3
        assert result["messages"][0] == "Hello"
        assert result["messages"][1] == "How can I help?"
        assert "Perfect" in result["messages"][2] or "confirmed" in result["messages"][2].lower()
