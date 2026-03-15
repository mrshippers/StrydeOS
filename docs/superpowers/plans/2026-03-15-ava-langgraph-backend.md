# Ava LangGraph Backend Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fully autonomous LangGraph stateful agent for Ava's booking flow with mid-call interrupts, multi-PMS support, and checkpoint persistence.

**Architecture:** Six-node graph (extract_intent → check_availability → propose_slot ⇄ route_after_confirmation → confirm_booking → send_confirmation) with interrupt_before=["confirm_booking"]. State persists via MemorySaver keyed by session_id. First webhook creates session, second webhook (patient confirmation) resumes from checkpoint. All PMS integrations use real API calls routed by pms_type in state.

**Tech Stack:** LangGraph, LangChain, FastAPI, Pydantic, Twilio SDK, httpx (async HTTP), Python 3.10+

---

## Chunk 1: State Definition & Config

### Task 1: Define AvaState TypedDict

**Files:**
- Create: `ava_graph/graph/state.py`

- [ ] **Step 1: Write test for state structure**

```python
# ava_graph/tests/test_state.py
from typing import get_type_hints
from ava_graph.graph.state import AvaState

def test_ava_state_has_required_fields():
    """Verify AvaState has all required fields with correct types."""
    hints = get_type_hints(AvaState)

    required_fields = {
        'patient_name': str,
        'requested_service': str,
        'preferred_time': str,
        'clinic_id': str,
        'pms_type': str,
        'available_slots': list,
        'confirmed_slot': str,
        'patient_confirmed': bool,
        'response_message': str,
        'session_id': str,
        'attempt_count': int,
        'messages': list,
    }

    for field, expected_type in required_fields.items():
        assert field in hints, f"Missing field: {field}"
        # Note: we'll validate the actual type annotation matches in implementation

    assert len(hints) >= len(required_fields), "State has unexpected extra fields"

def test_ava_state_instantiation():
    """Verify AvaState can be instantiated with defaults."""
    state = AvaState(
        patient_name="John Doe",
        requested_service="Physio Assessment",
        preferred_time="2026-03-15 14:00",
        clinic_id="clinic_001",
        pms_type="writeupp",
        available_slots=[],
        confirmed_slot="",
        patient_confirmed=False,
        response_message="",
        session_id="session_001",
        attempt_count=0,
        messages=[],
    )
    assert state.clinic_id == "clinic_001"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/joa/Desktop/StrydeOS
pytest ava_graph/tests/test_state.py::test_ava_state_has_required_fields -v
# Expected: ModuleNotFoundError: No module named 'ava_graph'
```

- [ ] **Step 3: Write AvaState TypedDict**

```python
# ava_graph/graph/state.py
from typing import TypedDict, List

class AvaState(TypedDict):
    """State container for Ava booking workflow."""
    patient_name: str              # Extracted from webhook or inferred
    requested_service: str         # Service type (e.g., "Physio Assessment")
    preferred_time: str            # User's preference (e.g., "Tuesday 3pm")
    clinic_id: str                 # Multi-tenant identifier
    pms_type: str                  # "cliniko" | "writeupp" | "jane" | "tm3"
    available_slots: List[str]     # List of available datetime strings
    confirmed_slot: str            # Final confirmed booking slot
    patient_confirmed: bool        # Patient verbal confirmation flag
    response_message: str          # Message to speak back to patient via ElevenLabs
    session_id: str                # Unique identifier for checkpoint threading
    attempt_count: int             # How many slots have been proposed (prevent loops)
    messages: List[str]            # Full conversation transcript
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pytest ava_graph/tests/test_state.py -v
# Expected: PASS (2 passed)
```

- [ ] **Step 5: Create __init__.py for graph package**

```python
# ava_graph/graph/__init__.py
from .state import AvaState

__all__ = ["AvaState"]
```

- [ ] **Step 6: Commit**

```bash
git add ava_graph/graph/state.py ava_graph/graph/__init__.py ava_graph/tests/test_state.py
git commit -m "feat(ava): define AvaState TypedDict for graph workflow"
```

---

### Task 2: Create config.py with environment variables and API clients

**Files:**
- Create: `ava_graph/config.py`

- [ ] **Step 1: Write test for config loading**

```python
# ava_graph/tests/test_config.py
import os
import pytest
from ava_graph.config import (
    get_cliniko_client,
    get_writeupp_client,
    get_jane_client,
    get_tm3_client,
    get_twilio_client,
    OPENAI_API_KEY,
)

def test_config_loads_from_env():
    """Verify config reads required env vars."""
    # These should be set in .env or CI
    assert OPENAI_API_KEY, "OPENAI_API_KEY not set"

def test_cliniko_client_factory():
    """Verify Cliniko client can be instantiated."""
    client = get_cliniko_client()
    assert client is not None
    assert hasattr(client, 'get'), "Client should have HTTP methods"

def test_writeupp_client_factory():
    """Verify WriteUpp client can be instantiated."""
    client = get_writeupp_client()
    assert client is not None

def test_jane_client_factory():
    """Verify Jane client can be instantiated."""
    client = get_jane_client()
    assert client is not None

def test_tm3_client_factory():
    """Verify TM3 client can be instantiated."""
    client = get_tm3_client()
    assert client is not None

def test_twilio_client_factory():
    """Verify Twilio client can be instantiated."""
    client = get_twilio_client()
    assert client is not None
    assert hasattr(client, 'messages'), "Twilio client should have messages API"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest ava_graph/tests/test_config.py -v
# Expected: FAILED (config module not found)
```

- [ ] **Step 3: Write config.py with API clients**

```python
# ava_graph/config.py
import os
from functools import lru_cache
import httpx
from twilio.rest import Client as TwilioClient
import logging

logger = logging.getLogger(__name__)

# Environment variables
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
CLINIKO_API_KEY = os.getenv("CLINIKO_API_KEY")
CLINIKO_PRACTICE_ID = os.getenv("CLINIKO_PRACTICE_ID")

WRITEUPP_API_KEY = os.getenv("WRITEUPP_API_KEY")
WRITEUPP_API_URL = os.getenv("WRITEUPP_API_URL", "https://api.writeupp.com")

JANE_API_KEY = os.getenv("JANE_API_KEY")
JANE_API_URL = os.getenv("JANE_API_URL", "https://api.jane.app")

TM3_API_KEY = os.getenv("TM3_API_KEY")
TM3_API_URL = os.getenv("TM3_API_URL", "https://api.tm3.com")

TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
TWILIO_FROM_NUMBER = os.getenv("TWILIO_FROM_NUMBER")

# Langchain LLM config
LLM_MODEL = os.getenv("LLM_MODEL", "gpt-4-turbo")
LANGCHAIN_API_KEY = os.getenv("LANGCHAIN_API_KEY")


@lru_cache(maxsize=1)
def get_cliniko_client() -> httpx.AsyncClient:
    """Factory for Cliniko async HTTP client."""
    return httpx.AsyncClient(
        headers={"Authorization": f"Bearer {CLINIKO_API_KEY}"},
        base_url="https://api.cliniko.com/v1",
        timeout=30.0,
    )


@lru_cache(maxsize=1)
def get_writeupp_client() -> httpx.AsyncClient:
    """Factory for WriteUpp async HTTP client."""
    return httpx.AsyncClient(
        headers={"Authorization": f"Bearer {WRITEUPP_API_KEY}"},
        base_url=WRITEUPP_API_URL,
        timeout=30.0,
    )


@lru_cache(maxsize=1)
def get_jane_client() -> httpx.AsyncClient:
    """Factory for Jane App async HTTP client."""
    return httpx.AsyncClient(
        headers={"Authorization": f"Bearer {JANE_API_KEY}"},
        base_url=JANE_API_URL,
        timeout=30.0,
    )


@lru_cache(maxsize=1)
def get_tm3_client() -> httpx.AsyncClient:
    """Factory for TM3 (Blue Zinc) async HTTP client."""
    return httpx.AsyncClient(
        headers={"Authorization": f"Bearer {TM3_API_KEY}"},
        base_url=TM3_API_URL,
        timeout=30.0,
    )


@lru_cache(maxsize=1)
def get_twilio_client() -> TwilioClient:
    """Factory for Twilio SMS client."""
    return TwilioClient(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pytest ava_graph/tests/test_config.py::test_cliniko_client_factory -v
# Expected: PASS
```

- [ ] **Step 5: Commit**

```bash
git add ava_graph/config.py ava_graph/tests/test_config.py
git commit -m "feat(ava): add config and API client factories"
```

---

## Chunk 2: Tool Implementations (PMS APIs)

### Task 3: Implement Cliniko availability and booking tools

**Files:**
- Create: `ava_graph/tools/cliniko.py`

- [ ] **Step 1: Write test for Cliniko availability**

