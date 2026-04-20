import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import twilio from "twilio";

export const runtime = "nodejs";

// Never wrap this value in quotes when setting it on Vercel/envs — the
// twilio SDK uses it as the HMAC key verbatim, so a stray " in the stored
// value silently breaks every webhook signature check.
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN ?? "";

/**
 * POST /api/ava/inbound-call?clinicId=xxx
 *
 * TwiML endpoint wired as the voiceUrl for each clinic's Ava number.
 * When a patient calls, Twilio hits this endpoint and we return TwiML that
 * connects the call directly to the clinic's ElevenLabs ConvAI agent via SIP.
 *
 * Flow: Patient calls → Twilio number → this webhook → TwiML → ElevenLabs SIP
 *
 * Security: Twilio signature validated on every request. clinicId comes from
 * the voiceUrl query param set at provisioning time — never from the caller.
 */

function twimlResponse(body: string, status = 200): NextResponse {
  return new NextResponse(body, { status, headers: { "Content-Type": "text/xml" } });
}

const FALLBACK_TWIML = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy-Neural" language="en-GB">Thank you for calling. We are unable to take your call right now. Please try again shortly or leave a message after the tone.</Say>
  <Hangup/>
</Response>`;

export async function POST(req: NextRequest) {
  if (!TWILIO_AUTH_TOKEN) {
    console.error("[inbound-call] TWILIO_AUTH_TOKEN not configured");
    return new NextResponse("Twilio auth not configured", { status: 500 });
  }

  // Validate Twilio signature. Behind Vercel's reverse proxy req.url is the
  // internal URL; Twilio signs against the public-facing URL set as the
  // voiceUrl, so we reconstruct that from the forwarded headers.
  const sig = req.headers.get("x-twilio-signature") ?? "";
  const body = await req.text();
  const params: Record<string, string> = {};
  new URLSearchParams(body).forEach((v, k) => { params[k] = v; });

  const reqUrlObj = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  const canonicalUrl = `${proto}://${host}${reqUrlObj.pathname}${reqUrlObj.search}`;
  const isValid = twilio.validateRequest(TWILIO_AUTH_TOKEN, sig, canonicalUrl, params);

  if (!isValid) {
    console.error(
      `[inbound-call] Twilio signature validation failed. canonicalUrl=${canonicalUrl} sig=${sig ? "present" : "missing"}`
    );
    return new NextResponse("Forbidden", { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const clinicId = searchParams.get("clinicId");

  if (!clinicId) {
    console.error("[inbound-call] Missing clinicId query param");
    return twimlResponse(FALLBACK_TWIML);
  }

  let agentId: string | undefined;
  try {
    const db = getAdminDb();
    const clinicDoc = await db.collection("clinics").doc(clinicId).get();
    agentId = clinicDoc.data()?.ava?.agent_id;
  } catch (err) {
    console.error(
      `[inbound-call] Firestore lookup failed for clinic ${clinicId}:`,
      err instanceof Error ? err.message : String(err)
    );
    return twimlResponse(FALLBACK_TWIML);
  }

  if (!agentId) {
    console.error(`[inbound-call] No Ava agent configured for clinic ${clinicId}`);
    return twimlResponse(FALLBACK_TWIML);
  }

  // Connect the inbound call to ElevenLabs ConvAI via SIP
  const sipUri = `sip:${agentId}@sip.rtc.elevenlabs.io`;
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <Sip>${sipUri}</Sip>
  </Dial>
</Response>`;

  return twimlResponse(twiml);
}
