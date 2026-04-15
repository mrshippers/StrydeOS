"""Jane App availability and booking tools. Multi-tenant: api_key/base_url passed per-call."""

import logging
from typing import List

import httpx

logger = logging.getLogger(__name__)

_DEFAULT_BASE_URL = "https://api.integratedhealthtech.com"


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


async def get_jane_availability(
    clinic_id: str,
    start_date: str,
    duration_minutes: int,
    api_key: str = "",
    base_url: str = "",
) -> List[str]:
    """
    Query Jane App for available appointment slots.

    Args:
        clinic_id: The clinic identifier in Jane App
        start_date: Start date for availability check (YYYY-MM-DD)
        duration_minutes: Required appointment duration in minutes
        api_key: Jane API key for this clinic
        base_url: Optional Jane base URL override

    Returns:
        List of available slots as ISO datetime strings
    """
    async with _make_client(api_key, base_url) as client:
        try:
            response = await client.get(
                "/appointments/availability",
                params={
                    "clinic_id": clinic_id,
                    "start_date": start_date,
                    "duration_minutes": duration_minutes,
                },
            )
            response.raise_for_status()
            data = response.json()
        except httpx.HTTPError as e:
            logger.error("Jane availability query failed for clinic %s: %s", clinic_id, e)
            raise

    slots = [item["start_time"] for item in data.get("data", []) if "start_time" in item]
    logger.info("Jane: found %d available slots for clinic %s", len(slots), clinic_id)
    return slots


async def book_jane_appointment(
    clinic_id: str,
    patient_name: str,
    patient_phone: str,
    service_type: str,
    slot: str,
    api_key: str = "",
    base_url: str = "",
) -> str:
    """
    Create an appointment booking in Jane App.

    Args:
        clinic_id: The clinic identifier in Jane App
        patient_name: Full name of the patient
        patient_phone: Contact phone number
        service_type: Type of service to book
        slot: Appointment slot as ISO datetime string
        api_key: Jane API key for this clinic
        base_url: Optional Jane base URL override

    Returns:
        The appointment ID as a string
    """
    payload = {
        "clinic_id": clinic_id,
        "patient_name": patient_name,
        "patient_phone": patient_phone,
        "service_type": service_type,
        "start_time": slot,
    }

    async with _make_client(api_key, base_url) as client:
        try:
            response = await client.post("/appointments", json=payload)
            response.raise_for_status()
            data = response.json()
        except httpx.HTTPError as e:
            logger.error("Jane booking failed for clinic %s: %s", clinic_id, e)
            raise

    appointment_id = str(data.get("id", ""))
    logger.info("Jane booking created: %s for patient %s", appointment_id, patient_name)
    return appointment_id
