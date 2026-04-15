"""Tests for Jane App availability and booking tools (multi-tenant API)."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from ava_graph.tools.jane import get_jane_availability, book_jane_appointment

FAKE_KEY = "jane_test_key"


def _mock_client_ctx(response):
    mc = AsyncMock()
    mc.__aenter__ = AsyncMock(return_value=mc)
    mc.__aexit__ = AsyncMock(return_value=False)
    mc.get = AsyncMock(return_value=response)
    mc.post = AsyncMock(return_value=response)
    return mc


@pytest.mark.asyncio
async def test_get_jane_availability_returns_slots():
    """Verify Jane availability returns list of datetime strings."""
    resp = MagicMock()
    resp.raise_for_status = MagicMock()
    resp.json = MagicMock(return_value={
        "data": [{"start_time": "2026-04-21T14:00:00"}]
    })
    mc = _mock_client_ctx(resp)

    with patch("ava_graph.tools.jane._make_client", return_value=mc):
        slots = await get_jane_availability(
            clinic_id="clinic_001",
            start_date="2026-04-21",
            duration_minutes=60,
            api_key=FAKE_KEY,
        )

    assert isinstance(slots, list)
    assert "2026-04-21T14:00:00" in slots


@pytest.mark.asyncio
async def test_get_jane_availability_empty():
    """Empty data returns empty list."""
    resp = MagicMock()
    resp.raise_for_status = MagicMock()
    resp.json = MagicMock(return_value={"data": []})
    mc = _mock_client_ctx(resp)

    with patch("ava_graph.tools.jane._make_client", return_value=mc):
        slots = await get_jane_availability(
            clinic_id="c1", start_date="2026-04-21", duration_minutes=60, api_key=FAKE_KEY
        )

    assert slots == []


@pytest.mark.asyncio
async def test_book_jane_appointment_returns_booking_id():
    """Verify Jane booking creates appointment and returns ID."""
    resp = MagicMock()
    resp.raise_for_status = MagicMock()
    resp.json = MagicMock(return_value={"id": "jane_12345"})
    mc = _mock_client_ctx(resp)

    with patch("ava_graph.tools.jane._make_client", return_value=mc):
        booking_id = await book_jane_appointment(
            clinic_id="clinic_001",
            patient_name="John Doe",
            patient_phone="07700000000",
            service_type="Physio",
            slot="2026-04-21T14:00:00",
            api_key=FAKE_KEY,
        )

    assert booking_id == "jane_12345"
