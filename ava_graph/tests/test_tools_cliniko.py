"""Tests for Cliniko availability and booking tools (multi-tenant API)."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from ava_graph.tools.cliniko import get_cliniko_availability, book_cliniko_appointment

FAKE_KEY = "cliniko_test_key"


def _mock_client_ctx(response):
    """Helper: build an async context manager mock returning response."""
    mc = AsyncMock()
    mc.__aenter__ = AsyncMock(return_value=mc)
    mc.__aexit__ = AsyncMock(return_value=False)
    mc.get = AsyncMock(return_value=response)
    mc.post = AsyncMock(return_value=response)
    return mc


@pytest.mark.asyncio
async def test_get_cliniko_availability_returns_slots():
    """Verify Cliniko availability returns list of datetime strings."""
    resp = MagicMock()
    resp.raise_for_status = MagicMock()
    resp.json = MagicMock(return_value={
        "available_appointments": [{"start_at": "2026-04-21T14:00:00Z"}]
    })
    mc = _mock_client_ctx(resp)

    with patch("ava_graph.tools.cliniko._make_client", return_value=mc):
        slots = await get_cliniko_availability(
            clinic_id="clinic_001",
            start_date="2026-04-21",
            duration_minutes=60,
            api_key=FAKE_KEY,
        )

    assert isinstance(slots, list)
    assert len(slots) > 0
    assert "2026-04-21" in slots[0]


@pytest.mark.asyncio
async def test_get_cliniko_availability_empty():
    """Empty available_appointments returns empty list."""
    resp = MagicMock()
    resp.raise_for_status = MagicMock()
    resp.json = MagicMock(return_value={"available_appointments": []})
    mc = _mock_client_ctx(resp)

    with patch("ava_graph.tools.cliniko._make_client", return_value=mc):
        slots = await get_cliniko_availability(
            clinic_id="c1", start_date="2026-04-21", duration_minutes=60, api_key=FAKE_KEY
        )

    assert slots == []


@pytest.mark.asyncio
async def test_book_cliniko_appointment_returns_booking_id():
    """Verify Cliniko booking creates appointment and returns ID."""
    resp = MagicMock()
    resp.raise_for_status = MagicMock()
    resp.json = MagicMock(return_value={"id": "apt_12345"})
    mc = _mock_client_ctx(resp)

    with patch("ava_graph.tools.cliniko._make_client", return_value=mc):
        booking_id = await book_cliniko_appointment(
            clinic_id="clinic_001",
            patient_name="John Doe",
            patient_phone="07700000000",
            service_type="Physiotherapy Assessment",
            slot="2026-04-21T14:00:00Z",
            api_key=FAKE_KEY,
        )

    assert booking_id == "apt_12345"
