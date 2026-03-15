"""Tests for TM3 (Blue Zinc) availability and booking tools."""

import pytest
from unittest.mock import AsyncMock, patch
from ava_graph.tools.tm3 import get_tm3_availability, book_tm3_appointment


@pytest.mark.asyncio
async def test_get_tm3_availability_returns_slots():
    """Verify TM3 availability returns list of datetime strings."""
    with patch("ava_graph.tools.tm3.get_tm3_client") as mock_client_factory:
        mock_client = AsyncMock()
        mock_response = AsyncMock()
        mock_response.json = AsyncMock(
            return_value={
                "slots": [
                    {"dateTime": "2026-03-16T14:00:00", "available": True},
                    {"dateTime": "2026-03-16T15:00:00", "available": True},
                    {"dateTime": "2026-03-16T16:00:00", "available": False},
                ]
            }
        )
        mock_response.raise_for_status = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client_factory.return_value = mock_client

        slots = await get_tm3_availability(
            clinic_id="clinic_001", start_date="2026-03-16", duration_minutes=60
        )

        assert isinstance(slots, list)
        assert len(slots) == 2  # Only available slots
        assert "2026-03-16T14:00:00" in slots
        assert "2026-03-16T15:00:00" in slots


@pytest.mark.asyncio
async def test_get_tm3_availability_empty_slots():
    """Verify TM3 availability returns empty list when no slots available."""
    with patch("ava_graph.tools.tm3.get_tm3_client") as mock_client_factory:
        mock_client = AsyncMock()
        mock_response = AsyncMock()
        mock_response.json = AsyncMock(return_value={"slots": []})
        mock_response.raise_for_status = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client_factory.return_value = mock_client

        slots = await get_tm3_availability(
            clinic_id="clinic_001", start_date="2026-03-16", duration_minutes=60
        )

        assert isinstance(slots, list)
        assert len(slots) == 0


@pytest.mark.asyncio
async def test_book_tm3_appointment_returns_booking_id():
    """Verify TM3 booking creates appointment and returns ID."""
    with patch("ava_graph.tools.tm3.get_tm3_client") as mock_client_factory:
        mock_client = AsyncMock()
        mock_response = AsyncMock()
        mock_response.json = AsyncMock(return_value={"appointmentId": "tm3_12345"})
        mock_response.raise_for_status = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client_factory.return_value = mock_client

        booking_id = await book_tm3_appointment(
            clinic_id="clinic_001",
            patient_name="John Doe",
            patient_phone="07700000000",
            service_type="Physio",
            slot="2026-03-16T14:00:00",
        )

        assert booking_id == "tm3_12345"
        mock_client.post.assert_called_once()


@pytest.mark.asyncio
async def test_book_tm3_appointment_with_email():
    """Verify TM3 booking can include patient email."""
    with patch("ava_graph.tools.tm3.get_tm3_client") as mock_client_factory:
        mock_client = AsyncMock()
        mock_response = AsyncMock()
        mock_response.json = AsyncMock(return_value={"appointmentId": "tm3_67890"})
        mock_response.raise_for_status = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client_factory.return_value = mock_client

        booking_id = await book_tm3_appointment(
            clinic_id="clinic_001",
            patient_name="Jane Smith",
            patient_phone="07700111111",
            patient_email="jane@example.com",
            service_type="Physio",
            slot="2026-03-16T15:00:00",
        )

        assert booking_id == "tm3_67890"
