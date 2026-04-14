"""FastAPI routes for Ava webhook endpoint."""

import asyncio
import logging
from typing import Any, Dict, Optional

from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException, Query, Request

from ava_graph.graph.state import AvaState

logger = logging.getLogger(__name__)

router = APIRouter()


class CallStartedWebhook(BaseModel):
    """Request model for call_started webhook."""

    call_id: str = Field(..., description="ElevenLabs call ID, used as session_id")
    patient_name: str = Field(..., description="Patient name")
    patient_phone: str = Field(..., description="Patient phone number")
    requested_service: str = Field(
        default="General", description="Service type (e.g., Physio, Massage)"
    )
    preferred_time: str = Field(
        default="", description="Patient's preferred time (e.g., '14:00')"
    )


class PatientConfirmedWebhook(BaseModel):
    """Request model for patient_confirmed webhook."""

    session_id: str = Field(..., description="Session ID to resume from checkpoint")
    confirmed: bool = Field(..., description="Whether patient confirmed the booking")


def normalize_phone_to_e164(phone: str) -> str:
    """
    Normalize phone number to E.164 format.

    Args:
        phone: Phone number string (e.g., '07700000000' or '+447700000000')

    Returns:
        E.164 formatted phone number (e.g., '+447700000000')
    """
    # Remove spaces and common separators
    phone = phone.replace(" ", "").replace("-", "").replace("(", "").replace(")", "")

    # If starts with 0, assume UK and convert to +44
    if phone.startswith("0"):
        phone = "+44" + phone[1:]

    # If no + prefix, add it
    if not phone.startswith("+"):
        phone = "+" + phone

    return phone


@router.post("/webhook/ava")
async def webhook_ava(
    request: Request,
    webhook_type: str = Query(..., description="Webhook type: call_started|patient_confirmed"),
    clinic_id: Optional[str] = Query(None, description="Clinic ID for multi-tenancy"),
    pms_type: Optional[str] = Query(None, description="PMS type: cliniko|writeupp|jane|tm3"),
) -> Dict[str, Any]:
    """
    Handle ElevenLabs Ava webhooks for booking workflow.

    Two webhook types:
    1. call_started: Initial webhook, creates session, invokes graph to interrupt point
    2. patient_confirmed: Confirmation webhook, resumes graph from checkpoint

    Args:
        request: FastAPI Request object for parsing JSON body
        webhook_type: "call_started" or "patient_confirmed"
        clinic_id: Clinic ID (required for call_started)
        pms_type: PMS type (required for call_started)

    Returns:
        JSON response with session_id, response_message/booking_id, and status
    """
    # Validate webhook_type
    if webhook_type not in ["call_started", "patient_confirmed"]:
        logger.error(f"Invalid webhook_type: {webhook_type}")
        raise HTTPException(
            status_code=400,
            detail=f"Invalid webhook_type. Must be 'call_started' or 'patient_confirmed', got '{webhook_type}'",
        )

    try:
        payload = await request.json()
    except Exception as e:
        logger.error(f"Failed to parse JSON payload: {e}")
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    if webhook_type == "call_started":
        return await handle_call_started(payload, clinic_id, pms_type)
    elif webhook_type == "patient_confirmed":
        return await handle_patient_confirmed(payload)


async def handle_call_started(
    payload: Dict[str, Any], clinic_id: Optional[str], pms_type: Optional[str]
) -> Dict[str, Any]:
    """
    Handle call_started webhook type.

    Extracts webhook data, invokes graph with initial state, and returns at interrupt point.

    Args:
        payload: JSON payload from ElevenLabs webhook
        clinic_id: Clinic ID for multi-tenancy
        pms_type: PMS type (cliniko|writeupp|jane|tm3)

    Returns:
        Dict with session_id, response_message, and status
    """
    # Validate required params
    if clinic_id is None:
        raise HTTPException(status_code=400, detail="clinic_id query param is required")
    if pms_type is None:
        raise HTTPException(status_code=400, detail="pms_type query param is required")

    # Parse and validate payload
    try:
        webhook = CallStartedWebhook.model_validate(payload)
    except Exception as e:
        logger.error(f"Failed to validate call_started payload: {e}")
        raise HTTPException(status_code=400, detail=f"Invalid payload: {str(e)}")

    # Normalize phone to E.164
    normalized_phone = normalize_phone_to_e164(webhook.patient_phone)

    # Create initial state
    initial_state: AvaState = {
        "patient_name": webhook.patient_name,
        "patient_phone": normalized_phone,
        "requested_service": webhook.requested_service,
        "preferred_time": webhook.preferred_time,
        "clinic_id": clinic_id,
        "pms_type": pms_type,
        "available_slots": [],
        "confirmed_slot": "",
        "patient_confirmed": False,
        "response_message": "",
        "session_id": webhook.call_id,
        "attempt_count": 0,
        "messages": [],
        "booking_id": "",
    }

    # Invoke graph with checkpoint threading
    try:
        from ava_graph.graph.builder import build_ava_graph

        graph = build_ava_graph()
        
        # Run graph synchronously in thread pool to avoid blocking async event loop
        # graph.invoke() is synchronous but needs to run in async context
        result = await asyncio.to_thread(
            graph.invoke,
            initial_state,
            config={"configurable": {"thread_id": webhook.call_id}}
        )

        # Extract response message from result
        response_message = result.get("response_message", "Thank you for calling.")

        logger.info(
            f"Graph invocation complete for call {webhook.call_id}. "
            f"Returning at interrupt point."
        )

        return {
            "session_id": webhook.call_id,
            "response_message": response_message,
            "status": "awaiting_confirmation",
        }
    except Exception as e:
        logger.error(f"Graph invocation failed for call {webhook.call_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, detail=f"Failed to invoke graph: {str(e)}"
        )