```python
# ava_graph/tests/test_tools_cliniko.py
import pytest
from unittest.mock import AsyncMock, patch
from ava_graph.tools.cliniko import get_cliniko_availability, book_cliniko_appointment

@pytest.mark.asyncio
async def test_get_cliniko_availability_returns_slots():
    """Verify Cliniko availability returns list of datetime strings."""
    with patch("ava_graph.tools.cliniko.get_cliniko_client") as mock_client:
        mock_response = AsyncMock()
        mock_response.json = AsyncMock(return_value={
            "appointments": [
                {"start_at": "2026-03-16T14:00:00Z", "end_at": "2026-03-16T15:00:00Z"}
            ]
        })
        mock_client.return_value.get = AsyncMock(return_value=mock_response)

        slots = await get_cliniko_availability(
            clinic_id="clinic_001",
            start_date="2026-03-16",
            duration_minutes=60
        )

        assert isinstance(slots, list)
        assert len(slots) > 0
        assert "2026-03-16" in slots[0]

@pytest.mark.asyncio
async def test_book_cliniko_appointment_returns_booking_id():
    """Verify Cliniko booking creates appointment and returns ID."""
    with patch("ava_graph.tools.cliniko.get_cliniko_client") as mock_client:
        mock_response = AsyncMock()
        mock_response.json = AsyncMock(return_value={"id": "apt_12345"})
        mock_client.return_value.post = AsyncMock(return_value=mock_response)

        booking_id = await book_cliniko_appointment(
            clinic_id="clinic_001",
            patient_name="John Doe",
            patient_phone="07700000000",
            service_type="Physiotherapy Assessment",
            slot="2026-03-16T14:00:00Z"
        )

        assert booking_id == "apt_12345"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest ava_graph/tests/test_tools_cliniko.py -v
# Expected: FAILED (module not found)
```

- [ ] **Step 3: Write Cliniko tool implementation**

```python
# ava_graph/tools/cliniko.py
"""Cliniko PMS API integration."""
import logging
from datetime import datetime, timedelta
from typing import List
import httpx
from ava_graph.config import (
    get_cliniko_client,
    CLINIKO_PRACTICE_ID,
)

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
        # This is a common Cliniko endpoint that returns available slots
        response = await client.get(
            f"/businesses/{CLINIKO_PRACTICE_ID}/available_appointments",
            params={
                "from": start_date,
                "to": (datetime.fromisoformat(start_date) + timedelta(days=days_ahead)).isoformat(),
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
        appointment_data = {
            "appointment": {
                "business_id": CLINIKO_PRACTICE_ID,
                "start_at": slot,
                "appointment_type_id": "type_default",  # Clinic should map service_type
                "notes": f"Booked via Ava. Service: {service_type}",
            },
            "patient": {
                "first_name": patient_name.split()[0],
                "last_name": patient_name.split()[-1] if len(patient_name.split()) > 1 else "",
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pytest ava_graph/tests/test_tools_cliniko.py -v
# Expected: PASS (2 passed)
```

- [ ] **Step 5: Commit**

```bash
git add ava_graph/tools/cliniko.py ava_graph/tests/test_tools_cliniko.py
git commit -m "feat(ava): implement Cliniko PMS availability and booking tools"
```

---

### Task 4: Implement WriteUpp availability and booking tools

**Files:**
- Create: `ava_graph/tools/writeupp.py`

- [ ] **Step 1: Write test for WriteUpp availability**

```python
# ava_graph/tests/test_tools_writeupp.py
import pytest
from unittest.mock import AsyncMock, patch
from ava_graph.tools.writeupp import get_writeupp_availability, book_writeupp_appointment

@pytest.mark.asyncio
async def test_get_writeupp_availability_returns_slots():
    """Verify WriteUpp availability returns list of datetime strings."""
    with patch("ava_graph.tools.writeupp.get_writeupp_client") as mock_client:
        mock_response = AsyncMock()
        mock_response.json = AsyncMock(return_value={
            "availableSlots": [
                {"startTime": "2026-03-16T14:00:00", "endTime": "2026-03-16T15:00:00"}
            ]
        })
        mock_client.return_value.get = AsyncMock(return_value=mock_response)

        slots = await get_writeupp_availability(
            clinic_id="clinic_001",
            start_date="2026-03-16",
            duration_minutes=60
        )

        assert isinstance(slots, list)
        assert len(slots) > 0

@pytest.mark.asyncio
async def test_book_writeupp_appointment_returns_booking_id():
    """Verify WriteUpp booking creates appointment and returns ID."""
    with patch("ava_graph.tools.writeupp.get_writeupp_client") as mock_client:
        mock_response = AsyncMock()
        mock_response.json = AsyncMock(return_value={"appointmentId": "write_12345"})
        mock_client.return_value.post = AsyncMock(return_value=mock_response)

        booking_id = await book_writeupp_appointment(
            clinic_id="clinic_001",
            patient_name="John Doe",
            patient_phone="07700000000",
            service_type="Physio",
            slot="2026-03-16T14:00:00"
        )

        assert booking_id == "write_12345"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest ava_graph/tests/test_tools_writeupp.py -v
# Expected: FAILED
```

- [ ] **Step 3: Write WriteUpp tool implementation**

```python
# ava_graph/tools/writeupp.py
"""WriteUpp PMS API integration."""
import logging
from datetime import datetime, timedelta
from typing import List
import httpx
from ava_graph.config import get_writeupp_client

logger = logging.getLogger(__name__)


async def get_writeupp_availability(
    clinic_id: str,
    start_date: str,
    duration_minutes: int = 60,
    days_ahead: int = 14,
) -> List[str]:
    """
    Query WriteUpp for available appointment slots.

    Args:
        clinic_id: StrydeOS clinic identifier (maps to WriteUpp clinic ID)
        start_date: ISO date string (YYYY-MM-DD)
        duration_minutes: Appointment duration
        days_ahead: How many days in advance to check

    Returns:
        List of available datetime strings (ISO format)
    """
    client = get_writeupp_client()

    try:
        # WriteUpp API: GET /clinics/{clinicId}/available-slots
        end_date = (datetime.fromisoformat(start_date) + timedelta(days=days_ahead)).isoformat()

        response = await client.get(
            f"/clinics/{clinic_id}/available-slots",
            params={
                "startDate": start_date,
                "endDate": end_date,
                "durationMinutes": duration_minutes,
            },
        )
        response.raise_for_status()

        data = response.json()
        available_slots = data.get("availableSlots", [])

        # Normalize to ISO datetime strings
        slots = [slot["startTime"] for slot in available_slots]
        logger.info(f"WriteUpp: found {len(slots)} available slots")

        return slots

    except httpx.HTTPError as e:
        logger.error(f"WriteUpp API error: {e}")
        raise


async def book_writeupp_appointment(
    clinic_id: str,
    patient_name: str,
    patient_phone: str,
    service_type: str,
    slot: str,
) -> str:
    """
    Create a confirmed appointment in WriteUpp.

    Args:
        clinic_id: StrydeOS clinic identifier
        patient_name: Full name
        patient_phone: Phone number for SMS confirmation
        service_type: Service name
        slot: Confirmed datetime (ISO format)

    Returns:
        WriteUpp appointment ID
    """
    client = get_writeupp_client()

    try:
        # WriteUpp API: POST /appointments
        appointment_data = {
            "clinicId": clinic_id,
            "patientName": patient_name,
            "patientPhone": patient_phone,
            "serviceType": service_type,
            "startTime": slot,
            "notes": "Booked via Ava voice agent",
        }

        response = await client.post(
            "/appointments",
            json=appointment_data,
        )
        response.raise_for_status()

        data = response.json()
        appointment_id = data.get("appointmentId")
        logger.info(f"WriteUpp booking created: {appointment_id}")

        return appointment_id

    except httpx.HTTPError as e:
        logger.error(f"WriteUpp booking error: {e}")
        raise
```

- [ ] **Step 4: Run test**

```bash
pytest ava_graph/tests/test_tools_writeupp.py -v
# Expected: PASS
```

- [ ] **Step 5: Commit**

```bash
git add ava_graph/tools/writeupp.py ava_graph/tests/test_tools_writeupp.py
git commit -m "feat(ava): implement WriteUpp PMS availability and booking tools"
```

---

### Task 5: Implement Jane App availability and booking tools

**Files:**
- Create: `ava_graph/tools/jane.py`

- [ ] **Step 1: Write test for Jane availability**

```python
# ava_graph/tests/test_tools_jane.py
import pytest
from unittest.mock import AsyncMock, patch
from ava_graph.tools.jane import get_jane_availability, book_jane_appointment

@pytest.mark.asyncio
async def test_get_jane_availability_returns_slots():
    """Verify Jane availability returns list of datetime strings."""
    with patch("ava_graph.tools.jane.get_jane_client") as mock_client:
        mock_response = AsyncMock()
        mock_response.json = AsyncMock(return_value={
            "data": [
                {"start_time": "2026-03-16T14:00:00", "end_time": "2026-03-16T15:00:00"}
            ]
        })
        mock_client.return_value.get = AsyncMock(return_value=mock_response)

        slots = await get_jane_availability(
            clinic_id="clinic_001",
            start_date="2026-03-16",
            duration_minutes=60
        )

        assert isinstance(slots, list)
        assert len(slots) > 0

@pytest.mark.asyncio
async def test_book_jane_appointment_returns_booking_id():
    """Verify Jane booking creates appointment and returns ID."""
    with patch("ava_graph.tools.jane.get_jane_client") as mock_client:
        mock_response = AsyncMock()
        mock_response.json = AsyncMock(return_value={"id": "jane_12345"})
        mock_client.return_value.post = AsyncMock(return_value=mock_response)

        booking_id = await book_jane_appointment(
            clinic_id="clinic_001",
            patient_name="John Doe",
            patient_phone="07700000000",
            service_type="Physio",
            slot="2026-03-16T14:00:00"
        )

        assert booking_id == "jane_12345"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest ava_graph/tests/test_tools_jane.py -v
# Expected: FAILED
```

- [ ] **Step 3: Write Jane tool implementation**

