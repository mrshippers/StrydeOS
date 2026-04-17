"""Tests for check_availability node."""

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


@pytest.mark.asyncio
async def test_check_availability_routes_to_jane():
    """Verify Jane routing works."""
    state = AvaState(
        patient_name="John Doe",
        requested_service="Physio",
        preferred_time="",
        clinic_id="clinic_001",
        pms_type="jane",
        available_slots=[],
        confirmed_slot="",
        patient_confirmed=False,
        response_message="",
        session_id="session_abc",
        attempt_count=0,
        messages=[],
    )

    with patch("ava_graph.graph.nodes.check_availability.get_jane_availability") as mock_jane:
        mock_jane.return_value = ["2026-03-16T10:00:00"]

        result = await check_availability(state)

        assert len(result["available_slots"]) > 0
        mock_jane.assert_called_once()


@pytest.mark.asyncio
async def test_check_availability_routes_to_tm3():
    """Verify TM3 routing works."""
    state = AvaState(
        patient_name="John Doe",
        requested_service="Physio",
        preferred_time="",
        clinic_id="clinic_001",
        pms_type="tm3",
        available_slots=[],
        confirmed_slot="",
        patient_confirmed=False,
        response_message="",
        session_id="session_abc",
        attempt_count=0,
        messages=[],
    )

    with patch("ava_graph.graph.nodes.check_availability.get_tm3_availability") as mock_tm3:
        mock_tm3.return_value = ["2026-03-16T09:00:00"]

        result = await check_availability(state)

        assert len(result["available_slots"]) > 0
        mock_tm3.assert_called_once()


@pytest.mark.asyncio
async def test_check_availability_filters_by_day_preference():
    """Verify slots are filtered by day-of-week preference."""
    # Create slots with mixed days
    slots = [
        "2026-03-16T10:00:00",  # Monday
        "2026-03-17T10:00:00",  # Tuesday
        "2026-03-18T10:00:00",  # Wednesday
        "2026-03-17T14:00:00",  # Tuesday
    ]

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

    with patch("ava_graph.graph.nodes.check_availability.get_writeupp_availability") as mock_wu:
        mock_wu.return_value = slots

        result = await check_availability(state)

        # Should only have Tuesday slots
        assert len(result["available_slots"]) == 2
        for slot in result["available_slots"]:
            dt = __import__("datetime").datetime.fromisoformat(slot)
            assert dt.weekday() == 1  # Tuesday is weekday 1


@pytest.mark.asyncio
async def test_check_availability_filters_by_time_preference():
    """Verify slots are filtered by time-of-day preference."""
    slots = [
        "2026-03-16T09:00:00",   # Morning
        "2026-03-16T14:00:00",   # Afternoon
        "2026-03-16T18:00:00",   # Evening
        "2026-03-16T13:00:00",   # Afternoon
    ]

    state = AvaState(
        patient_name="John Doe",
        requested_service="Physio",
        preferred_time="afternoon",
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

    with patch("ava_graph.graph.nodes.check_availability.get_writeupp_availability") as mock_wu:
        mock_wu.return_value = slots

        result = await check_availability(state)

        # Should only have afternoon slots (12:00-16:59)
        assert len(result["available_slots"]) == 2
        for slot in result["available_slots"]:
            dt = __import__("datetime").datetime.fromisoformat(slot)
            assert 12 <= dt.hour < 17


@pytest.mark.asyncio
async def test_check_availability_fallback_to_first_5_if_no_preference_match():
    """Verify fallback to first 5 slots if preference doesn't match any."""
    slots = [f"2026-03-16T{i:02d}:00:00" for i in range(8, 18)]  # 10 slots

    state = AvaState(
        patient_name="John Doe",
        requested_service="Physio",
        preferred_time="Sunday",  # No Sunday slots in list (all are Monday 2026-03-16)
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

    with patch("ava_graph.graph.nodes.check_availability.get_writeupp_availability") as mock_wu:
        mock_wu.return_value = slots

        result = await check_availability(state)

        # Should fall back to first 5
        assert len(result["available_slots"]) == 5
        assert result["available_slots"] == slots[:5]


@pytest.mark.asyncio
async def test_check_availability_updates_messages():
    """Verify messages are updated with slot count."""
    state = AvaState(
        patient_name="John Doe",
        requested_service="Physio",
        preferred_time="",
        clinic_id="clinic_001",
        pms_type="writeupp",
        available_slots=[],
        confirmed_slot="",
        patient_confirmed=False,
        response_message="",
        session_id="session_abc",
        attempt_count=0,
        messages=["Initial message"],
    )

    with patch("ava_graph.graph.nodes.check_availability.get_writeupp_availability") as mock_wu:
        mock_wu.return_value = ["2026-03-16T14:00:00", "2026-03-16T15:00:00"]

        result = await check_availability(state)

        assert len(result["messages"]) == 2
        assert "Found 2 available slots" in result["messages"][-1]


@pytest.mark.asyncio
async def test_check_availability_handles_error_gracefully():
    """Verify errors are handled gracefully."""
    state = AvaState(
        patient_name="John Doe",
        requested_service="Physio",
        preferred_time="",
        clinic_id="clinic_001",
        pms_type="unknown_pms",
        available_slots=[],
        confirmed_slot="",
        patient_confirmed=False,
        response_message="",
        session_id="session_abc",
        attempt_count=0,
        messages=[],
    )

    result = await check_availability(state)

    assert result["available_slots"] == []
    assert "couldn't connect" in result["response_message"].lower()


@pytest.mark.asyncio
async def test_check_availability_surfaces_pms_auth_error_distinctly():
    """A ValueError from the PMS client (e.g. empty api_key) must yield a
    distinct, operator-actionable response_message — not the generic one."""
    state = AvaState(
        patient_name="John Doe",
        patient_phone="07700000000",
        requested_service="Physio",
        preferred_time="",
        clinic_id="clinic_001",
        pms_type="writeupp",
        api_key="",
        base_url="",
        available_slots=[],
        confirmed_slot="",
        patient_confirmed=False,
        response_message="",
        session_id="session_abc",
        attempt_count=0,
        messages=[],
        booking_id="",
    )

    with patch("ava_graph.graph.nodes.check_availability.get_writeupp_availability") as mock_wu:
        mock_wu.side_effect = ValueError(
            "PMS api_key is empty — clinic integrations_config likely missing or unconfigured"
        )

        result = await check_availability(state)

    assert result["available_slots"] == []
    msg = result.get("response_message", "").lower()
    assert "pms auth" in msg or "integration settings" in msg, (
        f"Expected an auth-specific message, got: {result.get('response_message')!r}"
    )


@pytest.mark.asyncio
async def test_check_availability_generic_exception_still_handled():
    """Non-ValueError exceptions still produce a generic safe message."""
    state = AvaState(
        patient_name="John Doe",
        patient_phone="07700000000",
        requested_service="Physio",
        preferred_time="",
        clinic_id="clinic_001",
        pms_type="writeupp",
        api_key="real_key",
        base_url="",
        available_slots=[],
        confirmed_slot="",
        patient_confirmed=False,
        response_message="",
        session_id="session_abc",
        attempt_count=0,
        messages=[],
        booking_id="",
    )

    with patch("ava_graph.graph.nodes.check_availability.get_writeupp_availability") as mock_wu:
        mock_wu.side_effect = RuntimeError("network down")

        result = await check_availability(state)

    assert result["available_slots"] == []
    # Generic message must NOT mention auth, since it isn't an auth error
    msg = result.get("response_message", "").lower()
    assert "pms auth" not in msg