async def handle_patient_confirmed(
    payload: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Handle patient_confirmed webhook type.

    Resumes graph from checkpoint and runs to completion.

    Args:
        payload: JSON payload from ElevenLabs webhook

    Returns:
        Dict with session_id, booking_id, and status
    """
    # Parse and validate payload
    try:
        webhook = PatientConfirmedWebhook.model_validate(payload)
    except Exception as e:
        logger.error(f"Failed to validate patient_confirmed payload: {e}")
        raise HTTPException(status_code=400, detail=f"Invalid payload: {str(e)}")

    # Prepare state update for confirmation
    # Only update patient_confirmed flag; other fields will be loaded from checkpoint
    confirmation_state: AvaState = {
        "patient_name": "",
        "patient_phone": "",
        "requested_service": "",
        "preferred_time": "",
        "clinic_id": "",
        "pms_type": "",
        "available_slots": [],
        "confirmed_slot": "",
        "patient_confirmed": webhook.confirmed,
        "response_message": "",
        "session_id": webhook.session_id,
        "attempt_count": 0,
        "messages": [],
        "booking_id": "",
    }

    try:
        from ava_graph.graph.builder import build_ava_graph

        graph = build_ava_graph()
        config = {"configurable": {"thread_id": webhook.session_id}}

        # When resuming from checkpoint, we need to update the state with patient_confirmed
        # and then continue the graph execution from where it left off
        try:
            # Get the current state from checkpoint
            state_snapshot = await asyncio.to_thread(graph.get_state, config)
            if state_snapshot and state_snapshot.values:
                # Update the checkpoint state with patient_confirmed flag
                existing_state = dict(state_snapshot.values)
                existing_state["patient_confirmed"] = webhook.confirmed
                logger.debug(f"Loaded state from checkpoint for session {webhook.session_id}")

                # Update the checkpoint with the new state
                await asyncio.to_thread(graph.update_state, config, existing_state)

                # Now invoke with empty dict to continue from the interrupt point
                result = await asyncio.to_thread(
                    graph.invoke,
                    None,  # Use None to indicate we're continuing from checkpoint
                    config=config,
                )
            else:
                # No checkpoint found, use confirmation_state with just the confirmed flag
                logger.warning(f"No checkpoint found for session {webhook.session_id}, using minimal state")
                result = await asyncio.to_thread(
                    graph.invoke,
                    confirmation_state,
                    config=config,
                )
        except (AttributeError, TypeError) as e:
            # get_state or update_state might not exist, fall back to using confirmation_state
            logger.debug(f"Could not use checkpoint methods, falling back to state dict: {e}")
            result = await asyncio.to_thread(
                graph.invoke,
                confirmation_state,
                config=config,
            )

        booking_id = result.get("booking_id", "")

        # Determine status based on booking outcome
        if booking_id:
            status = "confirmed"
            logger.info(
                f"Graph resumed and completed for session {webhook.session_id}. "
                f"Booking ID: {booking_id}"
            )
        else:
            # If no booking_id, check if we're still waiting for confirmation or if graph ended
            # If patient_confirmed is True but no booking_id, it's an error
            # If patient_confirmed is False, we're back in the proposal loop
            patient_confirmed_final = result.get("patient_confirmed", False)
            if patient_confirmed_final and not booking_id:
                status = "error"
                logger.error(
                    f"Graph completed but booking failed for session {webhook.session_id}"
                )
            else:
                # Still in rejection loop or graph ended without confirmation
                status = "awaiting_confirmation"
                logger.info(
                    f"Graph resumed for session {webhook.session_id}. "
                    f"Patient not confirmed, remaining in proposal loop"
                )

        return {
            "session_id": webhook.session_id,
            "booking_id": booking_id,
            "status": status,
        }
    except Exception as e:
        logger.error(f"Graph invocation failed for session {webhook.session_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, detail=f"Failed to invoke graph: {str(e)}"
        )
