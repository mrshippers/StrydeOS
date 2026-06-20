"""Webhook signature verification for inbound external traffic.

Traffic sources:
- /api/webhook/ava  — ElevenLabs (Twilio routes through n8n → ElevenLabs → here).
                      Uses verify_elevenlabs_secret.
- /api/tools/execute: dashboard/Cloud Run internal. Uses verify_internal_secret
                      (dedicated AVA_INTERNAL_SECRET shared header). The body-supplied
                      api_key is ignored; credentials are resolved server-side from the
                      authenticated clinic record.
- Future /voice /sms /status-callback: direct Twilio. Use verify_twilio_signature.

Secret hygiene: ELEVENLABS_WEBHOOK_SECRET authenticates ElevenLabs-signed webhooks
ONLY. The internal tool endpoint has its own dedicated secret (AVA_INTERNAL_SECRET)
so a leak of one does not grant the other. Previously the ElevenLabs secret was
triple-purposed as the internal shared secret; that conflation is now removed.
"""

import hashlib
import hmac
import os

from fastapi import HTTPException, Request
from twilio.request_validator import RequestValidator

_twilio_validator = RequestValidator(os.environ.get("TWILIO_AUTH_TOKEN", ""))
_elevenlabs_secret = os.environ.get("ELEVENLABS_WEBHOOK_SECRET", "")
_internal_secret = os.environ.get("AVA_INTERNAL_SECRET", "")


async def verify_twilio_signature(request: Request) -> None:
    """
    Validate X-Twilio-Signature on direct Twilio-facing routes.
    Apply to /voice, /sms, /status-callback when those routes are added.
    """
    signature = request.headers.get("X-Twilio-Signature", "")
    url = str(request.url)
    form = await request.form()
    params = dict(form)

    if not _twilio_validator.validate(url, params, signature):
        raise HTTPException(status_code=403, detail="Invalid Twilio signature")


async def verify_elevenlabs_secret(request: Request) -> None:
    """
    Validate X-Elevenlabs-Signature HMAC-SHA256 against ELEVENLABS_WEBHOOK_SECRET.
    ElevenLabs sends: X-Elevenlabs-Signature: t=<timestamp>,v1=<hmac_hex>
    Reject with 403 if missing, malformed, or invalid.
    """
    if not _elevenlabs_secret:
        raise HTTPException(
            status_code=500,
            detail="ELEVENLABS_WEBHOOK_SECRET not configured",
        )

    header = request.headers.get("X-Elevenlabs-Signature", "")
    if not header:
        raise HTTPException(status_code=403, detail="Missing X-Elevenlabs-Signature")

    # Parse t=<timestamp>,v1=<signature>
    parts = dict(p.split("=", 1) for p in header.split(",") if "=" in p)
    timestamp = parts.get("t", "")
    signature = parts.get("v1", "")
    if not timestamp or not signature:
        raise HTTPException(status_code=403, detail="Malformed X-Elevenlabs-Signature")

    body = await request.body()
    signed_payload = f"{timestamp}.{body.decode()}"
    expected = hmac.new(
        _elevenlabs_secret.encode(),
        signed_payload.encode(),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(expected, signature):
        raise HTTPException(status_code=403, detail="Invalid ElevenLabs signature")


async def verify_internal_secret(request: Request) -> None:
    """
    Authenticate internal callers (dashboard / Cloud Run) of /api/tools/execute.

    Requires a dedicated shared secret in the X-Internal-Secret header, compared
    constant-time against AVA_INTERNAL_SECRET. Reject with 401 if missing, 403 if
    mismatched, 500 if the server is not configured (fail closed, never allow an
    unconfigured server to accept unauthenticated tool calls).

    TODO: layer a Google-signed ID-token check (verify audience + issuer for the
    Cloud Run service identity) on top of the shared secret once the dashboard's
    service account is wired. Until then the shared secret is the sole gate.
    """
    if not _internal_secret:
        raise HTTPException(
            status_code=500,
            detail="AVA_INTERNAL_SECRET not configured",
        )

    provided = request.headers.get("X-Internal-Secret", "")
    if not provided:
        raise HTTPException(status_code=401, detail="Missing X-Internal-Secret")

    if not hmac.compare_digest(provided, _internal_secret):
        raise HTTPException(status_code=403, detail="Invalid internal secret")
