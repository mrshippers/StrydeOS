"""Confirm booking node - writes appointment to PMS after patient verbal confirmation."""

import logging
from ava_graph.graph.state import AvaState
from ava_graph.tools.writeupp import book_writeupp_appointment
from ava_graph.tools.cliniko import book_cliniko_appointment
from ava_graph.tools.jane import book_jane_appointment
from ava_graph.tools.tm3 import book_tm3_appointment

logger = logging.getLogger(__name__)


async def confirm_booking(state: AvaState) -> AvaState:
    """
    Write confirmed appointment to the appropriate PMS system.

    This node is called AFTER patient verbal confirmation (graph resumes from interrupt checkpoint).
    It routes the booking to the correct PMS based on pms_type and stores the returned booking_id.

    Args:
        state: Current Ava workflow state containing confirmed slot and PMS details

    Returns:
        Updated state with booking_id and confirmation message
    """
    clinic_id = state["clinic_id"]
    patient_name = state["patient_name"]
    patient_phone = state["patient_phone"]
    service_type = state["requested_service"]
    confirmed_slot = state["confirmed_slot"]
    pms_type = state["pms_type"]
    messages = state["messages"].copy() if state["messages"] else []

    try:
        logger.info(
            "Confirming booking for patient %s in clinic %s via %s at %s",
            patient_name,
            clinic_id,
            pms_type,
            confirmed_slot,
        )

        booking_id = ""

        # Route to correct PMS booking function based on pms_type
        if pms_type == "writeupp":
            booking_id = await book_writeupp_appointment(
                clinic_id=clinic_id,
                patient_name=patient_name,
                patient_phone=patient_phone,
                service_type=service_type,
                slot=confirmed_slot,
            )
        elif pms_type == "cliniko":
            booking_id = await book_cliniko_appointment(
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
            # Unknown PMS type
            error_msg = f"Unknown PMS type: {pms_type}"
            logger.error(error_msg)
            messages.append(f"SYSTEM: Error - {error_msg}")
            return {
                **state,
                "booking_id": "",
                "response_message": f"Error: Unable to process booking. Unknown system type: {pms_type}",
                "messages": messages,
            }

        # Success: log and update state with booking_id
        logger.info(
            "Successfully booked appointment with ID %s for patient %s via %s",
            booking_id,
            patient_name,
            pms_type,
        )

        confirmation_msg = f"AVA: Your appointment has been confirmed. Booking ID: {booking_id}"
        messages.append(confirmation_msg)

        return {
            **state,
            "booking_id": booking_id,
            "response_message": state.get("response_message", "Thank you for your booking."),
            "messages": messages,
        }

    except Exception as e:
        # Handle PMS API errors gracefully
        error_msg = f"Failed to book appointment: {str(e)}"
        logger.error(
            "Booking failed for patient %s in clinic %s: %s",
            patient_name,
            clinic_id,
            str(e),
            exc_info=True,
        )

        messages.append(f"SYSTEM: Booking error - {str(e)}")

        return {
            **state,
            "booking_id": "",
            "response_message": "I apologize, but I encountered an error while booking your appointment. Our team will contact you shortly.",
            "messages": messages,
        }
