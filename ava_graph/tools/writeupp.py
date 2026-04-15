"""WriteUpp availability and booking tools for Ava.

Multi-tenant: api_key and base_url are passed per-call from Firestore clinic config.
Availability is computed by fetching booked appointments and diffing against a
standard clinic hours grid (Mon-Fri, 09:00-17:00, slots sized by duration_minutes).
"""

import logging
from datetime import datetime, timedelta
from typing import List

import httpx

logger = logging.getLogger(__name__)

_DEFAULT_BASE_URL = "https://app.writeupp.com/api/v1"

# Default clinic hours for slot grid generation (UK private physio typical hours)
_CLINIC_START_HOUR = 9    # 09:00
_CLINIC_END_HOUR = 17     # 17:00 (last slot starts at 16:30 for 30-min, 16:00 for 60-min)
_CLINIC_DAYS = {0, 1, 2, 3, 4}  # Mon–Fri (weekday() 0-4)


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


def _compute_free_slots(
    booked_start_times: List[str],
    from_dt: datetime,
    to_dt: datetime,
    duration_minutes: int,
) -> List[str]:
    """
    Generate a grid of clinic hour slots and remove any that are already booked.

    Args:
        booked_start_times: ISO datetime strings of confirmed appointments
        from_dt: Start of the search window
        to_dt: End of the search window
        duration_minutes: Slot duration (determines grid spacing)

    Returns:
        List of free slot ISO datetime strings (up to 20 slots)
    """
    # Normalise booked times to "YYYY-MM-DDTHH:MM" for comparison
    booked = set()
    for t in booked_start_times:
        if t:
            booked.add(t[:16])

    step = timedelta(minutes=duration_minutes)
    now = datetime.now()
    free = []
    current_day = from_dt.replace(hour=0, minute=0, second=0, microsecond=0)

    while current_day < to_dt and len(free) < 20:
        if current_day.weekday() in _CLINIC_DAYS:
            slot_time = current_day.replace(hour=_CLINIC_START_HOUR, minute=0)
            end_of_day = current_day.replace(hour=_CLINIC_END_HOUR, minute=0)

            while slot_time + step <= end_of_day:
                if slot_time > now:
                    key = slot_time.strftime("%Y-%m-%dT%H:%M")
                    if key not in booked:
                        free.append(slot_time.isoformat())
                slot_time += step

        current_day += timedelta(days=1)

    return free


async def get_writeupp_availability(
    clinic_id: str,
    start_date: str,
    duration_minutes: int,
    api_key: str,
    base_url: str = "",
    days_ahead: int = 14,
) -> List[str]:
    """
    Query WriteUpp for available appointment slots.

    Fetches booked appointments for the window, then returns free slots by
    diffing against the clinic hours grid.

    Args:
        clinic_id: Kept for call-site compat; not sent to WriteUpp (auth scopes to clinic)
        start_date: ISO date string (YYYY-MM-DD)
        duration_minutes: Appointment duration — used for slot grid spacing
        api_key: WriteUpp API key for this clinic
        base_url: Optional WriteUpp base URL override
        days_ahead: How many days ahead to look (default 14)

    Returns:
        List of free slot ISO datetime strings, soonest first (max 20)
    """
    from_dt = datetime.fromisoformat(start_date)
    to_dt = from_dt + timedelta(days=days_ahead)

    async with _make_client(api_key, base_url) as client:
        try:
            response = await client.get(
                "/appointments",
                params={
                    "from": from_dt.isoformat(),
                    "to": to_dt.isoformat(),
                },
            )
            response.raise_for_status()
            data = response.json()
        except httpx.HTTPError as e:
            logger.error("WriteUpp availability query failed for clinic %s: %s", clinic_id, e)
            raise

    # WriteUpp returns { data: [...] } or { appointments: [...] } or a bare array
    rows = data if isinstance(data, list) else data.get("data") or data.get("appointments") or []

    booked_start_times = []
    for row in rows:
        start = row.get("start_time") or row.get("start") or row.get("date_time") or ""
        if start:
            booked_start_times.append(start)

    free_slots = _compute_free_slots(booked_start_times, from_dt, to_dt, duration_minutes)

    logger.info(
        "WriteUpp: %d booked, %d free slots for clinic %s",
        len(booked_start_times),
        len(free_slots),
        clinic_id,
    )
    return free_slots


async def book_writeupp_appointment(
    clinic_id: str,
    patient_name: str,
    patient_phone: str,
    service_type: str,
    slot: str,
    api_key: str,
    base_url: str = "",
) -> str:
    """
    Create an appointment booking in WriteUpp.

    Args:
        clinic_id: WriteUpp clinic identifier (sent in payload for reference)
        patient_name: Full name of the patient
        patient_phone: Phone number (E.164 or local format)
        service_type: Type of service/appointment
        slot: Appointment start time as ISO datetime string
        api_key: WriteUpp API key for this clinic
        base_url: Optional WriteUpp base URL override

    Returns:
        Appointment ID from WriteUpp

    Raises:
        httpx.HTTPError: If the booking creation fails
    """
    payload = {
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
            logger.error(
                "WriteUpp booking failed for clinic %s, patient %s: %s",
                clinic_id, patient_name, e,
            )
            raise

    appointment_id = str(
        data.get("id") or data.get("appointmentId") or data.get("appointment_id") or ""
    )
    logger.info("WriteUpp booking created: %s for patient %s", appointment_id, patient_name)
    return appointment_id
