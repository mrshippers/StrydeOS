"""check_availability node for Ava booking agent.

Queries the PMS (based on clinic pms_type) for available appointment slots
within the next 14 days. Routes to the correct PMS tool based on state.pms_type.
Filters slots by preferred_time if specified.
"""

import logging
from datetime import datetime, timedelta
from typing import List

from ava_graph.graph.state import AvaState
from ava_graph.tools.writeupp import get_writeupp_availability
from ava_graph.tools.cliniko import get_cliniko_availability
from ava_graph.tools.jane import get_jane_availability
from ava_graph.tools.tm3 import get_tm3_availability

logger = logging.getLogger(__name__)


def _filter_slots_by_preference(slots: List[str], preference: str) -> List[str]:
    """
    Filter appointment slots by user preference.

    Supports:
    - Day-of-week preferences: "Monday", "Tuesday", etc.
    - Time preferences: "morning" (06:00-12:00), "afternoon" (12:00-17:00), "evening" (17:00-21:00)
    - Combined: "Tuesday afternoon"

    Args:
        slots: List of ISO datetime strings
        preference: User's time preference string

    Returns:
        Filtered list of slots matching preference, or first 5 slots if no match found.
    """
    if not preference or not slots:
        return slots[:5] if slots else []

    preference_lower = preference.lower()

    # Map day names to weekday indices (0=Monday, 6=Sunday)
    day_names = {
        "monday": 0,
        "tuesday": 1,
        "wednesday": 2,
        "thursday": 3,
        "friday": 4,
        "saturday": 5,
        "sunday": 6,
    }

    # Time ranges in 24-hour format
    time_ranges = {
        "morning": (6, 12),      # 06:00 - 11:59
        "afternoon": (12, 17),   # 12:00 - 16:59
        "evening": (17, 21),     # 17:00 - 20:59
    }

    filtered = []

    for slot in slots:
        try:
            slot_dt = datetime.fromisoformat(slot)
            slot_hour = slot_dt.hour
            slot_day = slot_dt.weekday()

            # Check day preference
            day_match = any(
                day_name in preference_lower and slot_day == day_idx
                for day_name, day_idx in day_names.items()
            )

            # Check time preference
            time_match = any(
                time_name in preference_lower and start_hour <= slot_hour < end_hour
                for time_name, (start_hour, end_hour) in time_ranges.items()
            )

            # Include if matches day or time (or both mentioned in preference)
            if day_match or time_match:
                filtered.append(slot)

        except ValueError as e:
            logger.warning(f"Failed to parse slot datetime {slot}: {e}")
            continue

    # Return filtered results, or first 5 slots if no matches
    return filtered[:5] if filtered else slots[:5]


async def check_availability(state: AvaState) -> AvaState:
    """
    Query PMS for available appointment slots.

    Routes to the correct PMS tool based on state.pms_type.
    Queries 14 days ahead of today. Filters slots by preferred_time preference.
    Updates state with available slots and adds message count to conversation.

    Args:
        state: Current AvaState

    Returns:
        Updated AvaState with available_slots populated
    """
    try:
        # Calculate date range: today through 14 days ahead
        today = datetime.now().date()
        start_date = today.isoformat()
        end_date = (today + timedelta(days=14)).isoformat()

        logger.info(
            f"check_availability: clinic_id={state['clinic_id']}, "
            f"pms_type={state['pms_type']}, "
            f"date_range={start_date} to {end_date}, "
            f"preference={state['preferred_time']}"
        )

        # Route to correct PMS tool
        pms_type = state.get("pms_type", "").lower()
        api_key = state.get("api_key", "")
        base_url = state.get("base_url", "")
        available_slots = []

        if pms_type == "writeupp":
            available_slots = await get_writeupp_availability(
                clinic_id=state["clinic_id"],
                start_date=start_date,
                duration_minutes=60,
                api_key=api_key,
                base_url=base_url,
            )
        elif pms_type == "cliniko":
            available_slots = await get_cliniko_availability(
                clinic_id=state["clinic_id"],
                start_date=start_date,
                duration_minutes=60,
                days_ahead=14,
                api_key=api_key,
                base_url=base_url,
            )
        elif pms_type == "jane":
            available_slots = await get_jane_availability(
                clinic_id=state["clinic_id"],
                start_date=start_date,
                duration_minutes=60,
                api_key=api_key,
                base_url=base_url,
            )
        elif pms_type == "tm3":
            available_slots = await get_tm3_availability(
                clinic_id=state["clinic_id"],
                start_date=start_date,
                duration_minutes=60,
                api_key=api_key,
                base_url=base_url,
            )
        else:
            logger.error(f"Unknown PMS type: {pms_type}")
            return {
                **state,
                "available_slots": [],
                "response_message": "Sorry, I couldn't connect to your clinic system.",
            }

        # Filter slots by preference
        filtered_slots = _filter_slots_by_preference(
            available_slots, state.get("preferred_time", "")
        )

        # Add to conversation transcript
        new_message = f"Found {len(filtered_slots)} available slots out of {len(available_slots)} total."
        messages = list(state.get("messages", [])) + [new_message]

        logger.info(
            f"check_availability: found {len(filtered_slots)} available slots "
            f"after filtering (total: {len(available_slots)})"
        )

        return {
            **state,
            "available_slots": filtered_slots,
            "messages": messages,
        }

    except Exception as e:
        logger.error(f"check_availability error: {str(e)}", exc_info=True)
        return {
            **state,
            "available_slots": [],
            "messages": list(state.get("messages", [])) + ["Error checking availability."],
        }
