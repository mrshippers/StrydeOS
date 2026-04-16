"""Cliniko PMS API integration. Multi-tenant: api_key/base_url passed per-call.

Cliniko auth: API key used as the username in HTTP Basic auth with an empty
password (mirrors the dashboard TS adapter at
dashboard/src/lib/integrations/pms/cliniko/client.ts).

Cliniko is region-sharded: api.au1.cliniko.com, api.uk1.cliniko.com,
api.us1.cliniko.com, etc. There is NO api.cliniko.com — calls to it 404. The
default shard here is au1; pass `base_url` to override per clinic (resolved
during the dashboard connection-test flow).
"""

import base64
import logging
from datetime import datetime, timedelta
from time import monotonic as _monotonic
from typing import Dict, List, Tuple

import httpx

logger = logging.getLogger(__name__)

_DEFAULT_BASE_URL = "https://api.au1.cliniko.com/v1"

# In-memory availability cache. A live phone call typically calls
# check_availability multiple times (patient rejects slot, asks for another).
# 60s is short enough that real bookings don't drift, long enough to cover the
# whole conversation turn. Keyed by (clinic_id, start_date, duration, days_ahead).
_AVAILABILITY_TTL_SECONDS = 60.0
_availability_cache: Dict[Tuple[str, str, int, int], Tuple[float, List[str]]] = {}


def _make_client(api_key: str, base_url: str) -> httpx.AsyncClient:
    """
    Build an authenticated Cliniko HTTP client.

    Cliniko uses HTTP Basic auth with the API key as the username and an empty
    password. The combined "{api_key}:" string is base64-encoded into the
    Authorization header.

    Raises:
        ValueError: If api_key is empty or whitespace-only. This is loud on
            purpose — silently sending `Basic Og==` (just ":") returns a 401
            from Cliniko which the graph nodes were treating as a generic
            availability failure, masking a real misconfiguration.
    """
    if not api_key or not api_key.strip():
        raise ValueError(
            "PMS api_key is empty — clinic integrations_config likely missing or unconfigured"
        )

    encoded = base64.b64encode(f"{api_key}:".encode("utf-8")).decode("ascii")

    return httpx.AsyncClient(
        base_url=base_url or _DEFAULT_BASE_URL,
        headers={
            "Authorization": f"Basic {encoded}",
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "StrydeOS/1.0",
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

    Results are cached in-process for `_AVAILABILITY_TTL_SECONDS` (60s) keyed
    by (clinic_id, start_date, duration_minutes, days_ahead). This absorbs the
    repeated calls Ava issues during a single phone conversation when the
    patient rejects a slot and asks for an alternative.

    Args:
        clinic_id: StrydeOS clinic identifier (maps to Cliniko business ID)
        start_date: ISO date string (YYYY-MM-DD)
        duration_minutes: Appointment duration
        days_ahead: How many days in advance to check
        api_key: Cliniko API key for this clinic
        base_url: Optional Cliniko shard base URL override (e.g. uk1)

    Returns:
        List of available datetime strings (ISO format)
    """
    cache_key = (clinic_id, start_date, duration_minutes, days_ahead)
    now = _monotonic()
    cached = _availability_cache.get(cache_key)
    if cached is not None and (now - cached[0]) < _AVAILABILITY_TTL_SECONDS:
        logger.debug("Cliniko availability cache hit for clinic %s", clinic_id)
        return cached[1]

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
    _availability_cache[cache_key] = (_monotonic(), slots)
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
