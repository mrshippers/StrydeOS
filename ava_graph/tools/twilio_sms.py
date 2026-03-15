"""Twilio SMS tool for sending booking confirmations."""

import logging
import re
from typing import Optional

from ava_graph.config import get_twilio_client, TWILIO_FROM_NUMBER

logger = logging.getLogger(__name__)


def normalize_phone_number(phone: str) -> str:
    """
    Normalize phone number to E.164 format.

    Args:
        phone: Phone number in any format (e.g., "07700000000", "+447700000000")

    Returns:
        Phone number in E.164 format (e.g., "+447700000000")

    Raises:
        ValueError: If phone number cannot be normalized.
    """
    # Remove all non-digit characters
    digits = re.sub(r"\D", "", phone)

    # If it starts with 0 (UK local format), replace with 44
    if digits.startswith("0"):
        digits = "44" + digits[1:]
    elif not digits.startswith("44"):
        # If it doesn't start with 44 or have a leading 0, assume UK
        digits = "44" + digits

    # Format as E.164
    e164 = f"+{digits}"

    if len(digits) < 10 or len(digits) > 15:
        raise ValueError(f"Invalid phone number length: {phone}")

    return e164


async def send_booking_confirmation_sms(
    patient_phone: str,
    patient_name: str,
    booking_slot: str,
    clinic_name: str,
    from_number: Optional[str] = None,
) -> str:
    """
    Send SMS booking confirmation to patient.

    Args:
        patient_phone: Patient's phone number (any format)
        patient_name: Patient's full name
        booking_slot: Booking date/time as string (e.g., "2026-03-16 14:00")
        clinic_name: Name of the clinic
        from_number: Twilio phone number to send from (uses config if not provided)

    Returns:
        Message SID from Twilio

    Raises:
        ValueError: If phone number is invalid
        Exception: If SMS send fails
    """
    try:
        # Normalize phone number
        to_number = normalize_phone_number(patient_phone)

        # Use provided from_number or fall back to config
        sms_from = from_number or TWILIO_FROM_NUMBER
        if not sms_from:
            raise ValueError("TWILIO_FROM_NUMBER not configured")

        # Build message body
        message_body = (
            f"Hi {patient_name}, your appointment at {clinic_name} is confirmed "
            f"for {booking_slot}. Please reply CONFIRM to confirm or CANCEL to reschedule."
        )

        # Get Twilio client and send
        client = get_twilio_client()
        message = client.messages.create(
            to=to_number,
            from_=sms_from,
            body=message_body,
        )

        logger.info(
            f"SMS sent successfully. SID: {message.sid}, To: {to_number}, "
            f"Patient: {patient_name}"
        )
        return message.sid

    except ValueError as e:
        logger.error(f"Invalid phone number: {patient_phone}. Error: {e}")
        raise
    except Exception as e:
        logger.error(
            f"Failed to send SMS to {patient_phone}. Error: {e}",
            exc_info=True,
        )
        raise
