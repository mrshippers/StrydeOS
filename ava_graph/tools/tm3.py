"""Tools for TM3 (Blue Zinc) PMS integration - availability and booking."""

import logging
from typing import List, Optional
from datetime import datetime

from ava_graph.config import get_tm3_client

logger = logging.getLogger(__name__)


async def get_tm3_availability(
    clinic_id: str, start_date: str, duration_minutes: int = 60
) -> List[str]:
    """
    Query TM3 API for available appointment slots.

    Args:
        clinic_id: TM3 practice/clinic identifier
        start_date: Start date in YYYY-MM-DD format to query availability
        duration_minutes: Appointment duration in minutes (default 60)

    Returns:
        List of available slot datetime strings in ISO format (YYYY-MM-DDTHH:MM:SS)

    Raises:
        Exception: If TM3 API call fails
    """
    client = get_tm3_client()

    try:
        logger.info(
            f"Querying TM3 availability for clinic {clinic_id} on {start_date}"
        )

        # Query TM3 available slots endpoint
        response = await client.get(
            f"/practices/{clinic_id}/available-slots",
            params={"startDate": start_date, "duration": duration_minutes},
        )
        if hasattr(response, 'raise_for_status'):
            response.raise_for_status()

        data = await response.json()

        # Filter slots where available=True and extract dateTime values
        available_slots = [
            slot["dateTime"]
            for slot in data.get("slots", [])
            if slot.get("available") is True
        ]

        logger.info(
            f"Found {len(available_slots)} available slots for clinic {clinic_id}"
        )

        return available_slots

    except Exception as e:
        logger.error(f"Failed to query TM3 availability: {str(e)}")
        raise


async def book_tm3_appointment(
    clinic_id: str,
    patient_name: str,
    patient_phone: str,
    service_type: str,
    slot: str,
    patient_email: Optional[str] = None,
) -> str:
    """
    Create an appointment booking in TM3.

    Args:
        clinic_id: TM3 practice/clinic identifier
        patient_name: Full name of the patient
        patient_phone: Phone number (E.164 or UK format)
        service_type: Type of service (e.g., "Physio", "Massage")
        slot: Appointment slot datetime in ISO format (YYYY-MM-DDTHH:MM:SS)
        patient_email: Optional email address

    Returns:
        Appointment ID as string (e.g., "tm3_12345")

    Raises:
        Exception: If TM3 API call fails
    """
    client = get_tm3_client()

    try:
        logger.info(
            f"Booking TM3 appointment for {patient_name} at {slot} in clinic {clinic_id}"
        )

        # Prepare booking payload
        payload = {
            "patientName": patient_name,
            "patientPhone": patient_phone,
            "serviceType": service_type,
            "slotDateTime": slot,
        }

        if patient_email:
            payload["patientEmail"] = patient_email

        # Create appointment via TM3 API
        response = await client.post(
            f"/practices/{clinic_id}/appointments",
            json=payload,
        )
        if hasattr(response, 'raise_for_status'):
            response.raise_for_status()

        data = await response.json()
        appointment_id = data.get("appointmentId")

        logger.info(
            f"Successfully booked TM3 appointment {appointment_id} for {patient_name}"
        )

        return appointment_id

    except Exception as e:
        logger.error(f"Failed to book TM3 appointment: {str(e)}")
        raise
