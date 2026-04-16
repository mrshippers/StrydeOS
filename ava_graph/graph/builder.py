"""LangGraph StateGraph builder for Ava booking workflow."""

import logging
from typing import Any, Dict

from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver

from ava_graph.graph.state import AvaState
from ava_graph.graph.nodes import (
    extract_intent,
    check_availability,
    propose_slot,
    confirm_booking,
    send_confirmation,
)
from ava_graph.graph.nodes.route_after_confirmation import route_after_confirmation
from ava_graph.graph.edges import (
    should_check_availability,
    should_propose_slot,
    route_after_confirmation_edge,
)

logger = logging.getLogger(__name__)

# Module-level checkpointer instance for session-based persistence
_checkpointer = MemorySaver()

# Cached compiled graph — graph topology never changes at runtime, so we build
# once per process. Live phone calls cannot afford a 100–300ms graph rebuild
# per webhook.
_compiled_graph_cache: StateGraph | None = None


def build_ava_graph() -> StateGraph:
    """
    Build and compile the Ava booking workflow LangGraph.

    Structure:
    - START → extract_intent → check_availability (conditional)
    - check_availability → propose_slot (conditional)
    - propose_slot → route_after_confirmation (conditional routing)
    - route_after_confirmation → confirm_booking | propose_slot | END
    - confirm_booking → send_confirmation → END
    - Compiled with interrupt_before=["confirm_booking"] for session-based checkpointing

    Returns:
        Compiled StateGraph with MemorySaver checkpointer and interrupt checkpoint
    """
    global _compiled_graph_cache
    if _compiled_graph_cache is not None:
        return _compiled_graph_cache

    # Create the state graph
    graph = StateGraph(AvaState)

    # Add all 6 nodes to the graph
    graph.add_node("extract_intent", extract_intent)
    graph.add_node("check_availability", check_availability)
    graph.add_node("propose_slot", propose_slot)
    graph.add_node("route_after_confirmation", route_after_confirmation)
    graph.add_node("confirm_booking", confirm_booking)
    graph.add_node("send_confirmation", send_confirmation)

    # Define edges: linear path with conditional routing
    # START → extract_intent
    graph.add_edge(START, "extract_intent")

    # extract_intent → check_availability (conditional: requires clinic_id + pms_type)
    graph.add_conditional_edges(
        "extract_intent",
        should_check_availability,
        {True: "check_availability", False: END},
    )

    # check_availability → propose_slot (conditional: requires available_slots)
    graph.add_conditional_edges(
        "check_availability",
        should_propose_slot,
        {True: "propose_slot", False: END},
    )

    # propose_slot → route_after_confirmation
    graph.add_edge("propose_slot", "route_after_confirmation")

    # route_after_confirmation → confirm_booking | propose_slot | END (conditional)
    graph.add_conditional_edges(
        "route_after_confirmation",
        route_after_confirmation_edge,
        {
            "confirm_booking": "confirm_booking",
            "propose_slot": "propose_slot",
            "end": END,
        },
    )

    # confirm_booking → send_confirmation
    graph.add_edge("confirm_booking", "send_confirmation")

    # send_confirmation → END
    graph.add_edge("send_confirmation", END)

    logger.info("Ava graph structure built. Compiling with MemorySaver checkpointer...")

    # Compile with checkpointer and interrupt_after checkpoint
    # Interrupt after propose_slot so we can wait for patient confirmation before routing
    compiled_graph = graph.compile(
        checkpointer=_checkpointer,
        interrupt_after=["propose_slot"],
    )

    logger.info("Ava graph compiled successfully with interrupt_after=['propose_slot']")

    _compiled_graph_cache = compiled_graph
    return compiled_graph


def invoke_graph(session_id: str, input_state: AvaState) -> Dict[str, Any]:
    """
    Invoke the compiled Ava graph with session-based checkpoint threading.

    Uses thread_id parameter to enable multi-turn conversations with state persistence.
    The graph will interrupt before the "confirm_booking" node to allow for human-in-the-loop
    patient confirmation.

    Args:
        session_id: Unique session identifier (used as thread_id for checkpointing)
        input_state: Initial AvaState for the workflow

    Returns:
        Final state dict from graph invocation
    """
    graph = build_ava_graph()

    logger.info(f"Invoking graph for session: {session_id}")

    # Invoke with thread_id for session-based checkpointing
    result = graph.invoke(
        input_state,
        config={"configurable": {"thread_id": session_id}},
    )

    logger.info(f"Graph invocation complete for session: {session_id}")

    return result
