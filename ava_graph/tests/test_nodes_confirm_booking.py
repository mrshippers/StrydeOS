"""Tests for confirm_booking node."""

import pytest
from unittest.mock import patch, AsyncMock
from ava_graph.graph.nodes.confirm_booking import confirm_booking
from ava_graph.graph.state import AvaState


@pytest.mark.asyncio
async def test_confirm_booking_writes_to_writeupp():
    """Verify confirm_booking routes to WriteUpp and writes appointment."""
    state = AvaState(
        patient_name="John Doe",
        patient_phone="07700000000",
        requested_service="Physio Assessment",
        preferred_time="Tuesday",
        clinic_id="clinic_001",
        pms_type="writeupp",
        available_slots=["2026-03-16T14:00:00"],
        confirmed_slot="2026-03-16T14:00:00",
        patient_confirmed=True,
        response_message="Great!",
        session_id="session_abc",
        attempt_count=1,
        messages=[],
        booking_id="",
    )

    with patch("ava_graph.graph.nodes.confirm_booking.book_writeupp_appointment") as mock_book:
        mock_book.return_value = "booking_12345"

        result = await confirm_booking(state)

        assert result["confirmed_slot"] == "2026-03-16T14:00:00"
        assert result["booking_id"] == "booking_12345"
        mock_book.assert_called_once_with(
            clinic_id="clinic_001",
            patient_name="John Doe",
            patient_phone="07700000000",
            service_type="Physio Assessment",
            slot="2026-03-16T14:00:00",
            api_key="",
            base_url="",
        )


@pytest.mark.asyncio
async def test_confirm_booking_writes_to_cliniko():
    """Verify confirm_booking routes to Cliniko and writes appointment."""
    state = AvaState(
        patient_name="Jane Smith",
        patient_phone="07701111111",
        requested_service="Physio",
        preferred_time="Monday",
        clinic_id="clinic_002",
        pms_type="cliniko",
        available_slots=["2026-03-17T10:00:00"],
        confirmed_slot="2026-03-17T10:00:00",
        patient_confirmed=True,
        response_message="Perfect!",
        session_id="session_def",
        attempt_count=1,
        messages=[],
        booking_id="",
    )

    with patch("ava_graph.graph.nodes.confirm_booking.book_cliniko_appointment") as mock_book:
        mock_book.return_value = "cliniko_456"

        result = await confirm_booking(state)

        assert result["booking_id"] == "cliniko_456"
        mock_book.assert_called_once()


@pytest.mark.asyncio
async def test_confirm_booking_writes_to_jane():
    """Verify confirm_booking routes to Jane App and writes appointment."""
    state = AvaState(
        patient_name="Alice Brown",
        patient_phone="07702222222",
        requested_service="Massage",
        preferred_time="Wednesday",
        clinic_id="clinic_003",
        pms_type="jane",
        available_slots=["2026-03-18T14:30:00"],
        confirmed_slot="2026-03-18T14:30:00",
        patient_confirmed=True,
        response_message="Confirmed!",
        session_id="session_ghi",
        attempt_count=1,
        messages=[],
        booking_id="",
    )

    with patch("ava_graph.graph.nodes.confirm_booking.book_jane_appointment") as mock_book:
        mock_book.return_value = "jane_789"

        result = await confirm_booking(state)

        assert result["booking_id"] == "jane_789"
        mock_book.assert_called_once()


@pytest.mark.asyncio
async def test_confirm_booking_writes_to_tm3():
    """Verify confirm_booking routes to TM3 and writes appointment."""
    state = AvaState(
        patient_name="Bob Wilson",
        patient_phone="07703333333",
        requested_service="Assessment",
        preferred_time="Thursday",
        clinic_id="clinic_004",
        pms_type="tm3",
        available_slots=["2026-03-19T11:00:00"],
        confirmed_slot="2026-03-19T11:00:00",
        patient_confirmed=True,
        response_message="Great!",
        session_id="session_jkl",
        attempt_count=1,
        messages=[],
        booking_id="",
    )

    with patch("ava_graph.graph.nodes.confirm_booking.book_tm3_appointment") as mock_book:
        mock_book.return_value = "tm3_012"

        result = await confirm_booking(state)

        assert result["booking_id"] == "tm3_012"
        mock_book.assert_called_once()


