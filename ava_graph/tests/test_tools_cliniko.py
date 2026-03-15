import pytest
from unittest.mock import AsyncMock, patch
from ava_graph.tools.cliniko import get_cliniko_availability, book_cliniko_appointment


@pytest.mark.asyncio
async def test_get_cliniko_availability_returns_slots():
    """Verify Cliniko availability returns list of datetime strings."""
    with patch("ava_graph.tools.cliniko.get_cliniko_client") as mock_client:
        mock_response = AsyncMock()
        mock_response.json = lambda: {
            "available_appointments": [
                {
                    "start_at": "2026-03-16T14:00:00Z",
                    "end_at": "2026-03-16T15:00:00Z",
                }
            ]
        }
        mock_response.raise_for_status = lambda: None
        mock_client.return_value.get = AsyncMock(return_value=mock_response)

        slots = await get_cliniko_availability(
            clinic_id="clinic_001", start_date="2026-03-16", duration_minutes=60
        )

        assert isinstance(slots, list)
        assert len(slots) > 0
        assert "2026-03-16" in slots[0]


@pytest.mark.asyncio
async def test_book_cliniko_appointment_returns_booking_id():
    """Verify Cliniko booking creates appointment and returns ID."""
    with patch("ava_graph.tools.cliniko.get_cliniko_client") as mock_client:
        mock_response = AsyncMock()
        mock_response.json = lambda: {"id": "apt_12345"}
        mock_response.raise_for_status = lambda: None
        mock_client.return_value.post = AsyncMock(return_value=mock_response)

        booking_id = await book_cliniko_appointment(
            clinic_id="clinic_001",
            patient_name="John Doe",
            patient_phone="07700000000",
            service_type="Physiotherapy Assessment",
            slot="2026-03-16T14:00:00Z",
        )

        assert booking_id == "apt_12345"
