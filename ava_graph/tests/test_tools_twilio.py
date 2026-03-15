"""Tests for Twilio SMS tool."""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from ava_graph.tools.twilio_sms import send_booking_confirmation_sms


@pytest.mark.asyncio
async def test_send_booking_confirmation_sms():
    """Verify SMS sends booking confirmation."""
    with patch("ava_graph.tools.twilio_sms.get_twilio_client") as mock_get_client, \
         patch("ava_graph.tools.twilio_sms.TWILIO_FROM_NUMBER", "+447700999999"):
        mock_message = MagicMock()
        mock_message.sid = "SM1234567890"
        mock_client = MagicMock()
        mock_client.messages.create = MagicMock(return_value=mock_message)
        mock_get_client.return_value = mock_client

        sms_id = await send_booking_confirmation_sms(
            patient_phone="+447700000000",
            patient_name="John Doe",
            booking_slot="2026-03-16 14:00",
            clinic_name="Spires Physiotherapy",
        )

        assert sms_id == "SM1234567890"
        mock_client.messages.create.assert_called_once()


@pytest.mark.asyncio
async def test_send_booking_confirmation_sms_normalizes_phone():
    """Verify phone numbers are normalized to E.164 format."""
    with patch("ava_graph.tools.twilio_sms.get_twilio_client") as mock_get_client, \
         patch("ava_graph.tools.twilio_sms.TWILIO_FROM_NUMBER", "+447700999999"):
        mock_message = MagicMock()
        mock_message.sid = "SM1234567890"
        mock_client = MagicMock()
        mock_client.messages.create = MagicMock(return_value=mock_message)
        mock_get_client.return_value = mock_client

        sms_id = await send_booking_confirmation_sms(
            patient_phone="07700000000",  # Missing +44 prefix
            patient_name="Jane Smith",
            booking_slot="2026-03-16 15:00",
            clinic_name="Spires Physiotherapy",
        )

        assert sms_id == "SM1234567890"
        # Verify that the call was made with normalized number
        call_args = mock_client.messages.create.call_args
        assert call_args[1]['to'] == "+447700000000"


@pytest.mark.asyncio
async def test_send_booking_confirmation_sms_message_format():
    """Verify message content is correctly formatted."""
    with patch("ava_graph.tools.twilio_sms.get_twilio_client") as mock_get_client, \
         patch("ava_graph.tools.twilio_sms.TWILIO_FROM_NUMBER", "+447700999999"):
        mock_message = MagicMock()
        mock_message.sid = "SM1234567890"
        mock_client = MagicMock()
        mock_client.messages.create = MagicMock(return_value=mock_message)
        mock_get_client.return_value = mock_client

        await send_booking_confirmation_sms(
            patient_phone="+447700000000",
            patient_name="John Doe",
            booking_slot="2026-03-16 14:00",
            clinic_name="Spires Physiotherapy",
        )

        call_args = mock_client.messages.create.call_args
        body = call_args[1]['body']
        assert "John Doe" in body
        assert "Spires Physiotherapy" in body
        assert "2026-03-16 14:00" in body
        assert "CONFIRM" in body
        assert "CANCEL" in body