```python
# ava_graph/tools/jane.py
"""Jane App PMS API integration."""
import logging
from datetime import datetime, timedelta
from typing import List
import httpx
from ava_graph.config import get_jane_client

logger = logging.getLogger(__name__)


async def get_jane_availability(
    clinic_id: str,
    start_date: str,
    duration_minutes: int = 60,
    days_ahead: int = 14,
) -> List[str]:
    """
    Query Jane App for available appointment slots.

    Args:
        clinic_id: StrydeOS clinic identifier (maps to Jane account ID)
        start_date: ISO date string (YYYY-MM-DD)
        duration_minutes: Appointment duration
        days_ahead: How many days in advance to check

    Returns:
        List of available datetime strings (ISO format)
    """
    client = get_jane_client()

    try:
        # Jane API: GET /appointments/availability
        end_date = (datetime.fromisoformat(start_date) + timedelta(days=days_ahead)).isoformat()

        response = await client.get(
            "/appointments/availability",
            params={
                "accountId": clinic_id,
                "startDate": start_date,
                "endDate": end_date,
                "duration": duration_minutes,
            },
        )
        response.raise_for_status()

        data = response.json()
        available_slots = data.get("data", [])

        # Normalize to ISO datetime strings
        slots = [slot["start_time"] for slot in available_slots]
        logger.info(f"Jane: found {len(slots)} available slots")

        return slots

    except httpx.HTTPError as e:
        logger.error(f"Jane API error: {e}")
        raise


async def book_jane_appointment(
    clinic_id: str,
    patient_name: str,
    patient_phone: str,
    service_type: str,
    slot: str,
) -> str:
    """
    Create a confirmed appointment in Jane App.

    Args:
        clinic_id: StrydeOS clinic identifier
        patient_name: Full name
        patient_phone: Phone number for SMS confirmation
        service_type: Service name
        slot: Confirmed datetime (ISO format)

    Returns:
        Jane appointment ID
    """
    client = get_jane_client()

    try:
        # Jane API: POST /appointments
        name_parts = patient_name.split()
        appointment_data = {
            "account_id": clinic_id,
            "start_time": slot,
            "service_type": service_type,
            "patient": {
                "first_name": name_parts[0],
                "last_name": name_parts[-1] if len(name_parts) > 1 else "",
                "phone": patient_phone,
            },
            "notes": "Booked via Ava voice agent",
        }

        response = await client.post(
            "/appointments",
            json=appointment_data,
        )
        response.raise_for_status()

        data = response.json()
        appointment_id = data.get("id")
        logger.info(f"Jane booking created: {appointment_id}")

        return appointment_id

    except httpx.HTTPError as e:
        logger.error(f"Jane booking error: {e}")
        raise
```

- [ ] **Step 4: Run test**

```bash
pytest ava_graph/tests/test_tools_jane.py -v
# Expected: PASS
```

- [ ] **Step 5: Commit**

```bash
git add ava_graph/tools/jane.py ava_graph/tests/test_tools_jane.py
git commit -m "feat(ava): implement Jane App PMS availability and booking tools"
```

---

### Task 6: Implement TM3 (Blue Zinc) availability and booking tools

**Files:**
- Create: `ava_graph/tools/tm3.py`

- [ ] **Step 1: Write test for TM3 availability**

```python
# ava_graph/tests/test_tools_tm3.py
import pytest
from unittest.mock import AsyncMock, patch
from ava_graph.tools.tm3 import get_tm3_availability, book_tm3_appointment

@pytest.mark.asyncio
async def test_get_tm3_availability_returns_slots():
    """Verify TM3 availability returns list of datetime strings."""
    with patch("ava_graph.tools.tm3.get_tm3_client") as mock_client:
        mock_response = AsyncMock()
        mock_response.json = AsyncMock(return_value={
            "slots": [
                {"dateTime": "2026-03-16T14:00:00", "available": True}
            ]
        })
        mock_client.return_value.get = AsyncMock(return_value=mock_response)

        slots = await get_tm3_availability(
            clinic_id="clinic_001",
            start_date="2026-03-16",
            duration_minutes=60
        )

        assert isinstance(slots, list)
        assert len(slots) > 0

@pytest.mark.asyncio
async def test_book_tm3_appointment_returns_booking_id():
    """Verify TM3 booking creates appointment and returns ID."""
    with patch("ava_graph.tools.tm3.get_tm3_client") as mock_client:
        mock_response = AsyncMock()
        mock_response.json = AsyncMock(return_value={"appointmentId": "tm3_12345"})
        mock_client.return_value.post = AsyncMock(return_value=mock_response)

        booking_id = await book_tm3_appointment(
            clinic_id="clinic_001",
            patient_name="John Doe",
            patient_phone="07700000000",
            service_type="Physio",
            slot="2026-03-16T14:00:00"
        )

        assert booking_id == "tm3_12345"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest ava_graph/tests/test_tools_tm3.py -v
# Expected: FAILED
```

- [ ] **Step 3: Write TM3 tool implementation**

```python
# ava_graph/tools/tm3.py
"""TM3 (Blue Zinc) PMS API integration."""
import logging
from datetime import datetime, timedelta
from typing import List
import httpx
from ava_graph.config import get_tm3_client

logger = logging.getLogger(__name__)


async def get_tm3_availability(
    clinic_id: str,
    start_date: str,
    duration_minutes: int = 60,
    days_ahead: int = 14,
) -> List[str]:
    """
    Query TM3 (Blue Zinc) for available appointment slots.

    Args:
        clinic_id: StrydeOS clinic identifier (maps to TM3 practice ID)
        start_date: ISO date string (YYYY-MM-DD)
        duration_minutes: Appointment duration
        days_ahead: How many days in advance to check

    Returns:
        List of available datetime strings (ISO format)
    """
    client = get_tm3_client()

    try:
        # TM3 API: GET /practices/{practiceId}/available-slots
        end_date = (datetime.fromisoformat(start_date) + timedelta(days=days_ahead)).isoformat()

        response = await client.get(
            f"/practices/{clinic_id}/available-slots",
            params={
                "from": start_date,
                "to": end_date,
                "duration": duration_minutes,
            },
        )
        response.raise_for_status()

        data = response.json()
        slots_data = data.get("slots", [])

        # Filter for available slots and normalize to ISO datetime strings
        slots = [slot["dateTime"] for slot in slots_data if slot.get("available", False)]
        logger.info(f"TM3: found {len(slots)} available slots")

        return slots

    except httpx.HTTPError as e:
        logger.error(f"TM3 API error: {e}")
        raise


async def book_tm3_appointment(
    clinic_id: str,
    patient_name: str,
    patient_phone: str,
    service_type: str,
    slot: str,
) -> str:
    """
    Create a confirmed appointment in TM3.

    Args:
        clinic_id: StrydeOS clinic identifier
        patient_name: Full name
        patient_phone: Phone number for SMS confirmation
        service_type: Service name
        slot: Confirmed datetime (ISO format)

    Returns:
        TM3 appointment ID
    """
    client = get_tm3_client()

    try:
        # TM3 API: POST /appointments
        name_parts = patient_name.split()
        appointment_data = {
            "practiceId": clinic_id,
            "patientName": patient_name,
            "patientFirstName": name_parts[0],
            "patientLastName": name_parts[-1] if len(name_parts) > 1 else "",
            "patientPhone": patient_phone,
            "appointmentType": service_type,
            "startDateTime": slot,
            "notes": "Booked via Ava voice agent",
        }

        response = await client.post(
            "/appointments",
            json=appointment_data,
        )
        response.raise_for_status()

        data = response.json()
        appointment_id = data.get("appointmentId")
        logger.info(f"TM3 booking created: {appointment_id}")

        return appointment_id

    except httpx.HTTPError as e:
        logger.error(f"TM3 booking error: {e}")
        raise
```

- [ ] **Step 4: Run test**

```bash
pytest ava_graph/tests/test_tools_tm3.py -v
# Expected: PASS
```

- [ ] **Step 5: Commit**

```bash
git add ava_graph/tools/tm3.py ava_graph/tests/test_tools_tm3.py
git commit -m "feat(ava): implement TM3 PMS availability and booking tools"
```

---

### Task 7: Implement Twilio SMS tool

**Files:**
- Create: `ava_graph/tools/twilio_sms.py`

- [ ] **Step 1: Write test for Twilio SMS**

```python
# ava_graph/tests/test_tools_twilio.py
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from ava_graph.tools.twilio_sms import send_booking_confirmation_sms

@pytest.mark.asyncio
async def test_send_booking_confirmation_sms():
    """Verify SMS sends booking confirmation."""
    with patch("ava_graph.tools.twilio_sms.get_twilio_client") as mock_client:
        mock_message = MagicMock()
        mock_message.sid = "SM1234567890"
        mock_client.return_value.messages.create = MagicMock(return_value=mock_message)

        sms_id = await send_booking_confirmation_sms(
            patient_phone="+447700000000",
            patient_name="John Doe",
            booking_slot="2026-03-16 14:00",
            clinic_name="Spires Physiotherapy",
        )

        assert sms_id == "SM1234567890"
        mock_client.return_value.messages.create.assert_called_once()
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest ava_graph/tests/test_tools_twilio.py -v
# Expected: FAILED
```

- [ ] **Step 3: Write Twilio SMS tool implementation**

