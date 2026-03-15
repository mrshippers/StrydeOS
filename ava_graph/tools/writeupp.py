"""WriteUpp availability and booking tools for Ava.

Provides async functions to query WriteUpp PMS for available appointment slots
and create bookings.
"""

import logging
from typing import List
import httpx

from ava_graph.config import get_writeupp_client

logger = logging.getLogger(__name__)


async def get_writeupp_availability(
    clinic_id: str,
    start_date: str,
    duration_minutes: int,
) -> List[str]:
    """
    Query WriteUpp for available appointment slots.

    Args:
        clinic_id: WriteUpp clinic identifier
        start_date: Start date in ISO format (YYYY-MM-DD)
        duration_minutes: Appointment duration in minutes

    Returns:
        List of available slot start times as ISO datetime strings (e.g., "2026-03-16T14:00:00")

    Raises:
        httpx.HTTPError: If the API request fails
    """
    client = get_writeupp_client()

    try:
        logger.debug(
            "Querying WriteUpp availability for clinic %s from %s (duration: %d min)",
            clinic_id,
            start_date,
            duration_minutes,
        )

        # Query WriteUpp availability endpoint
        response = await client.get(
            f"/clinics/{clinic_id}/available-slots",
            params={
                "startDate": start_date,
                "durationMinutes": duration_minutes,
            },
        )
        response.raise_for_status()

        data = response.json()
        available_slots = data.get("availableSlots", [])

        # Extract startTime from each slot
        slots = [slot["startTime"] for slot in available_slots if "startTime" in slot]

        logger.info(
            "Retrieved %d available slots for clinic %s",
            len(slots),
            clinic_id,
        )

        return slots

    except httpx.HTTPError as e:
        logger.error(
            "WriteUpp availability query failed for clinic %s: %s",
            clinic_id,
            str(e),
        )
        raise


async def book_writeupp_appointment(
    clinic_id: str,
    patient_name: str,
    patient_phone: str,
    service_type: str,
    slot: str,
) -> str:
    """
    Create an appointment booking in WriteUpp.

    Args:
        clinic_id: WriteUpp clinic identifier
        patient_name: Full name of the patient
        patient_phone: Phone number (e.g., "07700000000")
        service_type: Type of service/practitioner (e.g., "Physio")
        slot: Appointment start time as ISO datetime string (e.g., "2026-03-16T14:00:00")

    Returns:
        Appointment ID from WriteUpp (e.g., "write_12345")

    Raises:
        httpx.HTTPError: If the booking creation fails
    """
    client = get_writeupp_client()

    try:
        logger.debug(
            "Creating WriteUpp appointment for clinic %s, patient %s at %s",
            clinic_id,
            patient_name,
            slot,
        )

        # Create booking via WriteUpp API
        payload = {
            "clinicId": clinic_id,
            "patientName": patient_name,
            "patientPhone": patient_phone,
            "serviceType": service_type,
            "startTime": slot,
        }

        response = await client.post(
            "/appointments",
            json=payload,
        )
        response.raise_for_status()

        data = response.json()
        appointment_id = data.get("appointmentId")

        logger.info(
            "Successfully created WriteUpp appointment %s for patient %s",
            appointment_id,
            patient_name,
        )

        return appointment_id

    except httpx.HTTPError as e:
        logger.error(
            "WriteUpp booking creation failed for clinic %s, patient %s: %s",
            clinic_id,
            patient_name,
            str(e),
        )
        raise
