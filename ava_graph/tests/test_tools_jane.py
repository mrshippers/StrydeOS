"""Tests for Jane App availability and booking tools.

Jane App has no public per-clinic API — access is gated behind an
approval-only Jane Developer Platform partnership using OAuth 2.0 PKCE.
Until StrydeOS is an approved Jane partner, both tool functions must
raise NotImplementedError so calls fail loudly rather than silently
hitting a fabricated endpoint.

See ava_graph/tools/jane.py module docstring for references.
"""

import pytest
from ava_graph.tools.jane import get_jane_availability, book_jane_appointment

FAKE_KEY = "jane_test_key"


@pytest.mark.asyncio
async def test_get_jane_availability_raises_not_implemented():
    """Availability check must raise NotImplementedError until Jane partnership lands."""
    with pytest.raises(NotImplementedError) as exc:
        await get_jane_availability(
            clinic_id="clinic_001",
            start_date="2026-04-21",
            duration_minutes=60,
            api_key=FAKE_KEY,
        )
    msg = str(exc.value)
    assert "Jane" in msg
    assert "partner" in msg.lower()


@pytest.mark.asyncio
async def test_get_jane_availability_raises_without_api_key():
    """No API key path either — same NotImplementedError, no silent fallback."""
    with pytest.raises(NotImplementedError):
        await get_jane_availability(
            clinic_id="c1",
            start_date="2026-04-21",
            duration_minutes=60,
        )


@pytest.mark.asyncio
async def test_book_jane_appointment_raises_not_implemented():
    """Booking must raise NotImplementedError until Jane partnership lands."""
    with pytest.raises(NotImplementedError) as exc:
        await book_jane_appointment(
            clinic_id="clinic_001",
            patient_name="John Doe",
            patient_phone="07700000000",
            service_type="Physio",
            slot="2026-04-21T14:00:00",
            api_key=FAKE_KEY,
        )
    msg = str(exc.value)
    assert "Jane" in msg
    assert "partner" in msg.lower()


@pytest.mark.asyncio
async def test_book_jane_appointment_raises_without_api_key():
    """No API key path either — same NotImplementedError, no silent fallback."""
    with pytest.raises(NotImplementedError):
        await book_jane_appointment(
            clinic_id="c1",
            patient_name="Jane Smith",
            patient_phone="07700111111",
            service_type="Physio",
            slot="2026-04-21T15:00:00",
        )
