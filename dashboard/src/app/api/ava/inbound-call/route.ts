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
  <Say voice="alice" language="en-GB">Thank you for calling. We are unable to take your call right now. Please try again shortly or leave a message after the tone.</Say>
  <Hangup/>
</Response>`;

export async function POST(req: NextRequest) {
  if (!TWILIO_AUTH_TOKEN) {
    console.error("[inbound-call] TWILIO_AUTH_TOKEN not configured");
    return new NextResponse("Twilio auth not configured", { status: 500 });
  }

  // Validate Twilio signature.
  // Twilio signs against the exact URL it POSTs to. Behind Vercel's reverse
  // proxy, req.url doesn't always match the public-facing URL — so we try a
  // short list of candidate URLs (reconstructed from forwarded headers,
  // raw req.url, and the configured NEXT_PUBLIC_APP_URL) and accept the
  // request if ANY candidate validates. Authenticity is still guaranteed:
  // a forged signature won't match any real URL under our auth token.
  const sig = req.headers.get("x-twilio-signature") ?? "";
  const body = await req.text();
  const params: Record<string, string> = {};
  new URLSearchParams(body).forEach((v, k) => { params[k] = v; });

  const reqUrlObj = new URL(req.url);
  const fwdProto = req.headers.get("x-forwarded-proto") ?? "https";
  const fwdHost = req.headers.get("x-forwarded-host");
  const hostHeader = req.headers.get("host");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL; // e.g. https://portal.strydeos.com

  const candidates = new Set<string>();
  if (fwdHost) candidates.add(`${fwdProto}://${fwdHost}${reqUrlObj.pathname}${reqUrlObj.search}`);
  if (hostHeader) candidates.add(`${fwdProto}://${hostHeader}${reqUrlObj.pathname}${reqUrlObj.search}`);
  candidates.add(req.url);
  if (appUrl) candidates.add(`${appUrl.replace(/\/$/, "")}${reqUrlObj.pathname}${reqUrlObj.search}`);

  let matchedUrl: string | null = null;
  for (const url of candidates) {
    if (twilio.validateRequest(TWILIO_AUTH_TOKEN, sig, url, params)) {
      matchedUrl = url;
      break;
    }
  }

  if (!matchedUrl) {
    console.error(
      `[inbound-call] Twilio signature validation failed. tried=${JSON.stringify([...candidates])} sig=${sig ? "present" : "missing"}`
    );
    // Diagnostic headers — safe to expose, no secrets. Helps confirm which
    // deployment is serving and what URL shape it's seeing.
    return new NextResponse("Forbidden", {
      status: 403,
      headers: {
        "x-debug-tried-count": String(candidates.size),
        "x-debug-fwd-proto": fwdProto,
        "x-debug-fwd-host": fwdHost ?? "(none)",
        "x-debug-host-header": hostHeader ?? "(none)",
        "x-debug-req-url": req.url.slice(0, 256),
      },
    });
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
