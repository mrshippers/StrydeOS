"""Jane App availability and booking tools for Ava booking workflow."""

import logging
from typing import List
from datetime import datetime

import httpx

from ava_graph.config import get_jane_client

logger = logging.getLogger(__name__)


async def get_jane_availability(
    clinic_id: str,
    start_date: str,
    duration_minutes: int,
) -> List[str]:
    """
    Query Jane App for available appointment slots.

    Args:
        clinic_id: The clinic identifier in Jane App
        start_date: Start date for availability check (YYYY-MM-DD format)
        duration_minutes: Required appointment duration in minutes

    Returns:
        List of available slots as ISO datetime strings (start_time from data array)

    Raises:
        httpx.HTTPError: If the API request fails
        KeyError: If response structure is unexpected
    """
    client = get_jane_client()

    try:
        logger.info(
            f"Querying Jane availability for clinic {clinic_id}, "
            f"start_date: {start_date}, duration: {duration_minutes}min"
        )

        response = await client.get(
            "/appointments/availability",
            params={
                "clinic_id": clinic_id,
                "start_date": start_date,
                "duration_minutes": duration_minutes,
            },
        )
        response.raise_for_status()

        data = await response.json()
        logger.debug(f"Jane availability response: {data}")

        # Extract start_time values from data array
        slots = [item["start_time"] for item in data.get("data", [])]

        logger.info(f"Found {len(slots)} available slots for clinic {clinic_id}")
        return slots

    except httpx.HTTPError as e:
        logger.error(f"HTTP error querying Jane availability: {e}")
        raise
    except KeyError as e:
        logger.error(f"Unexpected response structure from Jane API: {e}")
        raise
    except Exception as e:
        logger.error(f"Unexpected error querying Jane availability: {e}")
        raise


async def book_jane_appointment(
    clinic_id: str,
    patient_name: str,
    patient_phone: str,
    service_type: str,
    slot: str,
) -> str:
    """
    Create an appointment booking in Jane App.

    Args:
        clinic_id: The clinic identifier in Jane App
        patient_name: Full name of the patient
        patient_phone: Contact phone number
        service_type: Type of service to book (e.g., "Physio")
        slot: Appointment slot as ISO datetime string

    Returns:
        The appointment ID as a string

    Raises:
        httpx.HTTPError: If the API request fails
        KeyError: If response structure is unexpected
    """
    client = get_jane_client()

    try:
        logger.info(
            f"Booking Jane appointment for {patient_name} "
            f"at {slot} in clinic {clinic_id}"
        )

        payload = {
            "clinic_id": clinic_id,
            "patient_name": patient_name,
            "patient_phone": patient_phone,
            "service_type": service_type,
            "start_time": slot,
        }

        response = await client.post(
            "/appointments",
            json=payload,
        )
        response.raise_for_status()

        data = await response.json()
        logger.debug(f"Jane booking response: {data}")

        appointment_id = data["id"]
        logger.info(f"Successfully booked appointment with ID: {appointment_id}")

        return appointment_id

    except httpx.HTTPError as e:
        logger.error(f"HTTP error booking Jane appointment: {e}")
        raise
    except KeyError as e:
        logger.error(f"Unexpected response structure from Jane API: {e}")
        raise
    except Exception as e:
        logger.error(f"Unexpected error booking Jane appointment: {e}")
        raise
