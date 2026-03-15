"""Tests for Jane App availability and booking tools."""

import pytest
from unittest.mock import AsyncMock, patch
from ava_graph.tools.jane import get_jane_availability, book_jane_appointment


@pytest.mark.asyncio
async def test_get_jane_availability_returns_slots():
    """Verify Jane availability returns list of datetime strings."""
    with patch("ava_graph.tools.jane.get_jane_client") as mock_client:
        mock_response = AsyncMock()
        mock_response.json = AsyncMock(return_value={
            "data": [
                {"start_time": "2026-03-16T14:00:00", "end_time": "2026-03-16T15:00:00"}
            ]
        })
        mock_client.return_value.get = AsyncMock(return_value=mock_response)

        slots = await get_jane_availability(
            clinic_id="clinic_001",
            start_date="2026-03-16",
            duration_minutes=60
        )

        assert isinstance(slots, list)
        assert len(slots) > 0


@pytest.mark.asyncio
async def test_book_jane_appointment_returns_booking_id():
    """Verify Jane booking creates appointment and returns ID."""
    with patch("ava_graph.tools.jane.get_jane_client") as mock_client:
        mock_response = AsyncMock()
        mock_response.json = AsyncMock(return_value={"id": "jane_12345"})
        mock_client.return_value.post = AsyncMock(return_value=mock_response)

        booking_id = await book_jane_appointment(
            clinic_id="clinic_001",
            patient_name="John Doe",
            patient_phone="07700000000",
            service_type="Physio",
            slot="2026-03-16T14:00:00"
        )

        assert booking_id == "jane_12345"
