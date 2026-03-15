"""Cliniko PMS API integration."""
import logging
from datetime import datetime, timedelta
from typing import List

import httpx

from ava_graph.config import get_cliniko_client, CLINIKO_PRACTICE_ID

logger = logging.getLogger(__name__)


async def get_cliniko_availability(
    clinic_id: str,
    start_date: str,
    duration_minutes: int = 60,
    days_ahead: int = 14,
) -> List[str]:
    """
    Query Cliniko for available appointment slots.

    Args:
        clinic_id: StrydeOS clinic identifier (maps to Cliniko business ID)
        start_date: ISO date string (YYYY-MM-DD)
        duration_minutes: Appointment duration
        days_ahead: How many days in advance to check

    Returns:
        List of available datetime strings (ISO format)
    """
    client = get_cliniko_client()

    try:
        # Cliniko API: GET /businesses/{business_id}/available_appointments
        # This endpoint returns available slots for a practice
        end_date = (
            datetime.fromisoformat(start_date) + timedelta(days=days_ahead)
        ).isoformat()

        response = await client.get(
            f"/businesses/{CLINIKO_PRACTICE_ID}/available_appointments",
            params={
                "from": start_date,
                "to": end_date,
                "duration": duration_minutes,
            },
        )
        response.raise_for_status()

        data = response.json()
        available_slots = data.get("available_appointments", [])

        # Normalize to ISO datetime strings
        slots = [slot["start_at"] for slot in available_slots]
        logger.info(f"Cliniko: found {len(slots)} available slots")

        return slots

    except httpx.HTTPError as e:
        logger.error(f"Cliniko API error: {e}")
        raise


async def book_cliniko_appointment(
    clinic_id: str,
    patient_name: str,
    patient_phone: str,
    service_type: str,
    slot: str,
) -> str:
    """
    Create a confirmed appointment in Cliniko.

    Args:
        clinic_id: StrydeOS clinic identifier
        patient_name: Full name
        patient_phone: Phone number for SMS confirmation
        service_type: Service name (maps to Cliniko appointment type)
        slot: Confirmed datetime (ISO format)

    Returns:
        Cliniko appointment ID
    """
    client = get_cliniko_client()

    try:
        # Cliniko API: POST /appointments
        name_parts = patient_name.split()
        first_name = name_parts[0] if name_parts else "Unknown"
        last_name = name_parts[-1] if len(name_parts) > 1 else ""

        appointment_data = {
            "appointment": {
                "business_id": CLINIKO_PRACTICE_ID,
                "start_at": slot,
                "appointment_type_id": "type_default",  # Clinic should map service_type
                "notes": f"Booked via Ava. Service: {service_type}",
            },
            "patient": {
                "first_name": first_name,
                "last_name": last_name,
                "mobile": patient_phone,
            },
        }

        response = await client.post(
            "/appointments",
            json=appointment_data,
        )
        response.raise_for_status()

        data = response.json()
        appointment_id = data.get("id")
        logger.info(f"Cliniko booking created: {appointment_id}")

        return appointment_id

    except httpx.HTTPError as e:
        logger.error(f"Cliniko booking error: {e}")
        raise
