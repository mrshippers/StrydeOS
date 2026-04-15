"""Cliniko PMS API integration. Multi-tenant: api_key/base_url passed per-call."""

import logging
from datetime import datetime, timedelta
from typing import List

import httpx

logger = logging.getLogger(__name__)

_DEFAULT_BASE_URL = "https://api.cliniko.com/v1"


def _make_client(api_key: str, base_url: str) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        base_url=base_url or _DEFAULT_BASE_URL,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
        timeout=15.0,
    )


async def get_cliniko_availability(
    clinic_id: str,
    start_date: str,
    duration_minutes: int = 60,
    days_ahead: int = 14,
    api_key: str = "",
    base_url: str = "",
) -> List[str]:
    """
    Query Cliniko for available appointment slots.

    Args:
        clinic_id: StrydeOS clinic identifier (maps to Cliniko business ID)
        start_date: ISO date string (YYYY-MM-DD)
        duration_minutes: Appointment duration
        days_ahead: How many days in advance to check
        api_key: Cliniko API key for this clinic
        base_url: Optional Cliniko base URL override

    Returns:
        List of available datetime strings (ISO format)
    """
    end_date = (
        datetime.fromisoformat(start_date) + timedelta(days=days_ahead)
    ).isoformat()

    async with _make_client(api_key, base_url) as client:
        try:
            response = await client.get(
                f"/businesses/{clinic_id}/available_appointments",
                params={"from": start_date, "to": end_date, "duration": duration_minutes},
            )
            response.raise_for_status()
            data = response.json()
        except httpx.HTTPError as e:
            logger.error("Cliniko API error for clinic %s: %s", clinic_id, e)
            raise

    available = data.get("available_appointments", [])
    slots = [slot["start_at"] for slot in available if "start_at" in slot]
    logger.info("Cliniko: found %d available slots for clinic %s", len(slots), clinic_id)
    return slots


async def book_cliniko_appointment(
    clinic_id: str,
    patient_name: str,
    patient_phone: str,
    service_type: str,
    slot: str,
    api_key: str = "",
    base_url: str = "",
) -> str:
    """
    Create a confirmed appointment in Cliniko.

    Args:
        clinic_id: StrydeOS clinic identifier (used as Cliniko business_id)
        patient_name: Full name
        patient_phone: Phone number for SMS confirmation
        service_type: Service name (maps to Cliniko appointment type)
        slot: Confirmed datetime (ISO format)
        api_key: Cliniko API key for this clinic
        base_url: Optional Cliniko base URL override

    Returns:
        Cliniko appointment ID
    """
    name_parts = patient_name.split()
    first_name = name_parts[0] if name_parts else "Unknown"
    last_name = name_parts[-1] if len(name_parts) > 1 else ""

    payload = {
        "appointment": {
            "business_id": clinic_id,
            "start_at": slot,
            "appointment_type_id": "type_default",
            "notes": f"Booked via Ava. Service: {service_type}",
        },
        "patient": {
            "first_name": first_name,
            "last_name": last_name,
            "mobile": patient_phone,
        },
    }

    async with _make_client(api_key, base_url) as client:
        try:
            response = await client.post("/appointments", json=payload)
            response.raise_for_status()
            data = response.json()
        except httpx.HTTPError as e:
            logger.error("Cliniko booking error for clinic %s: %s", clinic_id, e)
            raise

    appointment_id = str(data.get("id", ""))
    logger.info("Cliniko booking created: %s for patient %s", appointment_id, patient_name)
    return appointment_id