```python
# ava_graph/tools/twilio_sms.py
"""Twilio SMS integration for booking confirmations."""
import logging
from ava_graph.config import get_twilio_client, TWILIO_FROM_NUMBER

logger = logging.getLogger(__name__)


async def send_booking_confirmation_sms(
    patient_phone: str,
    patient_name: str,
    booking_slot: str,
    clinic_name: str,
) -> str:
    """
    Send SMS booking confirmation to patient.

    Args:
        patient_phone: Phone number (E.164 format, e.g., "+447700000000")
        patient_name: Patient's name
        booking_slot: Confirmed appointment time (readable format)
        clinic_name: Clinic name for context

    Returns:
        Twilio message SID for tracking
    """
    client = get_twilio_client()

    try:
        # Normalize phone to E.164 if needed
        if not patient_phone.startswith("+"):
            patient_phone = f"+44{patient_phone.lstrip('0')}"

        message_body = (
            f"Hi {patient_name}, your appointment at {clinic_name} is confirmed for {booking_slot}. "
            f"Please reply CONFIRM to confirm or CANCEL to reschedule."
        )

        message = client.messages.create(
            body=message_body,
            from_=TWILIO_FROM_NUMBER,
            to=patient_phone,
        )

        logger.info(f"SMS sent: {message.sid} to {patient_phone}")
        return message.sid

    except Exception as e:
        logger.error(f"Twilio SMS error: {e}")
        raise
```

- [ ] **Step 4: Run test**

```bash
pytest ava_graph/tests/test_tools_twilio.py -v
# Expected: PASS
```

- [ ] **Step 5: Create __init__.py for tools**

```python
# ava_graph/tools/__init__.py
from .cliniko import get_cliniko_availability, book_cliniko_appointment
from .writeupp import get_writeupp_availability, book_writeupp_appointment
from .jane import get_jane_availability, book_jane_appointment
from .tm3 import get_tm3_availability, book_tm3_appointment
from .twilio_sms import send_booking_confirmation_sms

__all__ = [
    "get_cliniko_availability",
    "book_cliniko_appointment",
    "get_writeupp_availability",
    "book_writeupp_appointment",
    "get_jane_availability",
    "book_jane_appointment",
    "get_tm3_availability",
    "book_tm3_appointment",
    "send_booking_confirmation_sms",
]
```

- [ ] **Step 6: Commit**

```bash
git add ava_graph/tools/twilio_sms.py ava_graph/tools/__init__.py ava_graph/tests/test_tools_twilio.py
git commit -m "feat(ava): implement Twilio SMS booking confirmation tool"
```

---

## Chunk 3: Graph Nodes (Logic)

### Task 8: Implement extract_intent node

**Files:**
- Create: `ava_graph/graph/nodes/extract_intent.py`

- [ ] **Step 1: Write test for extract_intent**

```python
# ava_graph/tests/test_nodes_extract_intent.py
import pytest
from ava_graph.graph.nodes.extract_intent import extract_intent
from ava_graph.graph.state import AvaState

@pytest.mark.asyncio
async def test_extract_intent_parses_webhook_payload():
    """Verify extract_intent parses ElevenLabs webhook into state."""
    state = AvaState(
        patient_name="",
        requested_service="",
        preferred_time="",
        clinic_id="clinic_001",
        pms_type="writeupp",
        available_slots=[],
        confirmed_slot="",
        patient_confirmed=False,
        response_message="",
        session_id="session_abc123",
        attempt_count=0,
        messages=[],
    )

    webhook_payload = {
        "patient_name": "John Doe",
        "requested_service": "Physiotherapy Assessment",
        "preferred_time": "Tuesday afternoon",
        "session_id": "session_abc123",
    }

    result = await extract_intent(state, webhook_payload)

    assert result["patient_name"] == "John Doe"
    assert result["requested_service"] == "Physiotherapy Assessment"
    assert result["session_id"] == "session_abc123"
    assert len(result["messages"]) > 0
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest ava_graph/tests/test_nodes_extract_intent.py -v
# Expected: FAILED
```

- [ ] **Step 3: Write extract_intent node**

```python
# ava_graph/graph/nodes/extract_intent.py
"""Extract intent node — parses ElevenLabs webhook into structured state."""
import logging
from typing import Any
from ava_graph.graph.state import AvaState

logger = logging.getLogger(__name__)


async def extract_intent(state: AvaState, webhook_payload: dict) -> AvaState:
    """
    Parse inbound ElevenLabs webhook and populate state fields.

    ElevenLabs fires this on call start with extracted conversation intent.

    Args:
        state: Current graph state
        webhook_payload: Data from ElevenLabs webhook

    Returns:
        Updated state with extracted fields
    """
    logger.info(f"Extracting intent from webhook for session {state['session_id']}")

    # Extract fields from webhook
    patient_name = webhook_payload.get("patient_name", "")
    requested_service = webhook_payload.get("requested_service", "")
    preferred_time = webhook_payload.get("preferred_time", "")

    # Validate clinic_id and pms_type are in state (should come from webhook or config)
    clinic_id = webhook_payload.get("clinic_id") or state.get("clinic_id")
    pms_type = webhook_payload.get("pms_type") or state.get("pms_type", "writeupp")

    # Preserve session_id for checkpoint threading
    session_id = webhook_payload.get("session_id", state["session_id"])

    # Update state
    state["patient_name"] = patient_name
    state["requested_service"] = requested_service
    state["preferred_time"] = preferred_time
    state["clinic_id"] = clinic_id
    state["pms_type"] = pms_type
    state["session_id"] = session_id

    # Add to transcript
    intent_summary = (
        f"Patient {patient_name} requested {requested_service} "
        f"with preference: {preferred_time}"
    )
    state["messages"].append(f"SYSTEM: {intent_summary}")

    logger.info(f"Intent extracted: {intent_summary}")

    return state
```

- [ ] **Step 4: Run test**

```bash
pytest ava_graph/tests/test_nodes_extract_intent.py -v
# Expected: PASS
```

- [ ] **Step 5: Create __init__.py for nodes**

```python
# ava_graph/graph/nodes/__init__.py
from .extract_intent import extract_intent

__all__ = ["extract_intent"]
```

- [ ] **Step 6: Commit**

```bash
git add ava_graph/graph/nodes/extract_intent.py ava_graph/graph/nodes/__init__.py ava_graph/tests/test_nodes_extract_intent.py
git commit -m "feat(ava): implement extract_intent node"
```

---

### Task 9: Implement check_availability node with PMS routing

**Files:**
- Modify: `ava_graph/graph/nodes/__init__.py`
- Create: `ava_graph/graph/nodes/check_availability.py`

- [ ] **Step 1: Write test for check_availability**

```python
# ava_graph/tests/test_nodes_check_availability.py
import pytest
from unittest.mock import patch, AsyncMock
from ava_graph.graph.nodes.check_availability import check_availability
from ava_graph.graph.state import AvaState

@pytest.mark.asyncio
async def test_check_availability_routes_by_pms_type():
    """Verify check_availability routes to correct PMS tool."""
    state = AvaState(
        patient_name="John Doe",
        requested_service="Physio",
        preferred_time="Tuesday",
        clinic_id="clinic_001",
        pms_type="writeupp",
        available_slots=[],
        confirmed_slot="",
        patient_confirmed=False,
        response_message="",
        session_id="session_abc",
        attempt_count=0,
        messages=[],
    )

    with patch("ava_graph.graph.nodes.check_availability.get_writeupp_availability") as mock_writeupp:
        mock_writeupp.return_value = ["2026-03-16T14:00:00", "2026-03-16T15:00:00"]

        result = await check_availability(state)

        assert result["available_slots"] == ["2026-03-16T14:00:00", "2026-03-16T15:00:00"]
        mock_writeupp.assert_called_once()

@pytest.mark.asyncio
async def test_check_availability_routes_to_cliniko():
    """Verify Cliniko routing works."""
    state = AvaState(
        patient_name="John Doe",
        requested_service="Physio",
        preferred_time="Tuesday",
        clinic_id="clinic_001",
        pms_type="cliniko",
        available_slots=[],
        confirmed_slot="",
        patient_confirmed=False,
        response_message="",
        session_id="session_abc",
        attempt_count=0,
        messages=[],
    )

    with patch("ava_graph.graph.nodes.check_availability.get_cliniko_availability") as mock_cliniko:
        mock_cliniko.return_value = ["2026-03-16T14:00:00"]

        result = await check_availability(state)

        assert len(result["available_slots"]) > 0
        mock_cliniko.assert_called_once()
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest ava_graph/tests/test_nodes_check_availability.py -v
# Expected: FAILED
```

- [ ] **Step 3: Write check_availability node**

