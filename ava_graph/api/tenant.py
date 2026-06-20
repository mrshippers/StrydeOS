"""Tenant resolution middleware. Validates clinic_id query param against Firestore.

Architecture note: unlike a Twilio-direct setup (where you'd look up clinic by the
dialled 'To' number), /api/webhook/ava receives clinic_id explicitly in the query
string from ElevenLabs/n8n. This middleware validates that value against the Firestore
'clinics' collection so rogue/spoofed clinic IDs are rejected at the boundary.

Schema relied upon: clinics/{clinicId} — doc must exist (any fields). The collection
already exists as part of the multi-tenant data model.

If a clinic_phone_numbers collection is later created for Twilio-direct routes, add a
second resolver here using the same pattern.
"""

import contextvars
import logging
from typing import Optional

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

logger = logging.getLogger(__name__)

current_clinic_id: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "current_clinic_id", default=None
)

_WEBHOOK_PATHS = {"/api/webhook/ava", "/api/tools/execute"}


class TenantResolverMiddleware(BaseHTTPMiddleware):
    """
    Validate clinic_id query param on webhook/tool routes and bind to request context.
    Rejects with 400 if missing, 404 if no matching clinic doc in Firestore.
    """

    async def dispatch(self, request: Request, call_next):
        if request.url.path not in _WEBHOOK_PATHS:
            return await call_next(request)

        # patient_confirmed webhooks resume an existing session by session_id and carry
        # no clinic_id (the clinic was already validated on the call_started leg). Don't
        # demand a clinic_id for them, otherwise legitimate confirmations are rejected.
        if request.query_params.get("webhook_type") == "patient_confirmed":
            return await call_next(request)

        clinic_id = request.query_params.get("clinic_id")
        if not clinic_id:
            return JSONResponse(
                {"error": "Missing clinic_id query parameter"}, status_code=400
            )

        exists = await _clinic_exists(clinic_id)
        if not exists:
            return JSONResponse(
                {"error": f"Unknown clinic: {clinic_id}"}, status_code=404
            )

        token = current_clinic_id.set(clinic_id)
        try:
            return await call_next(request)
        finally:
            current_clinic_id.reset(token)


async def _clinic_exists(clinic_id: str) -> bool:
    """Return True if clinics/{clinic_id} document exists in Firestore."""
    try:
        from ava_graph.config import get_firestore_db
        db = get_firestore_db()
        doc = await db.collection("clinics").document(clinic_id).get()
        return doc.exists
    except Exception:
        # Fail CLOSED on Firestore errors: an infra fault must never grant access to
        # an unknown clinic. Sentry captures the exception; the caller is rejected.
        logger.exception("Firestore lookup failed for clinic_id=%s; failing closed", clinic_id)
        return False
