"""FastMCP server — Ava PMS and SMS tool registry.

Exposes three tools that replace the bespoke pms_type switch statements
scattered across the graph nodes and routes:

  pms_check_availability   — query available slots from any supported PMS
  pms_book_appointment     — create appointment in any supported PMS
  sms_send_confirmation    — send booking confirmation SMS via Twilio

All PMS credentials are passed per-call (multi-tenant). No global state.

Run:
    python -m ava_graph.mcp_server          # stdio (default)
    fastmcp run ava_graph/mcp_server.py     # stdio via CLI
"""

from datetime import datetime
from typing import Optional

from fastmcp import FastMCP

from ava_graph.tools.writeupp import get_writeupp_availability, book_writeupp_appointment
from ava_graph.tools.cliniko import get_cliniko_availability, book_cliniko_appointment
from ava_graph.tools.jane import get_jane_availability, book_jane_appointment
from ava_graph.tools.tm3 import get_tm3_availability, book_tm3_appointment
from ava_graph.tools.twilio_sms import send_booking_confirmation_sms

mcp = FastMCP(
    name="ava-pms-tools",
    instructions=(
        "Tool registry for Ava's booking engine. "
        "All tools are multi-tenant: pass clinic-specific api_key and base_url per call. "
        "Supported PMS: writeupp, cliniko, jane, tm3."
    ),
)

_VALID_PMS = frozenset({"writeupp", "cliniko", "jane", "tm3"})


def _readable_slot(iso: str) -> str:
    """Format ISO datetime to human-readable string."""
    return datetime.fromisoformat(iso).strftime("%A %d %b at %I:%M %p").lstrip("0")


@mcp.tool()
async def pms_check_availability(
    clinic_id: str,
    pms_type: str,
    api_key: str,
    start_date: str,
    duration_minutes: int = 60,
    base_url: str = "",
    days_ahead: int = 14,
) -> dict:
    """Query available appointment slots from the clinic's PMS.

    Args:
        clinic_id: Multi-tenant clinic identifier
        pms_type: PMS system — writeupp | cliniko | jane | tm3
        api_key: Per-clinic PMS API key
        start_date: ISO date string, e.g. "2026-04-21"
        duration_minutes: Appointment length in minutes (default 60)
        base_url: Optional PMS base URL override (empty = use provider default)
        days_ahead: How many days forward to search (default 14)

    Returns:
        {"slots": [...ISO strings...], "result": "human-readable summary"}
    """
    if pms_type not in _VALID_PMS:
        raise ValueError(f"Unknown pms_type '{pms_type}'. Must be one of: {', '.join(sorted(_VALID_PMS))}")

    if pms_type == "writeupp":
        slots = await get_writeupp_availability(
            clinic_id=clinic_id,
            start_date=start_date,
            duration_minutes=duration_minutes,
            api_key=api_key,
            base_url=base_url,
            days_ahead=days_ahead,
        )
    elif pms_type == "cliniko":
        slots = await get_cliniko_availability(
            clinic_id=clinic_id,
            start_date=start_date,
            duration_minutes=duration_minutes,
            days_ahead=days_ahead,
            api_key=api_key,
            base_url=base_url,
        )
    elif pms_type == "jane":
        slots = await get_jane_availability(
            clinic_id=clinic_id,
            start_date=start_date,
            duration_minutes=duration_minutes,
            api_key=api_key,
            base_url=base_url,
        )
    else:  # tm3
        slots = await get_tm3_availability(
            clinic_id=clinic_id,
            start_date=start_date,
            duration_minutes=duration_minutes,
            api_key=api_key,
        )

    if not slots:
        result = "No available slots found in the requested period."
    else:
        readable = ", ".join(_readable_slot(s) for s in slots[:5])
        result = f"Available: {readable}"

    return {"slots": slots, "result": result}


@mcp.tool()
async def pms_book_appointment(
    clinic_id: str,
    pms_type: str,
    api_key: str,
    patient_name: str,
    patient_phone: str,
    service_type: str,
    slot: str,
    base_url: str = "",
    patient_email: Optional[str] = None,
) -> dict:
    """Book an appointment in the clinic's PMS.

    Args:
        clinic_id: Multi-tenant clinic identifier
        pms_type: PMS system — writeupp | cliniko | jane | tm3
        api_key: Per-clinic PMS API key
        patient_name: Full patient name
        patient_phone: Patient phone (E.164 or UK local format)
        service_type: Appointment type, e.g. "Physiotherapy Assessment"
        slot: ISO datetime string, e.g. "2026-04-21T14:00:00"
        base_url: Optional PMS base URL override (empty = use provider default)
        patient_email: Optional patient email address

    Returns:
        {"booking_id": "...", "result": "human-readable confirmation"}
    """
    if pms_type not in _VALID_PMS:
        raise ValueError(f"Unknown pms_type '{pms_type}'. Must be one of: {', '.join(sorted(_VALID_PMS))}")

    if pms_type == "writeupp":
        booking_id = await book_writeupp_appointment(
            clinic_id=clinic_id,
            patient_name=patient_name,
            patient_phone=patient_phone,
            service_type=service_type,
            slot=slot,
            api_key=api_key,
            base_url=base_url,
        )
    elif pms_type == "cliniko":
        booking_id = await book_cliniko_appointment(
            clinic_id=clinic_id,
            patient_name=patient_name,
            patient_phone=patient_phone,
            service_type=service_type,
            slot=slot,
            api_key=api_key,
            base_url=base_url,
        )
    elif pms_type == "jane":
        booking_id = await book_jane_appointment(
            clinic_id=clinic_id,
            patient_name=patient_name,
            patient_phone=patient_phone,
            service_type=service_type,
            slot=slot,
            api_key=api_key,
            base_url=base_url,
        )
    else:  # tm3
        booking_id = await book_tm3_appointment(
            clinic_id=clinic_id,
            patient_name=patient_name,
            patient_phone=patient_phone,
            service_type=service_type,
            slot=slot,
            api_key=api_key,
            patient_email=patient_email,
        )

    result = f"Booked {patient_name} in for {_readable_slot(slot)}. Booking ID: {booking_id}"
    return {"booking_id": booking_id, "result": result}


@mcp.tool()
async def sms_send_confirmation(
    patient_phone: str,
    patient_name: str,
    booking_slot: str,
    clinic_name: str,
    account_sid: Optional[str] = None,
    auth_token: Optional[str] = None,
) -> dict:
    """Send booking confirmation SMS to patient via Twilio.

    Args:
        patient_phone: Patient phone number (E.164 or UK local format)
        patient_name: Patient's name for personalisation
        booking_slot: Human-readable slot, e.g. "Monday 21 Apr at 2:00 PM"
        clinic_name: Clinic name used in the SMS body
        account_sid: Optional per-call Twilio account SID (overrides env var)
        auth_token: Optional per-call Twilio auth token (overrides env var)

    Returns:
        {"sms_sid": "SM...", "result": "human-readable confirmation"}
    """
    sms_sid = await send_booking_confirmation_sms(
        patient_phone=patient_phone,
        patient_name=patient_name,
        booking_slot=booking_slot,
        clinic_name=clinic_name,
        account_sid=account_sid,
        auth_token=auth_token,
    )
    return {"sms_sid": sms_sid, "result": f"SMS sent to {patient_phone}. SID: {sms_sid}"}


if __name__ == "__main__":
    mcp.run()
