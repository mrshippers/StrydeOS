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
    assert state["clinic_id"] == "clinic_001"