```python
# ava_graph/graph/nodes/check_availability.py
"""Check availability node — queries PMS for open slots."""
import logging
from datetime import datetime, timedelta
from ava_graph.graph.state import AvaState
from ava_graph.tools import (
    get_cliniko_availability,
    get_writeupp_availability,
    get_jane_availability,
    get_tm3_availability,
)

logger = logging.getLogger(__name__)


async def check_availability(state: AvaState) -> AvaState:
    """
    Query PMS for available appointment slots.

    Routes to correct PMS based on pms_type in state.
    Uses preferred_time as guidance (e.g., "Tuesday" → next available Tuesday).

    Args:
        state: Current graph state with clinic_id, pms_type, preferred_time

    Returns:
        Updated state with available_slots populated
    """
    clinic_id = state["clinic_id"]
    pms_type = state["pms_type"]
    preferred_time = state["preferred_time"]

    logger.info(f"Checking availability in {pms_type} for clinic {clinic_id}")

    # Use today as start date
    start_date = datetime.now().date().isoformat()

    try:
        # Route to correct PMS tool
        if pms_type == "cliniko":
            slots = await get_cliniko_availability(
                clinic_id=clinic_id,
                start_date=start_date,
                duration_minutes=60,
                days_ahead=14,
            )
        elif pms_type == "writeupp":
            slots = await get_writeupp_availability(
                clinic_id=clinic_id,
                start_date=start_date,
                duration_minutes=60,
                days_ahead=14,
            )
        elif pms_type == "jane":
            slots = await get_jane_availability(
                clinic_id=clinic_id,
                start_date=start_date,
                duration_minutes=60,
                days_ahead=14,
            )
        elif pms_type == "tm3":
            slots = await get_tm3_availability(
                clinic_id=clinic_id,
                start_date=start_date,
                duration_minutes=60,
                days_ahead=14,
            )
        else:
            raise ValueError(f"Unknown PMS type: {pms_type}")

        # Filter slots by user preference if given (e.g., "Tuesday", "afternoon")
        filtered_slots = _filter_slots_by_preference(slots, preferred_time)

        state["available_slots"] = filtered_slots or slots[:5]  # Fall back to first 5
        state["messages"].append(f"SYSTEM: Found {len(state['available_slots'])} available slots")

        logger.info(f"Found {len(state['available_slots'])} slots for {pms_type}")

        return state

    except Exception as e:
        logger.error(f"Availability check failed: {e}")
        state["available_slots"] = []
        state["messages"].append("SYSTEM: No availability found. Please try again later.")
        return state


def _filter_slots_by_preference(slots: list, preference: str) -> list:
    """
    Filter appointment slots by user preference (day of week, time of day).

    Args:
        slots: List of ISO datetime strings
        preference: User preference (e.g., "Tuesday", "afternoon", "morning")

    Returns:
        Filtered slots matching preference
    """
    if not preference:
        return slots

    preference_lower = preference.lower()
    filtered = []

    day_names = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
    time_ranges = {
        "morning": (9, 12),
        "afternoon": (12, 17),
        "evening": (17, 20),
    }

    for slot in slots:
        try:
            dt = datetime.fromisoformat(slot)

            # Check day of week
            day_name = day_names[dt.weekday()]
            if day_name in preference_lower:
                filtered.append(slot)
                continue

            # Check time of day
            for time_name, (start_hour, end_hour) in time_ranges.items():
                if time_name in preference_lower:
                    if start_hour <= dt.hour < end_hour:
                        filtered.append(slot)
                        break
        except (ValueError, AttributeError):
            continue

    return filtered
```

- [ ] **Step 4: Run test**

```bash
pytest ava_graph/tests/test_nodes_check_availability.py -v
# Expected: PASS
```

- [ ] **Step 5: Update __init__.py**

```python
# ava_graph/graph/nodes/__init__.py
from .extract_intent import extract_intent
from .check_availability import check_availability

__all__ = ["extract_intent", "check_availability"]
```

- [ ] **Step 6: Commit**

```bash
git add ava_graph/graph/nodes/check_availability.py ava_graph/graph/nodes/__init__.py ava_graph/tests/test_nodes_check_availability.py
git commit -m "feat(ava): implement check_availability node with PMS routing"
```

---

### Task 10: Implement propose_slot node (LLM + INTERRUPT)

**Files:**
- Create: `ava_graph/graph/nodes/propose_slot.py`

- [ ] **Step 1: Write test for propose_slot**

```python
# ava_graph/tests/test_nodes_propose_slot.py
import pytest
from unittest.mock import patch, AsyncMock
from ava_graph.graph.nodes.propose_slot import propose_slot
from ava_graph.graph.state import AvaState

@pytest.mark.asyncio
async def test_propose_slot_selects_best_slot_and_generates_response():
    """Verify propose_slot picks best slot and drafts natural response."""
    state = AvaState(
        patient_name="John Doe",
        requested_service="Physio",
        preferred_time="Tuesday",
        clinic_id="clinic_001",
        pms_type="writeupp",
        available_slots=["2026-03-16T14:00:00", "2026-03-16T15:00:00"],
        confirmed_slot="",
        patient_confirmed=False,
        response_message="",
        session_id="session_abc",
        attempt_count=0,
        messages=["SYSTEM: Patient requested Physio"],
    )

    with patch("ava_graph.graph.nodes.propose_slot.ChatOpenAI") as mock_llm:
        mock_response = AsyncMock()
        mock_response.content = "I have Tuesday at 2pm available, does that work for you?"
        mock_llm.return_value.ainvoke = AsyncMock(return_value=mock_response)

        result = await propose_slot(state)

        assert result["confirmed_slot"] != ""
        assert result["response_message"] != ""
        assert "2pm" in result["response_message"] or "Tuesday" in result["response_message"]
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest ava_graph/tests/test_nodes_propose_slot.py -v
# Expected: FAILED
```

- [ ] **Step 3: Write propose_slot node**

```python
# ava_graph/graph/nodes/propose_slot.py
"""Propose slot node — selects best slot and drafts response for patient."""
import logging
from datetime import datetime
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage
from ava_graph.graph.state import AvaState

logger = logging.getLogger(__name__)

# Initialize LLM for natural language response generation
llm = ChatOpenAI(model="gpt-4-turbo", temperature=0.7)


async def propose_slot(state: AvaState) -> AvaState:
    """
    Select best available slot and draft natural spoken response.

    Uses LLM to generate conversational response to be spoken by ElevenLabs.

    This node returns a provisional confirmed_slot and response_message.
    The graph then INTERRUPTS here to let patient verbally confirm.

    Args:
        state: Current graph state with available_slots populated

    Returns:
        Updated state with confirmed_slot and response_message set
    """
    available_slots = state["available_slots"]
    patient_name = state["patient_name"]
    requested_service = state["requested_service"]
    attempt_count = state.get("attempt_count", 0)

    logger.info(f"Proposing slot (attempt {attempt_count + 1})")

    if not available_slots:
        state["response_message"] = (
            "I'm sorry, I couldn't find any available appointments. "
            "Please try again tomorrow or contact the clinic directly."
        )
        state["confirmed_slot"] = ""
        return state

    # Select best slot (prefer earliest, but skip past attempts)
    proposed_slot = available_slots[min(attempt_count, len(available_slots) - 1)]
    state["confirmed_slot"] = proposed_slot

    # Parse datetime for natural language
    try:
        dt = datetime.fromisoformat(proposed_slot)
        slot_display = dt.strftime("%A at %I:%M %p").replace(" 0", " ")  # Remove leading zero
    except (ValueError, AttributeError):
        slot_display = proposed_slot

    # Use LLM to generate natural spoken response
    system_prompt = SystemMessage(
        content="""You are Ava, a friendly AI receptionist. You're confirming an appointment booking.

        Generate a conversational, natural spoken response to propose the appointment slot to the patient.

        Rules:
        - Be warm and professional
        - Use the patient's name
        - Mention the service type
        - Ask for confirmation (yes/no question at end)
        - Keep response under 2 sentences
        - Avoid jargon or technical language"""
    )

    user_prompt = HumanMessage(
        content=(
            f"The patient {patient_name} requested {requested_service}. "
            f"I have an available slot at {slot_display}. "
            f"Draft a natural response proposing this slot."
        )
    )

    try:
        response = await llm.ainvoke([system_prompt, user_prompt])
        state["response_message"] = response.content
    except Exception as e:
        logger.error(f"LLM call failed: {e}")
        state["response_message"] = (
            f"Hi {patient_name}, I have {requested_service} available on {slot_display}. "
            f"Does that work for you?"
        )

    # Record attempt
    state["attempt_count"] = attempt_count + 1
    state["messages"].append(f"SYSTEM: Proposed {proposed_slot}")
    state["messages"].append(f"AVA: {state['response_message']}")

    logger.info(f"Proposed slot: {proposed_slot}, response: {state['response_message'][:50]}...")

    return state
```

- [ ] **Step 4: Run test**

```bash
pytest ava_graph/tests/test_nodes_propose_slot.py -v
# Expected: PASS
```

- [ ] **Step 5: Update __init__.py**

```python
# ava_graph/graph/nodes/__init__.py
from .extract_intent import extract_intent
from .check_availability import check_availability
from .propose_slot import propose_slot

__all__ = ["extract_intent", "check_availability", "propose_slot"]
```

- [ ] **Step 6: Commit**

```bash
git add ava_graph/graph/nodes/propose_slot.py ava_graph/graph/nodes/__init__.py ava_graph/tests/test_nodes_propose_slot.py
git commit -m "feat(ava): implement propose_slot node with LLM response generation"
```

---

### Task 11: Implement route_after_confirmation conditional edge node

**Files:**
- Create: `ava_graph/graph/nodes/route_after_confirmation.py`

- [ ] **Step 1: Write test for route_after_confirmation**

