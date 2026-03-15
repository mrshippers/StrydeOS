"""Tests for WriteUpp availability and booking tools."""

import pytest
from unittest.mock import AsyncMock, Mock, patch
from ava_graph.tools.writeupp import get_writeupp_availability, book_writeupp_appointment


@pytest.mark.asyncio
async def test_get_writeupp_availability_returns_slots():
    """Verify WriteUpp availability returns list of datetime strings."""
    with patch("ava_graph.tools.writeupp.get_writeupp_client") as mock_client_factory:
        mock_response = Mock()
        mock_response.json = Mock(return_value={
            "availableSlots": [
                {"startTime": "2026-03-16T14:00:00", "endTime": "2026-03-16T15:00:00"}
            ]
        })
        mock_response.raise_for_status = Mock()

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client_factory.return_value = mock_client

        slots = await get_writeupp_availability(
            clinic_id="clinic_001",
            start_date="2026-03-16",
            duration_minutes=60
        )

        assert isinstance(slots, list)
        assert len(slots) > 0


@pytest.mark.asyncio
async def test_book_writeupp_appointment_returns_booking_id():
    """Verify WriteUpp booking creates appointment and returns ID."""
    with patch("ava_graph.tools.writeupp.get_writeupp_client") as mock_client_factory:
        mock_response = Mock()
        mock_response.json = Mock(return_value={"appointmentId": "write_12345"})
        mock_response.raise_for_status = Mock()

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client_factory.return_value = mock_client

        booking_id = await book_writeupp_appointment(
            clinic_id="clinic_001",
            patient_name="John Doe",
            patient_phone="07700000000",
            service_type="Physio",
            slot="2026-03-16T14:00:00"
        )

        assert booking_id == "write_12345"
