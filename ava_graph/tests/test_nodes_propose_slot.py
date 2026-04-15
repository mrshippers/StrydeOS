"""Tests for propose_slot node."""

import pytest
from unittest.mock import patch, AsyncMock, MagicMock
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

    with patch("ava_graph.graph.nodes.propose_slot.ChatAnthropic") as mock_llm_class:
        mock_response = MagicMock()
        mock_response.content = "I have Tuesday at 2pm available, does that work for you?"
        mock_llm = MagicMock()
        mock_llm.invoke = MagicMock(return_value=mock_response)
        mock_llm_class.return_value = mock_llm

        result = await propose_slot(state)

        assert result["confirmed_slot"] != ""
        assert result["response_message"] != ""
        assert "2pm" in result["response_message"] or "Tuesday" in result["response_message"]
        assert result["attempt_count"] == 1
        assert len(result["messages"]) > len(state["messages"])


@pytest.mark.asyncio
async def test_propose_slot_increments_attempt_count():
    """Verify propose_slot increments attempt_count."""
    state = AvaState(
        patient_name="Alice Smith",
        requested_service="Assessment",
        preferred_time="Monday",
        clinic_id="clinic_002",
        pms_type="cliniko",
        available_slots=["2026-03-17T09:00:00"],
        confirmed_slot="",
        patient_confirmed=False,
        response_message="",
        session_id="session_def",
        attempt_count=2,
        messages=[],
    )

    with patch("ava_graph.graph.nodes.propose_slot.ChatAnthropic") as mock_llm_class:
        mock_response = MagicMock()
        mock_response.content = "How about Monday at 9am?"
        mock_llm = MagicMock()
        mock_llm.invoke = MagicMock(return_value=mock_response)
        mock_llm_class.return_value = mock_llm

        result = await propose_slot(state)

        assert result["attempt_count"] == 3


@pytest.mark.asyncio
async def test_propose_slot_handles_empty_slots_gracefully():
    """Verify propose_slot handles empty available_slots."""
    state = AvaState(
        patient_name="Bob Brown",
        requested_service="Physio",
        preferred_time="Friday",
        clinic_id="clinic_001",
        pms_type="writeupp",
        available_slots=[],
        confirmed_slot="",
        patient_confirmed=False,
        response_message="",
        session_id="session_xyz",
        attempt_count=0,
        messages=[],
    )

    with patch("ava_graph.graph.nodes.propose_slot.ChatAnthropic"):
        result = await propose_slot(state)

        assert result["response_message"] != ""
        assert "available" in result["response_message"].lower() or "slots" in result["response_message"].lower()
        assert result["confirmed_slot"] == ""


@pytest.mark.asyncio
async def test_propose_slot_selects_nth_slot_by_attempt_count():
    """Verify propose_slot selects slots[min(attempt_count, len-1)]."""
    state = AvaState(
        patient_name="Carol Davis",
        requested_service="Physio",
        preferred_time="Wednesday",
        clinic_id="clinic_001",
        pms_type="writeupp",
        available_slots=[
            "2026-03-18T10:00:00",
            "2026-03-18T11:00:00",
            "2026-03-18T12:00:00",
        ],
        confirmed_slot="",
        patient_confirmed=False,
        response_message="",
        session_id="session_multi",
        attempt_count=1,  # Should pick slots[1]
        messages=[],
    )

    with patch("ava_graph.graph.nodes.propose_slot.ChatAnthropic") as mock_llm_class:
        mock_response = MagicMock()
        mock_response.content = "How about 11am?"
        mock_llm = MagicMock()
        mock_llm.invoke = MagicMock(return_value=mock_response)
        mock_llm_class.return_value = mock_llm

        result = await propose_slot(state)

        # Should have selected slots[1] which is "2026-03-18T11:00:00"
        assert result["confirmed_slot"] == "2026-03-18T11:00:00"


@pytest.mark.asyncio
async def test_propose_slot_adds_to_messages_transcript():
    """Verify propose_slot appends to messages list."""
    state = AvaState(
        patient_name="Eve Evans",
        requested_service="Physio",
        preferred_time="Thursday",
        clinic_id="clinic_001",
        pms_type="writeupp",
        available_slots=["2026-03-19T13:00:00"],
        confirmed_slot="",
        patient_confirmed=False,
        response_message="",
        session_id="session_msg",
        attempt_count=0,
        messages=["SYSTEM: Initial message"],
    )

    with patch("ava_graph.graph.nodes.propose_slot.ChatAnthropic") as mock_llm_class:
        mock_response = MagicMock()
        mock_response.content = "How about Thursday at 1pm?"
        mock_llm = MagicMock()
        mock_llm.invoke = MagicMock(return_value=mock_response)
        mock_llm_class.return_value = mock_llm

        result = await propose_slot(state)

        assert len(result["messages"]) > len(state["messages"])
        # Should contain AVA response
        assert any("Thursday" in msg or "1pm" in msg or "1:00" in msg for msg in result["messages"][-2:])
