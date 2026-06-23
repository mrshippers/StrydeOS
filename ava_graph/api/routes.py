"""FastAPI routes for Ava webhook endpoint.

These webhook + tool models mirror `dashboard/src/lib/contracts/index.ts` §6 and §7.
Any change here MUST be mirrored there in the same commit. Drift is detected by
`tests/test_contract_sync.py`.
"""

import asyncio
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, Query, Request

from ava_graph.api.auth import verify_elevenlabs_secret, verify_internal_secret
from ava_graph.api.rate_limit import limiter
from ava_graph.graph.state import AvaState

logger = logging.getLogger(__name__)

router = APIRouter()


class CallStartedWebhook(BaseModel):
    """Request model for call_started webhook.

    Mirrors TS `AvaCallStartedRequest` in dashboard/src/lib/contracts/index.ts §7.
    """

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
    """Request model for patient_confirmed webhook.

    Mirrors TS `AvaPatientConfirmedRequest` in dashboard/src/lib/contracts/index.ts §7.
    """

    session_id: str = Field(..., description="Session ID to resume from checkpoint")
    confirmed: bool = Field(..., description="Whether patient confirmed the booking")


class AvaWebhookResponse(BaseModel):
    """Standard envelope returned by every Ava webhook.

    Mirrors TS `AvaWebhookResponse` in dashboard/src/lib/contracts/index.ts §7.
    Defined for contract parity; handlers currently return plain dicts with the
    same shape and are unchanged.
    """

    response: str = Field(..., description="ElevenLabs-spoken response")
    end_conversation: bool = Field(..., description="Whether to end the conversation")
    session_id: str = Field(..., description="Session ID")
    status: str = Field(..., description="awaiting_confirmation | confirmed | other")
    response_message: str = Field(..., description="Same string as `response`")
    booking_id: Optional[str] = Field(
        default=None, description="Present only on terminal `confirmed` responses"
    )


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


