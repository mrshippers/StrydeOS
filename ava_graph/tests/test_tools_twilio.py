"""Tests for Twilio SMS tool (multi-tenant: per-call account_sid/auth_token)."""

import pytest
from unittest.mock import MagicMock, patch
from ava_graph.tools.twilio_sms import send_booking_confirmation_sms, normalize_phone_number


# ─── normalize_phone_number unit tests ───────────────────────────────────────

def test_normalize_uk_local_to_e164():
    assert normalize_phone_number("07700000000") == "+447700000000"


def test_normalize_already_e164():
    assert normalize_phone_number("+447700000000") == "+447700000000"


def test_normalize_without_leading_zero():
    assert normalize_phone_number("447700000000") == "+447700000000"


def test_normalize_raises_on_too_short():
    with pytest.raises(ValueError):
        normalize_phone_number("123")


# ─── send_booking_confirmation_sms tests ─────────────────────────────────────

@pytest.mark.asyncio
async def test_send_sms_with_env_credentials():
    """Verify SMS sends using env-var credentials when none passed explicitly."""
    mock_message = MagicMock()
    mock_message.sid = "SM1234567890"
    mock_client_instance = MagicMock()
    mock_client_instance.messages.create = MagicMock(return_value=mock_message)

    with patch("ava_graph.tools.twilio_sms.TwilioClient", return_value=mock_client_instance) as mock_cls, \
         patch("ava_graph.tools.twilio_sms.TWILIO_FROM_NUMBER", "+447700999999"):

        sid = await send_booking_confirmation_sms(
            patient_phone="+447700000000",
            patient_name="John Doe",
            booking_slot="2026-04-21 14:00",
            clinic_name="Spires Physiotherapy",
        )

    assert sid == "SM1234567890"
    mock_client_instance.messages.create.assert_called_once()


@pytest.mark.asyncio
async def test_send_sms_with_per_call_credentials():
    """Per-call account_sid/auth_token take precedence over env vars."""
    mock_message = MagicMock()
    mock_message.sid = "SM_CUSTOM"
    mock_client_instance = MagicMock()
    mock_client_instance.messages.create = MagicMock(return_value=mock_message)

    with patch("ava_graph.tools.twilio_sms.TwilioClient", return_value=mock_client_instance) as mock_cls, \
         patch("ava_graph.tools.twilio_sms.TWILIO_FROM_NUMBER", "+447700999999"):

        sid = await send_booking_confirmation_sms(
            patient_phone="+447700000000",
            patient_name="Jane Smith",
            booking_slot="2026-04-21 10:00",
            clinic_name="Test Clinic",
            account_sid="ACtest",
            auth_token="token123",
        )

        # Verify per-call credentials were used
        mock_cls.assert_called_once_with("ACtest", "token123")

    assert sid == "SM_CUSTOM"


@pytest.mark.asyncio
async def test_send_sms_normalizes_phone():
    """UK local format phone is normalized to E.164 before sending."""
    mock_message = MagicMock()
    mock_message.sid = "SM_NORM"
    mock_client_instance = MagicMock()
    mock_client_instance.messages.create = MagicMock(return_value=mock_message)

    with patch("ava_graph.tools.twilio_sms.TwilioClient", return_value=mock_client_instance), \
         patch("ava_graph.tools.twilio_sms.TWILIO_FROM_NUMBER", "+447700999999"):

        await send_booking_confirmation_sms(
            patient_phone="07700000000",
            patient_name="Bob Brown",
            booking_slot="2026-04-21 11:00",
            clinic_name="Spires Physiotherapy",
        )

    call_kwargs = mock_client_instance.messages.create.call_args[1]
    assert call_kwargs["to"] == "+447700000000"


@pytest.mark.asyncio
async def test_send_sms_message_contains_key_details():
    """Message body must include patient name, clinic, slot, and action words."""
    mock_message = MagicMock()
    mock_message.sid = "SM_CONTENT"
    mock_client_instance = MagicMock()
    mock_client_instance.messages.create = MagicMock(return_value=mock_message)

    with patch("ava_graph.tools.twilio_sms.TwilioClient", return_value=mock_client_instance), \
         patch("ava_graph.tools.twilio_sms.TWILIO_FROM_NUMBER", "+447700999999"):

        await send_booking_confirmation_sms(
            patient_phone="+447700000000",
            patient_name="John Doe",
            booking_slot="2026-04-21 14:00",
            clinic_name="Spires Physiotherapy",
        )

    body = mock_client_instance.messages.create.call_args[1]["body"]
    assert "John Doe" in body
    assert "Spires Physiotherapy" in body
    assert "2026-04-21 14:00" in body
    assert "CONFIRM" in body
    assert "CANCEL" in body