@pytest.mark.asyncio
async def test_confirm_booking_handles_unknown_pms_type():
    """Verify confirm_booking handles unknown PMS type gracefully."""
    state = AvaState(
        patient_name="Unknown PMS",
        patient_phone="07704444444",
        requested_service="Physio",
        preferred_time="Friday",
        clinic_id="clinic_005",
        pms_type="unknown_pms",
        available_slots=["2026-03-20T15:00:00"],
        confirmed_slot="2026-03-20T15:00:00",
        patient_confirmed=True,
        response_message="",
        session_id="session_mno",
        attempt_count=1,
        messages=[],
        booking_id="",
    )

    result = await confirm_booking(state)

    assert "error" in result["response_message"].lower()
    assert result["booking_id"] == ""


@pytest.mark.asyncio
async def test_confirm_booking_updates_messages_on_success():
    """Verify confirm_booking adds confirmation message to transcript."""
    state = AvaState(
        patient_name="Carol Davis",
        patient_phone="07705555555",
        requested_service="Physio",
        preferred_time="Monday",
        clinic_id="clinic_001",
        pms_type="writeupp",
        available_slots=["2026-03-16T14:00:00"],
        confirmed_slot="2026-03-16T14:00:00",
        patient_confirmed=True,
        response_message="Booking confirmed!",
        session_id="session_pqr",
        attempt_count=1,
        messages=["PATIENT: Yes, that works"],
        booking_id="",
    )

    with patch("ava_graph.graph.nodes.confirm_booking.book_writeupp_appointment") as mock_book:
        mock_book.return_value = "booking_success"

        result = await confirm_booking(state)

        assert len(result["messages"]) > len(state["messages"])
        assert any("booking" in msg.lower() or "confirmed" in msg.lower() for msg in result["messages"])


@pytest.mark.asyncio
async def test_confirm_booking_handles_booking_api_error():
    """Verify confirm_booking handles PMS API errors gracefully."""
    state = AvaState(
        patient_name="Eve Evans",
        patient_phone="07706666666",
        requested_service="Physio",
        preferred_time="Tuesday",
        clinic_id="clinic_001",
        pms_type="writeupp",
        available_slots=["2026-03-16T14:00:00"],
        confirmed_slot="2026-03-16T14:00:00",
        patient_confirmed=True,
        response_message="",
        session_id="session_stu",
        attempt_count=1,
        messages=[],
        booking_id="",
    )

    with patch("ava_graph.graph.nodes.confirm_booking.book_writeupp_appointment") as mock_book:
        mock_book.side_effect = Exception("API Error: WriteUpp is down")

        result = await confirm_booking(state)

        assert "error" in result["response_message"].lower()
        assert result["booking_id"] == ""


@pytest.mark.asyncio
async def test_confirm_booking_surfaces_pms_auth_error_distinctly():
    """A ValueError from the PMS client (e.g. empty api_key) must yield a
    distinct, operator-actionable response_message."""
    state = AvaState(
        patient_name="Frank Foster",
        patient_phone="07707777777",
        requested_service="Physio",
        preferred_time="Tuesday",
        clinic_id="clinic_001",
        pms_type="writeupp",
        api_key="",
        base_url="",
        available_slots=["2026-03-16T14:00:00"],
        confirmed_slot="2026-03-16T14:00:00",
        patient_confirmed=True,
        response_message="",
        session_id="session_vwx",
        attempt_count=1,
        messages=[],
        booking_id="",
    )

    with patch("ava_graph.graph.nodes.confirm_booking.book_writeupp_appointment") as mock_book:
        mock_book.side_effect = ValueError(
            "PMS api_key is empty — clinic integrations_config likely missing or unconfigured"
        )

        result = await confirm_booking(state)

    assert result["booking_id"] == ""
    msg = result["response_message"].lower()
    assert "pms auth" in msg or "integration settings" in msg, (
        f"Expected an auth-specific message, got: {result['response_message']!r}"
    )
