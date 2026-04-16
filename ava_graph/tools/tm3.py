"""TM3 (Blue Zinc IT) PMS integration — STUB.

TM3 is the dominant legacy UK physiotherapy PMS, sold by Blue Zinc IT Ltd
(part of ClearCourse since 2021). Despite its market share, **TM3 does not
publish a public REST API**. Confirmed by direct research (2026-04):

- No developer portal exists at developer.tm3app.com or api.tm3app.com
  (both return blank loading pages).
- The TM3 marketing site (https://tm3app.com/features/integrations/) only
  advertises named partner integrations: Xero, Mailchimp, Pipedrive,
  Physitrack, Salaso, PhysioTools, Tyro Health, ePresscriber, Doctify,
  HealthCode, Heidi.
- The "API Key" surfaced in the TM3 UI (per
  https://help.tm3app.com/en/articles/4448434-physitrack) is a per-
  practitioner Physitrack handshake token, NOT a general-purpose API key.
  It only authenticates the named Physitrack partner integration.
- Multiple SoftwareAdvice/SelectHub reviews flag the absence of a public
  API as a known limitation: users cannot integrate online booking with
  their own websites.
- Blue Zinc parent (https://www.blue-zinc.com) lists no developer
  resources or partnership programme. The .co.uk domain is parked
  (for sale).

Until Blue Zinc grants partnership access, TM3 booking automation through
Ava is **not possible via a sanctioned API**. Both functions below raise
`NotImplementedError` with the contact path. Do not paper this over with
fake endpoints — calls would 404 in production and silently break Ava
mid-call with a real patient on the line.

Multi-tenant signature is preserved (same args as
get_writeupp_availability / book_writeupp_appointment) so the
check_availability and confirm_booking router nodes do not need to
change when partnership access lands.

Contact path:
    - Partnerships: info@tm3app.com (general), partnerships team via
      https://tm3app.com/contact-us/
    - Blue Zinc support: support@blue-zinc.com / 028 9099 8696
    - Belfast HQ — Blue Zinc IT Ltd

When access is granted, replace the bodies below with the real
implementation, mirror the writeupp.py 60s in-memory cache pattern, and
update tests accordingly.
"""

import logging
from typing import List, Optional

logger = logging.getLogger(__name__)

_NOT_IMPLEMENTED_MESSAGE = (
    "TM3 (Blue Zinc IT) does not expose a public REST API. "
    "Booking automation requires a partnership agreement. "
    "Contact info@tm3app.com for partnership access, or "
    "support@blue-zinc.com for technical enquiries. "
    "See ava_graph/tools/tm3.py module docstring for full research notes."
)


async def get_tm3_availability(
    clinic_id: str,
    start_date: str,
    duration_minutes: int = 60,
    api_key: str = "",
    base_url: str = "",
) -> List[str]:
    """
    Query TM3 for available appointment slots.

    NOT IMPLEMENTED — TM3 has no public API. See module docstring.

    Args:
        clinic_id: TM3 practice/clinic identifier
        start_date: Start date in YYYY-MM-DD format
        duration_minutes: Appointment duration in minutes
        api_key: TM3 API key for this clinic (per-practitioner Physitrack
                 token is NOT sufficient; partnership credentials required)
        base_url: Optional TM3 base URL override

    Returns:
        List of available slot ISO datetime strings.

    Raises:
        NotImplementedError: TM3 has no public API. Contact Blue Zinc
            (info@tm3app.com) for partnership access.
    """
    logger.error(
        "TM3 availability requested for clinic %s but TM3 has no public API. "
        "Configure a different PMS (writeupp/cliniko/jane) for this clinic.",
        clinic_id,
    )
    raise NotImplementedError(_NOT_IMPLEMENTED_MESSAGE)


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

    NOT IMPLEMENTED — TM3 has no public API. See module docstring.

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
        Appointment ID as string.

    Raises:
        NotImplementedError: TM3 has no public API. Contact Blue Zinc
            (info@tm3app.com) for partnership access.
    """
    logger.error(
        "TM3 booking attempted for clinic %s, patient %s — TM3 has no "
        "public API. Booking NOT created. Manual intervention required.",
        clinic_id,
        patient_name,
    )
    raise NotImplementedError(_NOT_IMPLEMENTED_MESSAGE)
