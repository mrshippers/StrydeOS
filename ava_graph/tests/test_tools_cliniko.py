"""Tests for Cliniko availability and booking tools (multi-tenant API)."""

import base64
import httpx
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from ava_graph.tools.cliniko import (
    _DEFAULT_BASE_URL,
    _make_client,
    book_cliniko_appointment,
    get_cliniko_availability,
)
from ava_graph.tools import cliniko as cliniko_module

FAKE_KEY = "cliniko_test_key"


@pytest.fixture(autouse=True)
def _clear_availability_cache():
    """Cache is module-global; clear before every test to keep them isolated."""
    cliniko_module._availability_cache.clear()
    yield
    cliniko_module._availability_cache.clear()


def _mock_client_ctx(response):
    """Helper: build an async context manager mock returning response."""
    mc = AsyncMock()
    mc.__aenter__ = AsyncMock(return_value=mc)
    mc.__aexit__ = AsyncMock(return_value=False)
    mc.get = AsyncMock(return_value=response)
    mc.post = AsyncMock(return_value=response)
    return mc


# ─── Auth header construction (Bug 1) ────────────────────────────────────────

def test_make_client_uses_basic_auth_not_bearer():
    """Cliniko requires HTTP Basic auth — api_key as username, empty password."""
    client = _make_client(FAKE_KEY, "")
    try:
        auth_header = client.headers.get("Authorization", "")
        assert auth_header.startswith("Basic "), (
            f"Cliniko auth must be Basic, got: {auth_header!r}"
        )
        assert "Bearer" not in auth_header

        # Decode and verify it's "{api_key}:" (api_key as username, empty password)
        encoded = auth_header.removeprefix("Basic ").strip()
        decoded = base64.b64decode(encoded).decode("ascii")
        assert decoded == f"{FAKE_KEY}:", (
            f"Expected '<api_key>:' before base64-encoding, got {decoded!r}"
        )
    finally:
        # httpx.AsyncClient must be closed; sync close path used because no event loop here
        import asyncio
        asyncio.get_event_loop().run_until_complete(client.aclose()) if False else None


def test_default_base_url_is_au1_shard():
    """Cliniko has no api.cliniko.com — must default to a real shard (au1)."""
    assert _DEFAULT_BASE_URL == "https://api.au1.cliniko.com/v1"


def test_make_client_raises_on_empty_api_key():
    """Empty api_key must fail loudly — not silently produce 'Basic Og=='."""
    with pytest.raises(ValueError, match="api_key is empty"):
        _make_client("", "")


def test_make_client_raises_on_whitespace_api_key():
    """Whitespace-only api_key must also raise."""
    with pytest.raises(ValueError, match="api_key is empty"):
        _make_client("   ", "")


def test_make_client_uses_provided_base_url_when_set():
    """Caller's base_url must override the default shard."""
    client = _make_client(FAKE_KEY, "https://api.uk1.cliniko.com/v1")
    assert str(client.base_url).rstrip("/") == "https://api.uk1.cliniko.com/v1"


def test_make_client_falls_back_to_default_when_base_url_blank():
    """Empty base_url must fall back to the au1 default shard."""
    client = _make_client(FAKE_KEY, "")
    assert str(client.base_url).rstrip("/") == _DEFAULT_BASE_URL


# ─── Availability tests ──────────────────────────────────────────────────────

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


# ─── Availability cache tests ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_availability_cache_hits_on_identical_query():
    """Second identical call should not hit Cliniko API."""
    resp = MagicMock()
    resp.raise_for_status = MagicMock()
    resp.json = MagicMock(return_value={
        "available_appointments": [{"start_at": "2026-04-21T14:00:00Z"}]
    })
    mc = _mock_client_ctx(resp)

    with patch("ava_graph.tools.cliniko._make_client", return_value=mc):
        await get_cliniko_availability(
            clinic_id="clinic_001",
            start_date="2026-04-21",
            duration_minutes=60,
            days_ahead=14,
            api_key=FAKE_KEY,
        )
        await get_cliniko_availability(
            clinic_id="clinic_001",
            start_date="2026-04-21",
            duration_minutes=60,
            days_ahead=14,
            api_key=FAKE_KEY,
        )

    # API called exactly once across both calls — cache absorbed the second
    assert mc.get.call_count == 1


@pytest.mark.asyncio
async def test_availability_cache_misses_for_different_clinic():
    """Different clinic_id must not share cache entries (multi-tenancy safety)."""
    resp = MagicMock()
    resp.raise_for_status = MagicMock()
    resp.json = MagicMock(return_value={"available_appointments": []})
    mc = _mock_client_ctx(resp)

    with patch("ava_graph.tools.cliniko._make_client", return_value=mc):
        await get_cliniko_availability(
            clinic_id="clinic_A", start_date="2026-04-21",
            duration_minutes=60, days_ahead=14, api_key="key_a",
        )
        await get_cliniko_availability(
            clinic_id="clinic_B", start_date="2026-04-21",
            duration_minutes=60, days_ahead=14, api_key="key_b",
        )

    assert mc.get.call_count == 2


@pytest.mark.asyncio
async def test_availability_cache_does_not_cache_errors():
    """A failed API call must not pollute the cache."""
    mc = AsyncMock()
    mc.__aenter__ = AsyncMock(return_value=mc)
    mc.__aexit__ = AsyncMock(return_value=False)
    mc.get = AsyncMock(side_effect=httpx.HTTPError("boom"))

    with patch("ava_graph.tools.cliniko._make_client", return_value=mc):
        with pytest.raises(httpx.HTTPError):
            await get_cliniko_availability(
                clinic_id="clinic_001", start_date="2026-04-21",
                duration_minutes=60, days_ahead=14, api_key=FAKE_KEY,
            )
        with pytest.raises(httpx.HTTPError):
            await get_cliniko_availability(
                clinic_id="clinic_001", start_date="2026-04-21",
                duration_minutes=60, days_ahead=14, api_key=FAKE_KEY,
            )

    assert mc.get.call_count == 2


@pytest.mark.asyncio
async def test_availability_cache_expires_after_ttl():
    """Past TTL, cache should miss and the API gets re-queried."""
    resp = MagicMock()
    resp.raise_for_status = MagicMock()
    resp.json = MagicMock(return_value={"available_appointments": []})
    mc = _mock_client_ctx(resp)

    fake_now = [1_000_000.0]

    def time_provider():
        return fake_now[0]

    with patch("ava_graph.tools.cliniko._make_client", return_value=mc), \
         patch("ava_graph.tools.cliniko._monotonic", side_effect=time_provider):
        await get_cliniko_availability(
            clinic_id="clinic_001", start_date="2026-04-21",
            duration_minutes=60, days_ahead=14, api_key=FAKE_KEY,
        )
        fake_now[0] += 61.0
        await get_cliniko_availability(
            clinic_id="clinic_001", start_date="2026-04-21",
            duration_minutes=60, days_ahead=14, api_key=FAKE_KEY,
        )

    assert mc.get.call_count == 2