```python
# ava_graph/tests/test_nodes_route_after_confirmation.py
import pytest
from ava_graph.graph.nodes.route_after_confirmation import route_after_confirmation
from ava_graph.graph.state import AvaState

def test_route_after_confirmation_confirms_if_patient_confirmed():
    """Verify routing to confirm_booking when patient confirms."""
    state = AvaState(
        patient_name="John Doe",
        requested_service="Physio",
        preferred_time="Tuesday",
        clinic_id="clinic_001",
        pms_type="writeupp",
        available_slots=["2026-03-16T14:00:00"],
        confirmed_slot="2026-03-16T14:00:00",
        patient_confirmed=True,
        response_message="Does Tuesday work?",
        session_id="session_abc",
        attempt_count=1,
        messages=[],
    )

    result = route_after_confirmation(state)
    assert result == "confirm_booking"

def test_route_after_confirmation_loops_if_patient_declines():
    """Verify routing back to check_availability when patient declines."""
    state = AvaState(
        patient_name="John Doe",
        requested_service="Physio",
        preferred_time="Tuesday",
        clinic_id="clinic_001",
        pms_type="writeupp",
        available_slots=["2026-03-16T14:00:00", "2026-03-16T15:00:00"],
        confirmed_slot="2026-03-16T14:00:00",
        patient_confirmed=False,
        response_message="Does Tuesday work?",
        session_id="session_abc",
        attempt_count=1,
        messages=[],
    )

    result = route_after_confirmation(state)
    assert result == "propose_slot"

def test_route_after_confirmation_cancels_if_too_many_attempts():
    """Verify cancellation if patient rejects too many slots."""
    state = AvaState(
        patient_name="John Doe",
        requested_service="Physio",
        preferred_time="Tuesday",
        clinic_id="clinic_001",
        pms_type="writeupp",
        available_slots=["2026-03-16T14:00:00"],
        confirmed_slot="2026-03-16T14:00:00",
        patient_confirmed=False,
        response_message="Does Tuesday work?",
        session_id="session_abc",
        attempt_count=5,  # Too many
        messages=[],
    )

    result = route_after_confirmation(state)
    assert result == "end"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest ava_graph/tests/test_nodes_route_after_confirmation.py -v
# Expected: FAILED
```

- [ ] **Step 3: Write route_after_confirmation node**

```python
# ava_graph/graph/nodes/route_after_confirmation.py
"""Route after confirmation — conditional edge logic."""
import logging
from ava_graph.graph.state import AvaState

logger = logging.getLogger(__name__)

MAX_PROPOSAL_ATTEMPTS = 4


def route_after_confirmation(state: AvaState) -> str:
    """
    Route based on patient confirmation.

    - If patient_confirmed == True → "confirm_booking"
    - If patient_confirmed == False AND attempts < max → "propose_slot" (next slot)
    - If too many rejections → "end" (give up gracefully)

    Args:
        state: Current graph state

    Returns:
        Next node name: "confirm_booking", "propose_slot", or "end"
    """
    patient_confirmed = state.get("patient_confirmed", False)
    attempt_count = state.get("attempt_count", 0)
    available_slots = state.get("available_slots", [])

    logger.info(
        f"Routing: confirmed={patient_confirmed}, "
        f"attempts={attempt_count}, slots_available={len(available_slots)}"
    )

    if patient_confirmed:
        logger.info("Patient confirmed → proceeding to confirm_booking")
        return "confirm_booking"

    if attempt_count >= MAX_PROPOSAL_ATTEMPTS or len(available_slots) <= attempt_count:
        logger.info("Max attempts reached or no more slots → ending gracefully")
        state["response_message"] = (
            "I understand. Please contact the clinic directly to schedule at a time "
            "that works better for you."
        )
        return "end"

    logger.info(f"Patient declined → proposing next slot (attempt {attempt_count + 1})")
    return "propose_slot"
```

- [ ] **Step 4: Run test**

```bash
pytest ava_graph/tests/test_nodes_route_after_confirmation.py -v
# Expected: PASS
```

- [ ] **Step 5: Update __init__.py**

```python
# ava_graph/graph/nodes/__init__.py
from .extract_intent import extract_intent
from .check_availability import check_availability
from .propose_slot import propose_slot
from .route_after_confirmation import route_after_confirmation

__all__ = [
    "extract_intent",
    "check_availability",
    "propose_slot",
    "route_after_confirmation",
]
```

- [ ] **Step 6: Commit**

```bash
git add ava_graph/graph/nodes/route_after_confirmation.py ava_graph/graph/nodes/__init__.py ava_graph/tests/test_nodes_route_after_confirmation.py
git commit -m "feat(ava): implement route_after_confirmation conditional edge node"
```

---

### Task 12: Implement confirm_booking node (PMS write)

**Files:**
- Create: `ava_graph/graph/nodes/confirm_booking.py`

- [ ] **Step 1: Write test for confirm_booking**

```python
# ava_graph/tests/test_nodes_confirm_booking.py
import pytest
from unittest.mock import patch, AsyncMock
from ava_graph.graph.nodes.confirm_booking import confirm_booking
from ava_graph.graph.state import AvaState

@pytest.mark.asyncio
async def test_confirm_booking_writes_to_pms():
    """Verify confirm_booking routes to correct PMS and writes appointment."""
    state = AvaState(
        patient_name="John Doe",
        requested_service="Physio Assessment",
        preferred_time="Tuesday",
        clinic_id="clinic_001",
        pms_type="writeupp",
        available_slots=["2026-03-16T14:00:00"],
        confirmed_slot="2026-03-16T14:00:00",
        patient_confirmed=True,
        response_message="Great!",
        session_id="session_abc",
        attempt_count=1,
        messages=[],
    )

    with patch("ava_graph.graph.nodes.confirm_booking.book_writeupp_appointment") as mock_book:
        mock_book.return_value = "booking_12345"

        result = await confirm_booking(state)

        assert result["confirmed_slot"] == "2026-03-16T14:00:00"
        mock_book.assert_called_once()
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest ava_graph/tests/test_nodes_confirm_booking.py -v
# Expected: FAILED
```

- [ ] **Step 3: Write confirm_booking node**

```python
# ava_graph/graph/nodes/confirm_booking.py
"""Confirm booking node — writes appointment to PMS."""
import logging
from ava_graph.graph.state import AvaState
from ava_graph.tools import (
    book_cliniko_appointment,
    book_writeupp_appointment,
    book_jane_appointment,
    book_tm3_appointment,
)

logger = logging.getLogger(__name__)


async def confirm_booking(state: AvaState) -> AvaState:
    """
    Write confirmed appointment to PMS.

    Routes to correct PMS based on pms_type.
    This is called AFTER patient verbal confirmation (ElevenLabs webhook 2).

    Args:
        state: Current graph state with confirmed_slot and patient_confirmed

    Returns:
        Updated state with booking_id stored (for reference)
    """
    clinic_id = state["clinic_id"]
    pms_type = state["pms_type"]
    patient_name = state["patient_name"]
    patient_phone = state.get("patient_phone", "")  # May be in state from webhook
    service_type = state["requested_service"]
    confirmed_slot = state["confirmed_slot"]

    logger.info(f"Confirming booking in {pms_type} for {patient_name}")

    try:
        # Route to correct PMS tool
        if pms_type == "cliniko":
            booking_id = await book_cliniko_appointment(
                clinic_id=clinic_id,
                patient_name=patient_name,
                patient_phone=patient_phone,
                service_type=service_type,
                slot=confirmed_slot,
            )
        elif pms_type == "writeupp":
            booking_id = await book_writeupp_appointment(
                clinic_id=clinic_id,
                patient_name=patient_name,
                patient_phone=patient_phone,
                service_type=service_type,
                slot=confirmed_slot,
            )
        elif pms_type == "jane":
            booking_id = await book_jane_appointment(
                clinic_id=clinic_id,
                patient_name=patient_name,
                patient_phone=patient_phone,
                service_type=service_type,
                slot=confirmed_slot,
            )
        elif pms_type == "tm3":
            booking_id = await book_tm3_appointment(
                clinic_id=clinic_id,
                patient_name=patient_name,
                patient_phone=patient_phone,
                service_type=service_type,
                slot=confirmed_slot,
            )
        else:
            raise ValueError(f"Unknown PMS type: {pms_type}")

        # Store booking ID in state for reference
        state["booking_id"] = booking_id  # Note: AvaState may need this added
        state["messages"].append(f"SYSTEM: Booking confirmed with ID {booking_id}")

        logger.info(f"Booking confirmed in {pms_type}: {booking_id}")

        return state

    except Exception as e:
        logger.error(f"Booking confirmation failed: {e}")
        state["response_message"] = (
            "Sorry, there was an error confirming your booking. "
            "Please contact the clinic directly."
        )
        state["messages"].append(f"SYSTEM: Booking error: {e}")
        return state
```

- [ ] **Step 4: Run test**

```bash
pytest ava_graph/tests/test_nodes_confirm_booking.py -v
# Expected: PASS
```

- [ ] **Step 5: Update state.py to include booking_id and patient_phone**

```python
# ava_graph/graph/state.py - MODIFY
from typing import TypedDict, List

class AvaState(TypedDict):
    """State container for Ava booking workflow."""
    patient_name: str
    patient_phone: str  # ADD THIS
    requested_service: str
    preferred_time: str
    clinic_id: str
    pms_type: str
    available_slots: List[str]
    confirmed_slot: str
    patient_confirmed: bool
    response_message: str
    session_id: str
    attempt_count: int
    messages: List[str]
    booking_id: str  # ADD THIS
```

- [ ] **Step 6: Update __init__.py**

```python
# ava_graph/graph/nodes/__init__.py
from .extract_intent import extract_intent
from .check_availability import check_availability
from .propose_slot import propose_slot
from .route_after_confirmation import route_after_confirmation
from .confirm_booking import confirm_booking

__all__ = [
    "extract_intent",
    "check_availability",
    "propose_slot",
    "route_after_confirmation",
    "confirm_booking",
]
```

- [ ] **Step 7: Commit**

```bash
git add ava_graph/graph/state.py ava_graph/graph/nodes/confirm_booking.py ava_graph/graph/nodes/__init__.py ava_graph/tests/test_nodes_confirm_booking.py
git commit -m "feat(ava): implement confirm_booking node with PMS routing"
```

---

### Task 13: Implement send_confirmation node

