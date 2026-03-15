"""Conditional edge routing functions for Ava booking graph."""

import logging
from ava_graph.graph.state import AvaState
from ava_graph.graph.nodes import route_after_confirmation

logger = logging.getLogger(__name__)


def should_check_availability(state: AvaState) -> bool:
    """
    Determine if we should proceed to check_availability node.

    Returns True if clinic_id and pms_type are present in state.

    Args:
        state: Current AvaState

    Returns:
        bool: True if clinic_id and pms_type exist, False otherwise
    """
    clinic_id = state.get("clinic_id", "").strip()
    pms_type = state.get("pms_type", "").strip()

    has_required = bool(clinic_id and pms_type)
    logger.debug(
        f"should_check_availability: clinic_id={bool(clinic_id)}, "
        f"pms_type={bool(pms_type)} → {has_required}"
    )
    return has_required


def should_propose_slot(state: AvaState) -> bool:
    """
    Determine if we should proceed to propose_slot node.

    Returns True if available_slots is not empty.

    Args:
        state: Current AvaState

    Returns:
        bool: True if available_slots has items, False otherwise
    """
    has_slots = bool(state.get("available_slots", []))
    logger.debug(f"should_propose_slot: available_slots={len(state.get('available_slots', []))} → {has_slots}")
    return has_slots


def route_after_confirmation_edge(state: AvaState) -> str:
    """
    Route after patient confirmation using the route_after_confirmation node.

    This is a conditional edge that delegates routing logic to the
    route_after_confirmation node function, which returns:
    - "confirm_booking" if patient_confirmed=True
    - "propose_slot" if patient declined but more attempts available
    - "end" if max attempts reached or no more slots

    Args:
        state: Current AvaState containing patient confirmation status

    Returns:
        str: One of "confirm_booking", "propose_slot", or "end"
    """
    return route_after_confirmation(state)
