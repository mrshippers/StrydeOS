"""Jane App availability and booking tools — NOT IMPLEMENTED.

Jane App (https://jane.app) does not offer a public, per-clinic API key.

Their integration model is the Jane Developer Platform (JDP):
  - Partner-only, application-gated programme (vetting required)
  - OAuth 2.0 PKCE flow, JWT Bearer tokens (RS256)
  - Date-versioned REST paths (e.g. /YYYY-MM-DD/...)
  - Rate-limited to 100 req/min per endpoint per clinic
  - Clinics CANNOT generate their own API keys — Jane explicitly states
    "clinics cannot build their own integrations"
  - StrydeOS is not yet an approved Jane partner

References (verified 2026-04-15):
  - https://developers.jane.app/
  - https://developers.jane.app/docs/getting-started
  - https://jane.app/blog/jane-integrations-our-program-our-partners-and-how-to-work-with-us
  - https://integrations.janeapp.net/application_forms/jane-integrations-partner-interest-form/partner_applications/new

When Jane partner status is granted:
  1. Implement OAuth 2.0 PKCE handshake → store practitioner-scoped JWTs
     (Jane issues access + refresh tokens; refresh before expiry)
  2. Replace the api_key parameter with a JWT pulled from a per-clinic token store
  3. Build base_url as `https://api.jane.app/<api_version_date>` and pass JWT in the
     Authorization header
  4. Mirror the writeupp.py shape: GET schedule, diff against booked slots, return
     ISO datetime strings; POST appointment payload, return appointment ID
  5. Restore the 60s in-memory availability cache (see writeupp.py for the pattern)

Until then both functions raise NotImplementedError so callers fail loudly rather
than silently calling a fabricated endpoint.

The function signatures are kept stable so call sites in api/routes.py,
mcp_server.py, graph/nodes/check_availability.py and graph/nodes/confirm_booking.py
do not have to change when the real integration ships.
"""

import logging

logger = logging.getLogger(__name__)

_NOT_AVAILABLE_MSG = (
    "Jane App integration is not available. Jane does not offer a public per-clinic "
    "API key — only an approval-gated partner programme (Jane Developer Platform, "
    "OAuth 2.0 PKCE). StrydeOS is not yet an approved Jane partner. Apply at "
    "https://integrations.janeapp.net/application_forms/jane-integrations-partner-interest-form/partner_applications/new"
)


async def get_jane_availability(
    clinic_id: str,
    start_date: str,
    duration_minutes: int,
    api_key: str = "",
    base_url: str = "",
):
    """
    Query Jane App for available appointment slots.

    NOT IMPLEMENTED — Jane App does not expose a public per-clinic API.
    Access requires an approved Jane Developer Platform partnership using
    OAuth 2.0 PKCE, not a static API key.

    Args:
        clinic_id: The clinic identifier in Jane App
        start_date: Start date for availability check (YYYY-MM-DD)
        duration_minutes: Required appointment duration in minutes
        api_key: Reserved (Jane uses OAuth JWTs, not API keys)
        base_url: Reserved (would be https://api.jane.app/<api_version_date>)

    Raises:
        NotImplementedError: Always, until StrydeOS is an approved Jane partner.
    """
    logger.error(
        "get_jane_availability called for clinic %s but Jane integration is "
        "not available (no public API; partner programme required)",
        clinic_id,
    )
    raise NotImplementedError(_NOT_AVAILABLE_MSG)


async def book_jane_appointment(
    clinic_id: str,
    patient_name: str,
    patient_phone: str,
    service_type: str,
    slot: str,
    api_key: str = "",
    base_url: str = "",
):
    """
    Create an appointment booking in Jane App.

    NOT IMPLEMENTED — see module docstring and get_jane_availability.

    Args:
        clinic_id: The clinic identifier in Jane App
        patient_name: Full name of the patient
        patient_phone: Contact phone number
        service_type: Type of service to book
        slot: Appointment slot as ISO datetime string
        api_key: Reserved (Jane uses OAuth JWTs, not API keys)
        base_url: Reserved (would be https://api.jane.app/<api_version_date>)

    Raises:
        NotImplementedError: Always, until StrydeOS is an approved Jane partner.
    """
    logger.error(
        "book_jane_appointment called for clinic %s, patient %s but Jane "
        "integration is not available (no public API; partner programme required)",
        clinic_id,
        patient_name,
    )
    raise NotImplementedError(_NOT_AVAILABLE_MSG)
