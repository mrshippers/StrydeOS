"""Propose available appointment slot to patient via LLM-generated response."""

import logging
from datetime import datetime
from typing import List

from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

from ava_graph.graph.state import AvaState
from ava_graph.config import OPENAI_API_KEY

logger = logging.getLogger(__name__)


def _format_datetime_readable(iso_datetime: str) -> str:
    """
    Convert ISO datetime string to readable format.

    Example: "2026-03-16T14:00:00" → "Monday at 2:00 PM"
    """
    try:
        dt = datetime.fromisoformat(iso_datetime)
        day_name = dt.strftime("%A")
        # Use lstrip to remove leading zero cross-platform
        hour_str = dt.strftime("%I:%M %p").lstrip("0")
        if hour_str.startswith(":"):  # Handle "0X:MM" → "X:MM"
            hour_str = hour_str[1:]
        return f"{day_name} at {hour_str}"
    except (ValueError, TypeError) as e:
        logger.warning(f"Failed to parse datetime {iso_datetime}: {e}")
        return iso_datetime


async def propose_slot(state: AvaState) -> AvaState:
    """
    Propose available appointment slot to patient via LLM-generated natural response.

    This node:
    1. Selects best available slot based on attempt_count
    2. Uses LLM to generate warm, natural spoken response
    3. Updates state with proposed slot and response message
    4. Increments attempt_count
    5. Adds to messages transcript
    6. Handles empty slots gracefully

    Args:
        state: Current conversation state

    Returns:
        Updated state with proposed_slot, response_message, attempt_count incremented
    """
    logger.info(
        f"Proposing slot for patient {state['patient_name']} "
        f"(attempt {state['attempt_count']})"
    )

    # Handle empty available_slots
    if not state["available_slots"]:
        logger.warning(f"No available slots for {state['patient_name']}")
        response = (
            f"I'm sorry, {state['patient_name']}, but unfortunately we don't have any "
            "available slots right now. Can I get your contact details and I'll have someone "
            "from the clinic reach out to you soon?"
        )

        return AvaState(
            patient_name=state["patient_name"],
            requested_service=state["requested_service"],
            preferred_time=state["preferred_time"],
            clinic_id=state["clinic_id"],
            pms_type=state["pms_type"],
            available_slots=state["available_slots"],
            confirmed_slot="",  # No slot to confirm
            patient_confirmed=state["patient_confirmed"],
            response_message=response,
            session_id=state["session_id"],
            attempt_count=state["attempt_count"] + 1,
            messages=state["messages"] + [f"AVA: {response}"],
        )

    # Select best slot: slots[min(attempt_count, len(slots)-1)]
    slot_index = min(state["attempt_count"], len(state["available_slots"]) - 1)
    proposed_slot = state["available_slots"][slot_index]
    logger.info(f"Selected slot at index {slot_index}: {proposed_slot}")

    # Format datetime for readability
    readable_time = _format_datetime_readable(proposed_slot)
    logger.info(f"Formatted time: {readable_time}")

    # Generate LLM prompt
    system_prompt = SystemMessage(content=(
        "You are a warm, professional receptionist at a physiotherapy clinic. "
        "Your role is to propose an available appointment slot to a patient in a natural, "
        "conversational way. Keep your response brief (under 2 sentences), use the patient's name, "
        "mention the service, and ask for a yes/no confirmation. "
        "Never include any metadata or technical details - just speak naturally as a person would."
    ))

    human_prompt = HumanMessage(content=(
        f"Patient name: {state['patient_name']}\n"
        f"Service requested: {state['requested_service']}\n"
        f"Available slot: {readable_time}\n"
        f"\n"
        f"Propose this slot to the patient in a warm, natural way. Ask if they can confirm. "
        f"Keep it to under 2 sentences."
    ))

    # Call LLM to generate response
    try:
        llm = ChatOpenAI(
            model="gpt-4-turbo",
            temperature=0.7,
            api_key=OPENAI_API_KEY,
        )

        response = llm.invoke([system_prompt, human_prompt])
        response_message = response.content.strip()
        logger.info(f"LLM generated response: {response_message}")

    except Exception as e:
        logger.error(f"LLM call failed: {e}")
        # Fallback response if LLM fails
        response_message = (
            f"Hi {state['patient_name']}, I have {readable_time} available for your {state['requested_service']}. "
            "Does that work for you?"
        )
        logger.info(f"Using fallback response: {response_message}")

    # Update state
    updated_state = AvaState(
        patient_name=state["patient_name"],
        requested_service=state["requested_service"],
        preferred_time=state["preferred_time"],
        clinic_id=state["clinic_id"],
        pms_type=state["pms_type"],
        available_slots=state["available_slots"],
        confirmed_slot=proposed_slot,  # Provisional - not confirmed yet
        patient_confirmed=state["patient_confirmed"],
        response_message=response_message,
        session_id=state["session_id"],
        attempt_count=state["attempt_count"] + 1,
        messages=state["messages"] + [f"AVA: {response_message}"],
    )

    logger.info(
        f"propose_slot complete: proposed {proposed_slot}, "
        f"attempt_count now {updated_state['attempt_count']}"
    )

    return updated_state