@router.post("/webhook/ava", dependencies=[Depends(verify_elevenlabs_secret)])
@limiter.limit("60/minute")
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
        "api_key": "",
        "base_url": "",
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
        
        # Use ainvoke() because graph nodes are async
        # This properly handles async node execution without blocking
        result = await graph.ainvoke(
            initial_state,
            config={"configurable": {"thread_id": webhook.call_id}}
        )

        # Extract response message from result
        response_message = result.get("response_message", "Thank you for calling.")

        logger.info(
            f"Graph invocation complete for call {webhook.call_id}. "
            f"Returning at interrupt point. Message: {response_message}"
        )

        return {
            "response": response_message,
            "end_conversation": False,
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
        "api_key": "",
        "base_url": "",
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
            state_snapshot = graph.get_state(config)
            if state_snapshot and state_snapshot.values:
                # Update the checkpoint state with patient_confirmed flag
                existing_state = dict(state_snapshot.values)
                existing_state["patient_confirmed"] = webhook.confirmed
                logger.debug(f"Loaded state from checkpoint for session {webhook.session_id}")

                # Update the checkpoint with the new state
                graph.update_state(config, existing_state)

                # Now ainvoke with empty dict to continue from the interrupt point
                result = await graph.ainvoke(
                    None,  # Use None to indicate we're continuing from checkpoint
                    config=config,
                )
            else:
                # No checkpoint found, use confirmation_state with just the confirmed flag
                logger.warning(f"No checkpoint found for session {webhook.session_id}, using minimal state")
                result = await graph.ainvoke(
                    confirmation_state,
                    config=config,
                )
        except (AttributeError, TypeError) as e:
            # get_state or update_state might not exist, fall back to using confirmation_state
            logger.debug(f"Could not use checkpoint methods, falling back to state dict: {e}")
            result = await graph.ainvoke(
                confirmation_state,
                config=config,
            )

        booking_id = result.get("booking_id", "")
        response_message = result.get("response_message", "Booking confirmed.")

        # Determine if conversation should end
        end_conversation = False
        if booking_id:
            # Booking successful, end the call
            end_conversation = True
            logger.info(
                f"Graph resumed and completed for session {webhook.session_id}. "
                f"Booking ID: {booking_id}"
            )
        else:
            # If no booking_id, check if we're still waiting for confirmation or if graph ended
            patient_confirmed_final = result.get("patient_confirmed", False)
            if patient_confirmed_final and not booking_id:
                # Confirmation but booking failed
                end_conversation = True
                logger.error(
                    f"Graph completed but booking failed for session {webhook.session_id}"
                )
            else:
                # Still in rejection loop or waiting for confirmation
                end_conversation = False
                logger.info(
                    f"Graph resumed for session {webhook.session_id}. "
                    f"Patient not confirmed, remaining in proposal loop"
                )

        status = "confirmed" if booking_id else "awaiting_confirmation"
        return {
            "response": response_message,
            "end_conversation": bool(booking_id),
            "session_id": webhook.session_id,
            "status": status,
            "booking_id": booking_id,
            "response_message": response_message,
        }
    except Exception as e:
        logger.error(f"Graph invocation failed for session {webhook.session_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, detail=f"Failed to invoke graph: {str(e)}"
        )


# ─── Tool Execution Endpoint ──────────────────────────────────────────────────

class ToolExecuteRequest(BaseModel):
    """Request model for direct PMS tool execution (bypasses graph for live calls).

    Mirrors TS `AvaEngineRequest` in dashboard/src/lib/contracts/index.ts §6.

    SECURITY: `api_key`, `pms_type`, and `base_url` in the body are accepted for
    wire-compatibility with the existing dashboard proxy but are NOT trusted. The
    server resolves the real PMS credentials from the authenticated clinic's
    Firestore `integrations_config/pms` record. A body-supplied api_key can never
    be used to book against a clinic.
    """

    tool_name: str = Field(..., description="Tool to call: check_availability | book_appointment")
    tool_input: Dict[str, Any] = Field(..., description="Tool-specific parameters")
    clinic_id: str = Field(..., description="Clinic ID for multi-tenancy")
    # pms_type / api_key / base_url stay required for wire-parity with the TS
    # AvaEngineRequest contract (dashboard/src/lib/contracts/index.ts §6), but their
    # VALUES are ignored: the handler resolves real credentials server-side. A caller
    # cannot influence which key is used by setting these.
    pms_type: str = Field(..., description="IGNORED for auth: resolved server-side from clinic record")
    api_key: str = Field(..., description="IGNORED: never trusted; resolved server-side from clinic record")
    base_url: str = Field(default="", description="IGNORED: resolved server-side from clinic record")


async def _resolve_clinic_pms_credentials(clinic_id: str) -> Dict[str, str]:
    """
    Resolve PMS credentials for a clinic SERVER-SIDE from Firestore.

    Reads clinics/{clinic_id}/integrations_config/pms, the same server-only doc the
    dashboard writes via /api/pms/save-config. Returns the trusted api_key, pms_type
    (provider), and base_url. Never trusts caller-supplied values.

    Raises 404 if the clinic has no configured PMS, 503 on Firestore failure
    (fail closed, never proceed with empty or guessed credentials).
    """
    try:
        from ava_graph.config import get_firestore_db

        db = get_firestore_db()
        doc = await (
            db.collection("clinics")
            .document(clinic_id)
            .collection("integrations_config")
            .document("pms")
            .get()
        )
    except Exception as e:
        logger.error("Firestore credential lookup failed for clinic=%s: %s", clinic_id, e)
        raise HTTPException(status_code=503, detail="Credential store unavailable")

    if not doc.exists:
        raise HTTPException(status_code=404, detail="Clinic has no configured PMS integration")

    config = doc.to_dict() or {}
    api_key = (config.get("apiKey") or "").strip()
    pms_type = (config.get("provider") or "").strip()
    base_url = (config.get("baseUrl") or "").strip()

    if not api_key or not pms_type:
        raise HTTPException(status_code=404, detail="Clinic PMS integration is incomplete")

    return {"api_key": api_key, "pms_type": pms_type, "base_url": base_url}


class ToolExecuteResponse(BaseModel):
    """Response model for tool execution.

    Mirrors TS `AvaEngineResponse` in dashboard/src/lib/contracts/index.ts §6.
    """

    result: str = Field(..., description="Human-readable result string for ElevenLabs to speak")
    booking_id: Optional[str] = Field(default=None, description="PMS booking ID (book_appointment only)")
    slots: Optional[List[str]] = Field(default=None, description="ISO datetime strings (check_availability only)")


@router.post(
    "/tools/execute",
    response_model=ToolExecuteResponse,
    dependencies=[Depends(verify_internal_secret)],
)
@limiter.limit("120/minute")
async def execute_tool(request: Request, body: ToolExecuteRequest) -> ToolExecuteResponse:
    """
    Execute a PMS tool directly without invoking the LangGraph workflow.

    Used by the dashboard to proxy live ElevenLabs tool calls to the Python service.
    Supports check_availability and book_appointment for all integrated PMS systems.

    AUTH: gated by verify_internal_secret (shared AVA_INTERNAL_SECRET header). The
    PMS credentials (api_key / pms_type / base_url) are resolved SERVER-SIDE from the
    clinic's Firestore record; the matching body fields are ignored entirely.

    Args:
        body: Tool name, input params, and clinic_id. Credential fields are ignored.

    Returns:
        ToolExecuteResponse with human-readable result and optional booking_id / slots
    """
    from ava_graph.tools.writeupp import get_writeupp_availability, book_writeupp_appointment
    from ava_graph.tools.cliniko import get_cliniko_availability, book_cliniko_appointment
    from ava_graph.tools.jane import get_jane_availability, book_jane_appointment
    from ava_graph.tools.tm3 import get_tm3_availability, book_tm3_appointment

    # Resolve trusted credentials server-side; never trust body-supplied api_key.
    creds = await _resolve_clinic_pms_credentials(body.clinic_id)
    api_key = creds["api_key"]
    base_url = creds["base_url"]
    pms = creds["pms_type"].lower()
    tool = body.tool_name

    logger.info(
        "Tool execute: tool=%s, pms=%s, clinic=%s", tool, pms, body.clinic_id
    )

    try:
        if tool == "check_availability":
            start_date = body.tool_input.get("start_date", datetime.now().date().isoformat())
            duration = int(body.tool_input.get("duration_minutes", 60))
            days_ahead = int(body.tool_input.get("days_ahead", 14))

            if pms == "writeupp":
                slots = await get_writeupp_availability(
                    clinic_id=body.clinic_id,
                    start_date=start_date,
                    duration_minutes=duration,
                    api_key=api_key,
                    base_url=base_url,
                    days_ahead=days_ahead,
                )
            elif pms == "cliniko":
                slots = await get_cliniko_availability(
                    clinic_id=body.clinic_id,
                    start_date=start_date,
                    duration_minutes=duration,
                    days_ahead=days_ahead,
                    api_key=api_key,
                    base_url=base_url,
                )
            elif pms == "jane":
                slots = await get_jane_availability(
                    clinic_id=body.clinic_id,
                    start_date=start_date,
                    duration_minutes=duration,
                    api_key=api_key,
                    base_url=base_url,
                )
            elif pms == "tm3":
                slots = await get_tm3_availability(
                    clinic_id=body.clinic_id,
                    start_date=start_date,
                    duration_minutes=duration,
                    api_key=api_key,
                )
            else:
                raise HTTPException(status_code=400, detail=f"Unknown pms_type: {pms}")

            if not slots:
                result = "No available slots found in the requested period."
            else:
                readable = ", ".join(
                    datetime.fromisoformat(s).strftime("%A %d %b at %I:%M %p").lstrip("0")
                    for s in slots[:5]
                )
                result = f"Available slots: {readable}"

            return ToolExecuteResponse(result=result, slots=slots)

        elif tool == "book_appointment":
            patient_name = body.tool_input.get("patient_name", "")
            patient_phone = body.tool_input.get("patient_phone", "")
            service_type = body.tool_input.get("service_type", "Physiotherapy")
            slot = body.tool_input.get("slot", "")
            patient_email = body.tool_input.get("patient_email")

            if not all([patient_name, patient_phone, slot]):
                raise HTTPException(
                    status_code=400,
                    detail="book_appointment requires patient_name, patient_phone, and slot in tool_input",
                )

            if pms == "writeupp":
                booking_id = await book_writeupp_appointment(
                    clinic_id=body.clinic_id,
                    patient_name=patient_name,
                    patient_phone=patient_phone,
                    service_type=service_type,
                    slot=slot,
                    api_key=api_key,
                    base_url=base_url,
                )
            elif pms == "cliniko":
                booking_id = await book_cliniko_appointment(
                    clinic_id=body.clinic_id,
                    patient_name=patient_name,
                    patient_phone=patient_phone,
                    service_type=service_type,
                    slot=slot,
                    api_key=api_key,
                    base_url=base_url,
                )
            elif pms == "jane":
                booking_id = await book_jane_appointment(
                    clinic_id=body.clinic_id,
                    patient_name=patient_name,
                    patient_phone=patient_phone,
                    service_type=service_type,
                    slot=slot,
                    api_key=api_key,
                    base_url=base_url,
                )
            elif pms == "tm3":
                booking_id = await book_tm3_appointment(
                    clinic_id=body.clinic_id,
                    patient_name=patient_name,
                    patient_phone=patient_phone,
                    service_type=service_type,
                    slot=slot,
                    api_key=api_key,
                    patient_email=patient_email,
                )
            else:
                raise HTTPException(status_code=400, detail=f"Unknown pms_type: {pms}")

            slot_dt = datetime.fromisoformat(slot)
            readable_slot = slot_dt.strftime("%A %d %b at %I:%M %p").lstrip("0")
            result = f"Booked {patient_name} in for {readable_slot}. Booking ID: {booking_id}"

            return ToolExecuteResponse(result=result, booking_id=booking_id)

        else:
            raise HTTPException(status_code=400, detail=f"Unknown tool_name: {tool}")

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Tool execute failed: tool=%s pms=%s error=%s", tool, pms, e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Tool execution failed: {str(e)}")
