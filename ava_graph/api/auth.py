"""Webhook signature verification for inbound external traffic.

NOTE: /api/webhook/ava is called by ElevenLabs (not Twilio directly - Twilio routes
through n8n → ElevenLabs → this service). The Twilio validator below is ready for
when direct Twilio routes (/voice, /sms, /status-callback) are added to this service.
Apply verify_twilio_signature as a Depends() on those routes when they exist.
For /api/webhook/ava, use an ElevenLabs xi-webhook-secret check instead.
"""

import os
from fastapi import HTTPException, Request
from twilio.request_validator import RequestValidator

_twilio_validator = RequestValidator(os.environ.get("TWILIO_AUTH_TOKEN", ""))


async def verify_twilio_signature(request: Request) -> None:
    """
    Validate X-Twilio-Signature header against request URL + form params.
    Reject with 403 if invalid. Use as FastAPI dependency on Twilio-facing routes.
    """
    signature = request.headers.get("X-Twilio-Signature", "")
    url = str(request.url)
    form = await request.form()
    params = dict(form)

    if not _twilio_validator.validate(url, params, signature):
        raise HTTPException(status_code=403, detail="Invalid Twilio signature")
