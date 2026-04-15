from typing import TypedDict, List


class AvaState(TypedDict):
    """State container for Ava booking workflow."""
    patient_name: str              # Extracted from webhook or inferred
    patient_phone: str             # Patient's phone number for SMS
    requested_service: str         # Service type (e.g., "Physio Assessment")
    preferred_time: str            # User's preference (e.g., "Tuesday 3pm")
    clinic_id: str                 # Multi-tenant identifier
    pms_type: str                  # "cliniko" | "writeupp" | "jane" | "tm3"
    api_key: str                   # Per-clinic PMS API key (injected from Firestore at call time)
    base_url: str                  # PMS base URL override (empty = use provider default)
    available_slots: List[str]     # List of available datetime strings
    confirmed_slot: str            # Final confirmed booking slot
    patient_confirmed: bool        # Patient verbal confirmation flag
    response_message: str          # Message to speak back to patient via ElevenLabs
    session_id: str                # Unique identifier for checkpoint threading
    attempt_count: int             # How many slots have been proposed (prevent loops)
    messages: List[str]            # Full conversation transcript
    booking_id: str                # PMS booking ID (returned by booking tool)