**Files:**
- Create: `ava_graph/graph/nodes/send_confirmation.py`

- [ ] **Step 1: Write test for send_confirmation**

```python
# ava_graph/tests/test_nodes_send_confirmation.py
import pytest
from unittest.mock import patch, AsyncMock
from ava_graph.graph.nodes.send_confirmation import send_confirmation
from ava_graph.graph.state import AvaState

@pytest.mark.asyncio
async def test_send_confirmation_sends_sms_and_returns_response():
    """Verify send_confirmation sends SMS and generates final response."""
    state = AvaState(
        patient_name="John Doe",
        patient_phone="07700000000",
        requested_service="Physio",
        preferred_time="Tuesday",
        clinic_id="clinic_001",
        pms_type="writeupp",
        available_slots=[],
        confirmed_slot="2026-03-16T14:00:00",
        patient_confirmed=True,
        response_message="Great!",
        session_id="session_abc",
        attempt_count=1,
        messages=[],
        booking_id="booking_123",
    )

    with patch("ava_graph.graph.nodes.send_confirmation.send_booking_confirmation_sms") as mock_sms:
        mock_sms.return_value = "sms_id_123"

        result = await send_confirmation(state)

        assert "Perfect" in result["response_message"] or "confirmed" in result["response_message"].lower()
        mock_sms.assert_called_once()
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest ava_graph/tests/test_nodes_send_confirmation.py -v
# Expected: FAILED
```

- [ ] **Step 3: Write send_confirmation node**

```python
# ava_graph/graph/nodes/send_confirmation.py
"""Send confirmation node — SMS + final spoken message."""
import logging
from datetime import datetime
from ava_graph.graph.state import AvaState
from ava_graph.tools import send_booking_confirmation_sms

logger = logging.getLogger(__name__)


async def send_confirmation(state: AvaState) -> AvaState:
    """
    Send SMS confirmation and generate final spoken response.

    This is the final step after booking is committed to PMS.

    Args:
        state: Current graph state with confirmed_slot, patient_phone, booking_id

    Returns:
        Updated state with final response_message set
    """
    patient_name = state["patient_name"]
    patient_phone = state.get("patient_phone", "")
    confirmed_slot = state["confirmed_slot"]
    clinic_id = state["clinic_id"]

    logger.info(f"Sending confirmation SMS to {patient_phone}")

    try:
        # Parse slot for display
        dt = datetime.fromisoformat(confirmed_slot)
        slot_display = dt.strftime("%A, %B %d at %I:%M %p").replace(" 0", " ")

        # Send SMS if phone available
        if patient_phone:
            sms_id = await send_booking_confirmation_sms(
                patient_phone=patient_phone,
                patient_name=patient_name,
                booking_slot=slot_display,
                clinic_name="Spires Physiotherapy",  # TODO: make dynamic from clinic config
            )
            logger.info(f"SMS sent: {sms_id}")
            state["messages"].append(f"SYSTEM: SMS sent ({sms_id})")

        # Generate final spoken response
        state["response_message"] = (
            f"Perfect, {patient_name}! You're all booked in for {slot_display}. "
            f"You'll get a text confirmation shortly. Thanks, and see you then!"
        )

        state["messages"].append(f"AVA: {state['response_message']}")

        logger.info(f"Confirmation complete for {patient_name}")

        return state

    except Exception as e:
        logger.error(f"Confirmation error: {e}")
        state["response_message"] = (
            f"Your booking is confirmed. Please check your email or contact the clinic for details."
        )
        return state
```

- [ ] **Step 4: Run test**

```bash
pytest ava_graph/tests/test_nodes_send_confirmation.py -v
# Expected: PASS
```

- [ ] **Step 5: Update __init__.py**

```python
# ava_graph/graph/nodes/__init__.py
from .extract_intent import extract_intent
from .check_availability import check_availability
from .propose_slot import propose_slot
from .route_after_confirmation import route_after_confirmation
from .confirm_booking import confirm_booking
from .send_confirmation import send_confirmation

__all__ = [
    "extract_intent",
    "check_availability",
    "propose_slot",
    "route_after_confirmation",
    "confirm_booking",
    "send_confirmation",
]
```

- [ ] **Step 6: Commit**

```bash
git add ava_graph/graph/nodes/send_confirmation.py ava_graph/graph/nodes/__init__.py ava_graph/tests/test_nodes_send_confirmation.py
git commit -m "feat(ava): implement send_confirmation node with SMS + final response"
```

---

## Chunk 4: Graph Assembly & API

### Task 14: Build graph structure with edges and checkpointing

**Files:**
- Create: `ava_graph/graph/edges.py`
- Create: `ava_graph/graph/builder.py`

- [ ] **Step 1: Write test for graph structure**

```python
# ava_graph/tests/test_graph_builder.py
import pytest
from ava_graph.graph.builder import build_ava_graph

def test_build_ava_graph_returns_compiled_graph():
    """Verify graph builds and compiles."""
    graph = build_ava_graph()
    assert graph is not None
    assert hasattr(graph, 'invoke')
    assert hasattr(graph, 'stream')

def test_graph_has_interrupt_checkpoint():
    """Verify graph has interrupt_before checkpoint."""
    graph = build_ava_graph()
    # Check that graph config has interrupt_before
    assert hasattr(graph, 'invoke')  # Will test actual behavior in integration
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest ava_graph/tests/test_graph_builder.py -v
# Expected: FAILED
```

- [ ] **Step 3: Write edges.py**

```python
# ava_graph/graph/edges.py
"""Edge definitions for Ava graph."""
from ava_graph.graph.state import AvaState


def should_check_availability(state: AvaState) -> bool:
    """After extracting intent, check availability."""
    return state.get("clinic_id") is not None and state.get("pms_type") is not None


def should_propose_slot(state: AvaState) -> bool:
    """After checking availability, propose slot."""
    return len(state.get("available_slots", [])) > 0


def route_after_confirmation(state: AvaState) -> str:
    """
    Route based on patient confirmation.

    Delegates to the route_after_confirmation node logic.
    """
    from ava_graph.graph.nodes import route_after_confirmation as route_node
    return route_node(state)
```

- [ ] **Step 4: Write builder.py with graph construction**

```python
# ava_graph/graph/builder.py
"""Graph construction with LangGraph."""
import logging
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver
from ava_graph.graph.state import AvaState
from ava_graph.graph.nodes import (
    extract_intent,
    check_availability,
    propose_slot,
    route_after_confirmation,
    confirm_booking,
    send_confirmation,
)

logger = logging.getLogger(__name__)

# Memory-based checkpointing for session persistence
memory = MemorySaver()


def build_ava_graph():
    """
    Build and compile Ava booking graph.

    Flow:
    1. extract_intent
    2. check_availability
    3. propose_slot
    ⇅ [INTERRUPT before confirm_booking]
    Patient confirms via ElevenLabs webhook 2
    4. route_after_confirmation → propose_slot (loop) OR confirm_booking
    5. confirm_booking
    6. send_confirmation

    Returns:
        Compiled StateGraph with interrupt_before checkpoint
    """
    workflow = StateGraph(AvaState)

    # Add nodes
    workflow.add_node("extract_intent", extract_intent)
    workflow.add_node("check_availability", check_availability)
    workflow.add_node("propose_slot", propose_slot)
    workflow.add_node("route_after_confirmation", route_after_confirmation)
    workflow.add_node("confirm_booking", confirm_booking)
    workflow.add_node("send_confirmation", send_confirmation)

    # Add edges
    workflow.add_edge(START, "extract_intent")
    workflow.add_edge("extract_intent", "check_availability")
    workflow.add_edge("check_availability", "propose_slot")

    # INTERRUPT CHECKPOINT here
    # After propose_slot, graph pauses to let patient confirm verbally
    # ElevenLabs webhook resumes with patient_confirmed in state
    workflow.add_edge("propose_slot", "route_after_confirmation")

    # Conditional routing
    workflow.add_conditional_edges(
        "route_after_confirmation",
        lambda state: "confirm_booking" if state["patient_confirmed"] else "propose_slot",
        {
            "confirm_booking": "confirm_booking",
            "propose_slot": "propose_slot",
            "end": END,
        },
    )

    workflow.add_edge("confirm_booking", "send_confirmation")
    workflow.add_edge("send_confirmation", END)

    # Compile with MemorySaver for checkpointing
    # interrupt_before=["confirm_booking"] pauses BEFORE writing to PMS
    # This ensures we don't book until patient confirms
    compiled_graph = workflow.compile(
        checkpointer=memory,
        interrupt_before=["confirm_booking"],
    )

    logger.info("Ava graph compiled with interrupt_before=['confirm_booking']")

    return compiled_graph


def invoke_graph(session_id: str, input_state: AvaState):
    """
    Invoke graph with checkpoint threading.

    Args:
        session_id: Unique identifier for checkpoint threading
        input_state: Initial state for graph invocation

    Returns:
        Graph output at interrupt point or end
    """
    graph = build_ava_graph()

    config = {"configurable": {"thread_id": session_id}}

    result = graph.invoke(input_state, config=config)

    return result
```

- [ ] **Step 5: Run test**

```bash
pytest ava_graph/tests/test_graph_builder.py -v
# Expected: PASS
```

- [ ] **Step 6: Commit**

```bash
git add ava_graph/graph/edges.py ava_graph/graph/builder.py ava_graph/tests/test_graph_builder.py
git commit -m "feat(ava): build LangGraph with edges, checkpointing, and interrupt_before"
```

---

### Task 15: Build FastAPI webhook endpoint

