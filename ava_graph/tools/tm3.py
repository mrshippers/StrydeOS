"""TM3 (Blue Zinc) PMS integration. Multi-tenant: api_key/base_url passed per-call."""

import logging
from typing import List, Optional

import httpx

logger = logging.getLogger(__name__)

_DEFAULT_BASE_URL = "https://api.tm3.co.uk"


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


async def get_tm3_availability(
    clinic_id: str,
    start_date: str,
    duration_minutes: int = 60,
    api_key: str = "",
    base_url: str = "",
) -> List[str]:
    """
    Query TM3 API for available appointment slots.

    Args:
        clinic_id: TM3 practice/clinic identifier
        start_date: Start date in YYYY-MM-DD format
        duration_minutes: Appointment duration in minutes
        api_key: TM3 API key for this clinic
        base_url: Optional TM3 base URL override

    Returns:
        List of available slot datetime strings in ISO format
    """
    async with _make_client(api_key, base_url) as client:
        try:
            response = await client.get(
                f"/practices/{clinic_id}/available-slots",
                params={"startDate": start_date, "duration": duration_minutes},
            )
            response.raise_for_status()
            data = response.json()
        except httpx.HTTPError as e:
            logger.error("TM3 availability query failed for clinic %s: %s", clinic_id, e)
            raise

    slots = [
        slot["dateTime"]
        for slot in data.get("slots", [])
        if slot.get("available") is True and "dateTime" in slot
    ]
    logger.info("TM3: found %d available slots for clinic %s", len(slots), clinic_id)
    return slots


async def book_tm3_appointment(
    clinic_id: str,
    patient_name: str,
    patient_phone: str,
    service_type: str,
    slot: str,
    api_key: str = "",
    base_url: str = "",
    patient_email: Optional[str] = None,
) -> str:
    """
    Create an appointment booking in TM3.

    Args:
        clinic_id: TM3 practice/clinic identifier
        patient_name: Full name of the patient
        patient_phone: Phone number
        service_type: Type of service
        slot: Appointment slot datetime in ISO format
        api_key: TM3 API key for this clinic
        base_url: Optional TM3 base URL override
        patient_email: Optional email address

    Returns:
        Appointment ID as string
    """
    payload: dict = {
        "patientName": patient_name,
        "patientPhone": patient_phone,
        "serviceType": service_type,
        "slotDateTime": slot,
    }
    if patient_email:
        payload["patientEmail"] = patient_email

    async with _make_client(api_key, base_url) as client:
        try:
            response = await client.post(f"/practices/{clinic_id}/appointments", json=payload)
            response.raise_for_status()
            data = response.json()
        except httpx.HTTPError as e:
            logger.error("TM3 booking failed for clinic %s: %s", clinic_id, e)
            raise

    appointment_id = str(data.get("appointmentId", ""))
    logger.info("TM3 booking created: %s for patient %s", appointment_id, patient_name)
    return appointment_id
