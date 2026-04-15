"""Tests for FastMCP server tool functions (pms_check_availability, pms_book_appointment, sms_send_confirmation)."""

import pytest
from unittest.mock import patch, AsyncMock

from ava_graph.mcp_server import (
    pms_check_availability,
    pms_book_appointment,
    sms_send_confirmation,
)


# ─── pms_check_availability ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_check_availability_routes_to_writeupp():
    """Verify check_availability dispatches to WriteUpp and returns slots + result."""
    with patch("ava_graph.mcp_server.get_writeupp_availability", new_callable=AsyncMock) as mock:
        mock.return_value = ["2026-04-21T14:00:00", "2026-04-21T15:00:00"]
        result = await pms_check_availability(
            clinic_id="clinic_001",
            pms_type="writeupp",
            api_key="wukey",
            start_date="2026-04-21",
        )

    assert result["slots"] == ["2026-04-21T14:00:00", "2026-04-21T15:00:00"]
    assert "Available" in result["result"]
    mock.assert_called_once()


@pytest.mark.asyncio
async def test_check_availability_routes_to_cliniko():
    """Verify check_availability dispatches to Cliniko."""
    with patch("ava_graph.mcp_server.get_cliniko_availability", new_callable=AsyncMock) as mock:
        mock.return_value = ["2026-04-21T10:00:00"]
        result = await pms_check_availability(
            clinic_id="clinic_002",
            pms_type="cliniko",
            api_key="clkey",
            start_date="2026-04-21",
        )

    assert result["slots"] == ["2026-04-21T10:00:00"]
    mock.assert_called_once()


@pytest.mark.asyncio
async def test_check_availability_routes_to_jane():
    """Verify check_availability dispatches to Jane App."""
    with patch("ava_graph.mcp_server.get_jane_availability", new_callable=AsyncMock) as mock:
        mock.return_value = ["2026-04-22T09:00:00"]
        result = await pms_check_availability(
            clinic_id="clinic_003",
            pms_type="jane",
            api_key="janekey",
            start_date="2026-04-22",
        )

    assert result["slots"] == ["2026-04-22T09:00:00"]
    mock.assert_called_once()


@pytest.mark.asyncio
async def test_check_availability_routes_to_tm3():
    """Verify check_availability dispatches to TM3."""
    with patch("ava_graph.mcp_server.get_tm3_availability", new_callable=AsyncMock) as mock:
        mock.return_value = ["2026-04-23T11:00:00"]
        result = await pms_check_availability(
            clinic_id="clinic_004",
            pms_type="tm3",
            api_key="tm3key",
            start_date="2026-04-23",
        )

    assert result["slots"] == ["2026-04-23T11:00:00"]
    mock.assert_called_once()


@pytest.mark.asyncio
async def test_check_availability_empty_returns_no_slots_message():
    """Empty slot list returns 'No available slots' result string."""
    with patch("ava_graph.mcp_server.get_cliniko_availability", new_callable=AsyncMock) as mock:
        mock.return_value = []
        result = await pms_check_availability(
            clinic_id="c1",
            pms_type="cliniko",
            api_key="k",
            start_date="2026-04-21",
        )

    assert result["slots"] == []
    assert "No available" in result["result"]


@pytest.mark.asyncio
async def test_check_availability_unknown_pms_raises_value_error():
    """Unknown pms_type raises ValueError immediately."""
    with pytest.raises(ValueError, match="Unknown pms_type"):
        await pms_check_availability(
            clinic_id="c1",
            pms_type="mystery_pms",
            api_key="k",
            start_date="2026-04-21",
        )


@pytest.mark.asyncio
async def test_check_availability_passes_api_key_to_writeupp():
    """api_key is forwarded to the underlying WriteUpp tool."""
    captured = {}

    async def fake_avail(**kwargs):
        captured.update(kwargs)
        return []

    with patch("ava_graph.mcp_server.get_writeupp_availability", side_effect=fake_avail):
        await pms_check_availability(
            clinic_id="c1",
            pms_type="writeupp",
            api_key="secret_key",
            start_date="2026-04-21",
            base_url="https://custom.example",
        )

    assert captured["api_key"] == "secret_key"
    assert captured["base_url"] == "https://custom.example"


# ─── pms_book_appointment ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_book_appointment_routes_to_writeupp():
    """Verify book_appointment dispatches to WriteUpp and returns booking_id."""
    with patch("ava_graph.mcp_server.book_writeupp_appointment", new_callable=AsyncMock) as mock:
        mock.return_value = "wu_12345"
        result = await pms_book_appointment(
            clinic_id="clinic_001",
            pms_type="writeupp",
            api_key="wukey",
            patient_name="John Doe",
            patient_phone="+447700000000",
            service_type="Physio",
            slot="2026-04-21T14:00:00",
        )

    assert result["booking_id"] == "wu_12345"
    assert "John Doe" in result["result"]
    assert "wu_12345" in result["result"]