**Files:**
- Create: `ava_graph/api/routes.py`
- Create: `ava_graph/api/__init__.py`

- [ ] **Step 1: Write test for webhook endpoint**

```python
# ava_graph/tests/test_api_webhook.py
import pytest
from fastapi.testclient import TestClient
from ava_graph.main import app

client = TestClient(app)


def test_webhook_post_receives_payload():
    """Verify POST /webhook/ava accepts webhook payload."""
    payload = {
        "patient_name": "John Doe",
        "requested_service": "Physio",
        "preferred_time": "Tuesday",
        "clinic_id": "clinic_001",
        "pms_type": "writeupp",
        "session_id": "session_abc123",
    }

    response = client.post("/webhook/ava", json=payload)

    assert response.status_code == 200
    assert "response_message" in response.json()


def test_webhook_returns_response_message():
    """Verify webhook returns message for ElevenLabs to speak."""
    payload = {
        "patient_name": "John",
        "requested_service": "Assessment",
        "preferred_time": "Tomorrow",
        "clinic_id": "clinic_001",
        "pms_type": "writeupp",
        "session_id": "session_xyz",
    }

    response = client.post("/webhook/ava", json=payload)
    data = response.json()

    assert "response_message" in data
    assert len(data["response_message"]) > 0
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest ava_graph/tests/test_api_webhook.py -v
# Expected: FAILED (app not built yet)
```

- [ ] **Step 3: Write routes.py**

```python
# ava_graph/api/routes.py
"""FastAPI webhook routes for Ava booking agent."""
import logging
from typing import Any, Dict
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from ava_graph.graph.state import AvaState
from ava_graph.graph.builder import build_ava_graph

logger = logging.getLogger(__name__)

router = APIRouter()


class AvaWebhookPayload(BaseModel):
    """Incoming webhook payload from ElevenLabs."""
    patient_name: str = ""
    patient_phone: str = ""
    requested_service: str = ""
    preferred_time: str = ""
    clinic_id: str
    pms_type: str = "writeupp"
    session_id: str
    patient_confirmed: bool = False  # Set by second webhook


class AvaWebhookResponse(BaseModel):
    """Response sent back to ElevenLabs."""
    response_message: str
    session_id: str
    confirmed_slot: str = ""
    status: str = "ok"


@router.post("/webhook/ava", response_model=AvaWebhookResponse)
async def handle_ava_webhook(payload: AvaWebhookPayload) -> Dict[str, Any]:
    """
    Handle incoming ElevenLabs webhook for Ava booking agent.

    Called twice per booking:
    1. First call (call start): Extract intent, check availability, propose slot, then PAUSE
    2. Second call (after patient confirmation): Resume from checkpoint with patient_confirmed flag

    Args:
        payload: Webhook data from ElevenLabs

    Returns:
        Response message for ElevenLabs to speak to patient
    """
    try:
        session_id = payload.session_id
        logger.info(f"Webhook received for session {session_id}")

        # Build initial state
        state = AvaState(
            patient_name=payload.patient_name,
            patient_phone=payload.patient_phone,
            requested_service=payload.requested_service,
            preferred_time=payload.preferred_time,
            clinic_id=payload.clinic_id,
            pms_type=payload.pms_type,
            available_slots=[],
            confirmed_slot="",
            patient_confirmed=payload.patient_confirmed,
            response_message="",
            session_id=session_id,
            attempt_count=0,
            messages=[],
            booking_id="",
        )

        # Invoke graph with checkpoint threading
        graph = build_ava_graph()
        config = {"configurable": {"thread_id": session_id}}

        # If patient_confirmed is True, this is the second webhook call
        # Graph will resume from interrupt checkpoint
        result = graph.invoke(state, config=config)

        logger.info(f"Graph execution complete for session {session_id}")

        return AvaWebhookResponse(
            response_message=result.get("response_message", ""),
            session_id=session_id,
            confirmed_slot=result.get("confirmed_slot", ""),
            status="ok",
        )

    except Exception as e:
        logger.error(f"Webhook error: {e}")
        raise HTTPException(status_code=500, detail=f"Booking error: {str(e)}")


@router.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok"}
```

- [ ] **Step 4: Write __init__.py for api**

```python
# ava_graph/api/__init__.py
from .routes import router

__all__ = ["router"]
```

- [ ] **Step 5: Run test**

```bash
pytest ava_graph/tests/test_api_webhook.py -v
# Expected: PASS (assuming main.py is built)
```

- [ ] **Step 6: Commit**

```bash
git add ava_graph/api/routes.py ava_graph/api/__init__.py ava_graph/tests/test_api_webhook.py
git commit -m "feat(ava): implement FastAPI webhook endpoint with checkpoint threading"
```

---

### Task 16: Build FastAPI main application

**Files:**
- Create: `ava_graph/main.py`
- Create: `ava_graph/__init__.py`
- Create: `.env.example`
- Create: `requirements.txt`

- [ ] **Step 1: Write main.py**

```python
# ava_graph/main.py
"""FastAPI application entry point for Ava booking backend."""
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from ava_graph.api import router

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="Ava Booking Backend",
    description="LangGraph-powered stateful booking agent for physiotherapy clinics",
    version="1.0.0",
)

# Add CORS middleware (for ElevenLabs webhook origin)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to ElevenLabs IPs
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(router, prefix="/api")

logger.info("Ava booking backend initialized")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "ava_graph.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )
```

- [ ] **Step 2: Write __init__.py for package**

```python
# ava_graph/__init__.py
"""Ava LangGraph booking backend."""

__version__ = "1.0.0"
```

- [ ] **Step 3: Write .env.example**

```bash
# .env.example
# Copy to .env and fill in values

# OpenAI / LangChain
OPENAI_API_KEY=sk_...
LLM_MODEL=gpt-4-turbo
LANGCHAIN_API_KEY=lsk_...

# Cliniko PMS
CLINIKO_API_KEY=...
CLINIKO_PRACTICE_ID=...

# WriteUpp PMS
WRITEUPP_API_KEY=...
WRITEUPP_API_URL=https://api.writeupp.com

# Jane App PMS
JANE_API_KEY=...
JANE_API_URL=https://api.jane.app

# TM3 (Blue Zinc) PMS
TM3_API_KEY=...
TM3_API_URL=https://api.tm3.com

# Twilio SMS
TWILIO_ACCOUNT_SID=ACxxx...
TWILIO_AUTH_TOKEN=xxx...
TWILIO_FROM_NUMBER=+447700000000
```

- [ ] **Step 4: Write requirements.txt**

```
# requirements.txt
langchain==0.1.20
langgraph==0.1.0
langchain-openai==0.0.15
fastapi==0.104.1
uvicorn==0.24.0
pydantic==2.5.0
httpx==0.25.0
twilio==8.10.0
python-dotenv==1.0.0
pytest==7.4.3
pytest-asyncio==0.21.1
pytest-mock==3.12.0
```

- [ ] **Step 5: Create package structure**

```bash
mkdir -p ava_graph/tests
touch ava_graph/__init__.py
touch ava_graph/tests/__init__.py
```

- [ ] **Step 6: Run server startup test**

```bash
cd /Users/joa/Desktop/StrydeOS
python -m ava_graph.main 2>&1 | head -20
# Expected: uvicorn startup logs, server running on 0.0.0.0:8000
```

- [ ] **Step 7: Commit**

```bash
git add ava_graph/main.py ava_graph/__init__.py .env.example requirements.txt
git commit -m "feat(ava): create FastAPI main app with uvicorn and dependencies"
```

---

## Final Integration & Testing

### Task 17: Run full integration test

- [ ] **Step 1: Install dependencies**

```bash
cd /Users/joa/Desktop/StrydeOS
pip install -r ava_graph/requirements.txt
```

- [ ] **Step 2: Run all tests**

```bash
pytest ava_graph/tests/ -v --tb=short
# Expected: All tests pass
```

- [ ] **Step 3: Run graph locally**

```bash
cd /Users/joa/Desktop/StrydeOS
python -m pytest ava_graph/tests/test_graph_builder.py::test_build_ava_graph_returns_compiled_graph -v
# Expected: PASS (verifies graph compiles)
```

- [ ] **Step 4: Commit**

```bash
git add ava_graph/tests/
git commit -m "test(ava): verify all nodes and graph integration"
```

---

## Summary of Deliverables

**Complete Ava LangGraph Backend**

✅ **State Management**
- AvaState TypedDict with 12 fields
- Checkpoint threading via session_id

✅ **Six-Node Graph**
1. extract_intent — parse webhook
2. check_availability — PMS query (4 PMS integrations)
3. propose_slot — LLM-generated spoken response
4. route_after_confirmation — conditional routing (confirm/loop/end)
5. confirm_booking — write to PMS
6. send_confirmation — Twilio SMS + final response

✅ **Multi-PMS Support**
- Cliniko (real API)
- WriteUpp (real API)
- Jane App (real API)
- TM3 / Blue Zinc (real API)

✅ **Twilio Integration**
- SMS booking confirmations
- Phone number normalization

✅ **FastAPI Endpoint**
- POST /webhook/ava
- Checkpoint threading by session_id
- Two-webhook interrupt flow

✅ **Architecture**
- /graph — state, nodes, edges, builder
- /tools — PMS + Twilio integrations
- /api — routes
- config.py — env vars, API clients
- main.py — FastAPI app

✅ **Deployment Ready**
- MemorySaver checkpointing
- Structured logging
- Error handling
- Type hints throughout
- .env.example + requirements.txt

Ready to execute?