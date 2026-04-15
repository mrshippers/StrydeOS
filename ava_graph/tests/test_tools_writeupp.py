"""Tests for WriteUpp availability and booking tools (multi-tenant API)."""

import pytest
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

from ava_graph.tools.writeupp import (
    get_writeupp_availability,
    book_writeupp_appointment,
    _compute_free_slots,
)

FAKE_API_KEY = "test_key_abc"
FAKE_BASE_URL = "https://test.writeupp.example"


# ─── _compute_free_slots unit tests ──────────────────────────────────────────

def test_compute_free_slots_returns_slots_within_clinic_hours():
    """Free slots should fall between 09:00 and 17:00 Mon-Fri."""
    from_dt = datetime(2026, 4, 21, 0, 0)  # Monday
    to_dt = from_dt + timedelta(days=1)
    slots = _compute_free_slots([], from_dt, to_dt, 60)
    assert len(slots) > 0
    for s in slots:
        dt = datetime.fromisoformat(s)
        assert 9 <= dt.hour < 17
        assert dt.weekday() < 5


def test_compute_free_slots_excludes_booked():
    """Booked slots must not appear in the output."""
    from_dt = datetime(2026, 4, 21, 0, 0)  # Monday
    to_dt = from_dt + timedelta(days=1)
    booked = ["2026-04-21T09:00:00", "2026-04-21T10:00:00"]
    slots = _compute_free_slots(booked, from_dt, to_dt, 60)
    keys = [s[:16] for s in slots]
    assert "2026-04-21T09:00" not in keys
    assert "2026-04-21T10:00" not in keys


def test_compute_free_slots_skips_weekends():
    """No slots should be generated for Saturday or Sunday."""
    from_dt = datetime(2026, 4, 25, 0, 0)  # Saturday
    to_dt = from_dt + timedelta(days=2)
    slots = _compute_free_slots([], from_dt, to_dt, 60)
    assert len(slots) == 0


def test_compute_free_slots_respects_duration():
    """30-min slots should produce at least as many results as 60-min slots."""
    from_dt = datetime(2026, 4, 21, 0, 0)  # Monday
    to_dt = from_dt + timedelta(days=1)
    slots_60 = _compute_free_slots([], from_dt, to_dt, 60)
    slots_30 = _compute_free_slots([], from_dt, to_dt, 30)
    assert len(slots_30) >= len(slots_60)


# ─── get_writeupp_availability integration tests ─────────────────────────────

@pytest.mark.asyncio
async def test_get_writeupp_availability_returns_free_slots():
    """Verify availability returns a list of free ISO datetime strings."""
    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.json = MagicMock(return_value={"appointments": []})

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.get = AsyncMock(return_value=mock_response)

    with patch("ava_graph.tools.writeupp._make_client", return_value=mock_client):
        slots = await get_writeupp_availability(
            clinic_id="clinic_001",
            start_date="2026-04-21",
            duration_minutes=60,
            api_key=FAKE_API_KEY,
            base_url=FAKE_BASE_URL,
            days_ahead=1,
        )

    assert isinstance(slots, list)
    assert len(slots) > 0
    for s in slots:
        datetime.fromisoformat(s)


@pytest.mark.asyncio
async def test_get_writeupp_availability_excludes_booked():
    """Booked appointments from API must not appear as free slots."""
    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.json = MagicMock(return_value={
        "appointments": [
            {"start_time": "2026-04-21T09:00:00"},
            {"start_time": "2026-04-21T10:00:00"},
        ]
    })

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.get = AsyncMock(return_value=mock_response)

    with patch("ava_graph.tools.writeupp._make_client", return_value=mock_client):
        slots = await get_writeupp_availability(
            clinic_id="clinic_001",
            start_date="2026-04-21",
            duration_minutes=60,
            api_key=FAKE_API_KEY,
            base_url=FAKE_BASE_URL,
            days_ahead=1,
        )

    keys = [s[:16] for s in slots]
    assert "2026-04-21T09:00" not in keys
    assert "2026-04-21T10:00" not in keys


@pytest.mark.asyncio
async def test_get_writeupp_availability_passes_api_key():
    """api_key must be forwarded to _make_client."""
    captured = {}

    def fake_make_client(api_key, base_url):
        captured["key"] = api_key
        mc = AsyncMock()
        mc.__aenter__ = AsyncMock(return_value=mc)
        mc.__aexit__ = AsyncMock(return_value=False)
        resp = MagicMock()
        resp.raise_for_status = MagicMock()
        resp.json = MagicMock(return_value={"appointments": []})
        mc.get = AsyncMock(return_value=resp)
        return mc

    with patch("ava_graph.tools.writeupp._make_client", side_effect=fake_make_client):
        await get_writeupp_availability(
            clinic_id="c1",
            start_date="2026-04-21",
            duration_minutes=60,
            api_key=FAKE_API_KEY,
            days_ahead=1,
        )

    assert captured["key"] == FAKE_API_KEY


# ─── book_writeupp_appointment tests ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_book_writeupp_appointment_returns_booking_id():
    """Verify booking returns the appointment ID from WriteUpp."""
    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.json = MagicMock(return_value={"id": "write_12345"})

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = AsyncMock(return_value=mock_response)

    with patch("ava_graph.tools.writeupp._make_client", return_value=mock_client):
        booking_id = await book_writeupp_appointment(
            clinic_id="clinic_001",
            patient_name="John Doe",
            patient_phone="07700000000",
            service_type="Physio",
            slot="2026-04-21T14:00:00",
            api_key=FAKE_API_KEY,
            base_url=FAKE_BASE_URL,
        )

    assert booking_id == "write_12345"


@pytest.mark.asyncio
async def test_book_writeupp_appointment_handles_appointmentId_key():
    """Verify booking handles 'appointmentId' key variant."""
    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.json = MagicMock(return_value={"appointmentId": "wu_99"})

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = AsyncMock(return_value=mock_response)

    with patch("ava_graph.tools.writeupp._make_client", return_value=mock_client):
        booking_id = await book_writeupp_appointment(
            clinic_id="c1",
            patient_name="Jane Smith",
            patient_phone="+447700000001",
            service_type="Assessment",
            slot="2026-04-21T09:00:00",
            api_key=FAKE_API_KEY,
        )

    assert booking_id == "wu_99"
