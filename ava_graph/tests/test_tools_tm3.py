"""Tests for TM3 (Blue Zinc IT) availability and booking tools.

TM3 has no public REST API (see ava_graph/tools/tm3.py module docstring).
Both functions therefore raise NotImplementedError. These tests pin that
behaviour so the stub is not silently replaced with a fake implementation
that would 404 mid-call against a real patient.

When Blue Zinc grants partnership access, replace these with real
behavioural tests mirroring test_tools_writeupp.py.
"""

import pytest

from ava_graph.tools.tm3 import (
    _NOT_IMPLEMENTED_MESSAGE,
    book_tm3_appointment,
    get_tm3_availability,
)

FAKE_KEY = "tm3_test_key"


@pytest.mark.asyncio
async def test_get_tm3_availability_raises_not_implemented():
    """TM3 has no public API — availability call must raise NotImplementedError."""
    with pytest.raises(NotImplementedError) as exc_info:
        await get_tm3_availability(
            clinic_id="clinic_001",
            start_date="2026-04-21",
            duration_minutes=60,
            api_key=FAKE_KEY,
        )
    assert "TM3" in str(exc_info.value)
    assert "info@tm3app.com" in str(exc_info.value)


@pytest.mark.asyncio
async def test_get_tm3_availability_raises_with_base_url_override():
    """Passing a custom base_url does not bypass the NotImplemented stub."""
    with pytest.raises(NotImplementedError):
        await get_tm3_availability(
            clinic_id="c1",
            start_date="2026-04-21",
            duration_minutes=60,
            api_key=FAKE_KEY,
            base_url="https://custom.tm3.example.com",
        )


@pytest.mark.asyncio
async def test_book_tm3_appointment_raises_not_implemented():
    """TM3 booking must raise NotImplementedError, not silently fail."""
    with pytest.raises(NotImplementedError) as exc_info:
        await book_tm3_appointment(
            clinic_id="clinic_001",
            patient_name="John Doe",
            patient_phone="07700000000",
            service_type="Physio",
            slot="2026-04-21T14:00:00",
            api_key=FAKE_KEY,
        )
    assert "TM3" in str(exc_info.value)
    assert "info@tm3app.com" in str(exc_info.value)


@pytest.mark.asyncio
async def test_book_tm3_appointment_raises_with_email():
    """Passing patient_email does not bypass the NotImplemented stub."""
    with pytest.raises(NotImplementedError):
        await book_tm3_appointment(
            clinic_id="c1",
            patient_name="Jane Smith",
            patient_phone="07700111111",
            service_type="Physio",
            slot="2026-04-21T15:00:00",
            api_key=FAKE_KEY,
            patient_email="jane@example.com",
        )


def test_not_implemented_message_includes_contact_path():
    """Error message must surface the partnership contact email so on-call
    operators know how to escalate when this fires in production logs."""
    assert "info@tm3app.com" in _NOT_IMPLEMENTED_MESSAGE
    assert "support@blue-zinc.com" in _NOT_IMPLEMENTED_MESSAGE
    assert "partnership" in _NOT_IMPLEMENTED_MESSAGE.lower()