@pytest.mark.asyncio
async def test_book_appointment_routes_to_cliniko():
    """Verify book_appointment dispatches to Cliniko."""
    with patch("ava_graph.mcp_server.book_cliniko_appointment", new_callable=AsyncMock) as mock:
        mock.return_value = "cl_67890"
        result = await pms_book_appointment(
            clinic_id="clinic_002",
            pms_type="cliniko",
            api_key="clkey",
            patient_name="Jane Smith",
            patient_phone="+447700000001",
            service_type="Assessment",
            slot="2026-04-21T15:00:00",
        )

    assert result["booking_id"] == "cl_67890"
    mock.assert_called_once()


@pytest.mark.asyncio
async def test_book_appointment_routes_to_jane():
    """Verify book_appointment dispatches to Jane App."""
    with patch("ava_graph.mcp_server.book_jane_appointment", new_callable=AsyncMock) as mock:
        mock.return_value = "jane_111"
        result = await pms_book_appointment(
            clinic_id="clinic_003",
            pms_type="jane",
            api_key="janekey",
            patient_name="Alice Brown",
            patient_phone="+447700000002",
            service_type="Massage",
            slot="2026-04-22T09:00:00",
        )

    assert result["booking_id"] == "jane_111"


@pytest.mark.asyncio
async def test_book_appointment_routes_to_tm3_with_email():
    """TM3 booking accepts optional patient_email and forwards it."""
    with patch("ava_graph.mcp_server.book_tm3_appointment", new_callable=AsyncMock) as mock:
        mock.return_value = "tm3_999"
        result = await pms_book_appointment(
            clinic_id="clinic_004",
            pms_type="tm3",
            api_key="tm3key",
            patient_name="Bob Wilson",
            patient_phone="+447700000003",
            service_type="Physio",
            slot="2026-04-23T11:00:00",
            patient_email="bob@example.com",
        )

    assert result["booking_id"] == "tm3_999"
    call_kwargs = mock.call_args[1]
    assert call_kwargs["patient_email"] == "bob@example.com"


@pytest.mark.asyncio
async def test_book_appointment_result_contains_slot_in_readable_format():
    """Result string must include the readable slot time."""
    with patch("ava_graph.mcp_server.book_cliniko_appointment", new_callable=AsyncMock) as mock:
        mock.return_value = "cl_abc"
        result = await pms_book_appointment(
            clinic_id="c1",
            pms_type="cliniko",
            api_key="k",
            patient_name="Test Patient",
            patient_phone="+447700000004",
            service_type="Physio",
            slot="2026-04-21T14:00:00",
        )

    # Slot is Monday 21 Apr 2026 at 2pm — result should be human-readable
    assert "Monday" in result["result"] or "21" in result["result"] or "2:00" in result["result"]


@pytest.mark.asyncio
async def test_book_appointment_unknown_pms_raises_value_error():
    """Unknown pms_type raises ValueError immediately."""
    with pytest.raises(ValueError, match="Unknown pms_type"):
        await pms_book_appointment(
            clinic_id="c1",
            pms_type="unknown_pms",
            api_key="k",
            patient_name="Test",
            patient_phone="+44700",
            service_type="Physio",
            slot="2026-04-21T10:00:00",
        )


# ─── sms_send_confirmation ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_sms_send_confirmation_returns_sid():
    """Verify sms_send_confirmation returns SID and readable result."""
    with patch("ava_graph.mcp_server.send_booking_confirmation_sms", new_callable=AsyncMock) as mock:
        mock.return_value = "SM_TESTID"
        result = await sms_send_confirmation(
            patient_phone="+447700000000",
            patient_name="John Doe",
            booking_slot="Monday 21 Apr at 2:00 PM",
            clinic_name="Spires Physiotherapy",
        )

    assert result["sms_sid"] == "SM_TESTID"
    assert "SM_TESTID" in result["result"]
    assert "+447700000000" in result["result"]


@pytest.mark.asyncio
async def test_sms_send_confirmation_forwards_per_call_credentials():
    """Per-call account_sid and auth_token are forwarded to the SMS tool."""
    with patch("ava_graph.mcp_server.send_booking_confirmation_sms", new_callable=AsyncMock) as mock:
        mock.return_value = "SM_CUSTOM"
        await sms_send_confirmation(
            patient_phone="+447700000001",
            patient_name="Jane Smith",
            booking_slot="Tuesday 22 Apr at 3:00 PM",
            clinic_name="Test Clinic",
            account_sid="ACtest",
            auth_token="tok123",
        )

    mock.assert_called_once_with(
        patient_phone="+447700000001",
        patient_name="Jane Smith",
        booking_slot="Tuesday 22 Apr at 3:00 PM",
        clinic_name="Test Clinic",
        account_sid="ACtest",
        auth_token="tok123",
    )


@pytest.mark.asyncio
async def test_sms_send_confirmation_no_credentials_uses_env_vars():
    """Without per-call credentials, None is passed (tool falls back to env vars)."""
    with patch("ava_graph.mcp_server.send_booking_confirmation_sms", new_callable=AsyncMock) as mock:
        mock.return_value = "SM_ENV"
        await sms_send_confirmation(
            patient_phone="+447700000002",
            patient_name="Bob Brown",
            booking_slot="Wednesday 23 Apr at 10:00 AM",
            clinic_name="Spires Physiotherapy",
        )

    call_kwargs = mock.call_args[1]
    assert call_kwargs["account_sid"] is None
    assert call_kwargs["auth_token"] is None
