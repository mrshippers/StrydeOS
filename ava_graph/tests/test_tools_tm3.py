"""Tests for TM3 (Blue Zinc) availability and booking tools (multi-tenant API)."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from ava_graph.tools.tm3 import get_tm3_availability, book_tm3_appointment

FAKE_KEY = "tm3_test_key"


def _mock_client_ctx(response):
    mc = AsyncMock()
    mc.__aenter__ = AsyncMock(return_value=mc)
    mc.__aexit__ = AsyncMock(return_value=False)
    mc.get = AsyncMock(return_value=response)
    mc.post = AsyncMock(return_value=response)
    return mc


@pytest.mark.asyncio
async def test_get_tm3_availability_returns_only_available_slots():
    """TM3 should only return slots where available=True."""
    resp = MagicMock()
    resp.raise_for_status = MagicMock()
    resp.json = MagicMock(return_value={
        "slots": [
            {"dateTime": "2026-04-21T14:00:00", "available": True},
            {"dateTime": "2026-04-21T15:00:00", "available": True},
            {"dateTime": "2026-04-21T16:00:00", "available": False},
        ]
    })
    mc = _mock_client_ctx(resp)

    with patch("ava_graph.tools.tm3._make_client", return_value=mc):
        slots = await get_tm3_availability(
            clinic_id="clinic_001",
            start_date="2026-04-21",
            duration_minutes=60,
            api_key=FAKE_KEY,
        )

    assert len(slots) == 2
    assert "2026-04-21T14:00:00" in slots
    assert "2026-04-21T15:00:00" in slots
    assert "2026-04-21T16:00:00" not in slots


@pytest.mark.asyncio
async def test_get_tm3_availability_empty():
    """Empty slots returns empty list."""
    resp = MagicMock()
    resp.raise_for_status = MagicMock()
    resp.json = MagicMock(return_value={"slots": []})
    mc = _mock_client_ctx(resp)

    with patch("ava_graph.tools.tm3._make_client", return_value=mc):
        slots = await get_tm3_availability(
            clinic_id="c1", start_date="2026-04-21", duration_minutes=60, api_key=FAKE_KEY
        )

    assert slots == []


@pytest.mark.asyncio
async def test_book_tm3_appointment_returns_booking_id():
    """Verify TM3 booking creates appointment and returns ID."""
    resp = MagicMock()
    resp.raise_for_status = MagicMock()
    resp.json = MagicMock(return_value={"appointmentId": "tm3_12345"})
    mc = _mock_client_ctx(resp)

    with patch("ava_graph.tools.tm3._make_client", return_value=mc):
        booking_id = await book_tm3_appointment(
            clinic_id="clinic_001",
            patient_name="John Doe",
            patient_phone="07700000000",
            service_type="Physio",
            slot="2026-04-21T14:00:00",
            api_key=FAKE_KEY,
        )

    assert booking_id == "tm3_12345"


@pytest.mark.asyncio
async def test_book_tm3_appointment_with_email():
    """Verify TM3 booking can include patient email."""
    resp = MagicMock()
    resp.raise_for_status = MagicMock()
    resp.json = MagicMock(return_value={"appointmentId": "tm3_67890"})
    mc = _mock_client_ctx(resp)

    with patch("ava_graph.tools.tm3._make_client", return_value=mc):
        booking_id = await book_tm3_appointment(
            clinic_id="c1",
            patient_name="Jane Smith",
            patient_phone="07700111111",
            service_type="Physio",
            slot="2026-04-21T15:00:00",
            api_key=FAKE_KEY,
            patient_email="jane@example.com",
        )

    assert booking_id == "tm3_67890"
