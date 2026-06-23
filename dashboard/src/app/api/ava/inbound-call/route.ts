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
 * TwiML endpoint wired as the voiceUrl for each clinic's Ava number. This is
 * the SINGLE inbound topology (proxy-first): every call lands here first so
 * multi-tenant routing and the pause toggle are honoured before the call ever
 * reaches ElevenLabs.
 *
 * Flow: Patient calls → Twilio number → this webhook → TwiML → ElevenLabs SIP
 *
 * Pause is enforced HERE, not by detaching the ElevenLabs agent: when the
 * clinic's `ava.enabled` flag is false we return a polite voicemail flow
 * instead of dialing Ava. The voiceUrl is never rewired, so a paused clinic is
 * genuinely off — there is no second native-import path that could still ring.
 *
 * Security: Twilio signature validated on every request. clinicId comes from
 * the voiceUrl query param set at provisioning time — never from the caller.
 */

function twimlResponse(body: string, status = 200): NextResponse {
  return new NextResponse(body, { status, headers: { "Content-Type": "text/xml" } });
}

/**
 * Resolve the public host Twilio actually signed against. Twilio's request
 * reaches us through Vercel's proxy, so the only faithful record of the
 * dialed host is x-forwarded-host. Fall back to the configured app host (one
 * env var) when the header is missing, then to the request URL host.
 */
function resolveInboundHost(req: NextRequest): { host: string; source: string } {
  const forwarded = req.headers.get("x-forwarded-host");
  if (forwarded) return { host: forwarded.split(",")[0].trim(), source: "x-forwarded-host" };

  const configured = getProvisionHost();
  if (configured) return { host: configured, source: "env" };

  return { host: new URL(req.url).host, source: "req.url" };
}

/**
 * The host the voiceUrl was provisioned with. Provisioning builds the voiceUrl
 * from NEXT_PUBLIC_APP_URL, so validation must use the SAME variable — using a
 * different env var here was the root cause of 100% inbound 403s.
 */
function getProvisionHost(): string | null {
  const raw = process.env.NEXT_PUBLIC_APP_URL;
  if (!raw) return null;
  try {
    return new URL(raw).host;
  } catch {
    return null;
  }
}

const FALLBACK_TWIML = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy-Neural" language="en-GB">Thank you for calling. We are unable to take your call right now. Please try again shortly or leave a message after the tone.</Say>
  <Hangup/>
</Response>`;

// Returned when the clinic has paused Ava (ava.enabled === false). The patient
// is told the practice is closed and invited to leave a message, rather than
// being connected to the voice agent.
const PAUSED_TWIML = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy-Neural" language="en-GB">Thank you for calling. The practice is currently closed and we cannot take your call right now. Please leave a message after the tone with your name and number and we will get back to you.</Say>
  <Record maxLength="120" playBeep="true"/>
  <Hangup/>
</Response>`;

export async function POST(req: NextRequest) {
  if (!TWILIO_AUTH_TOKEN) {
    console.error("[inbound-call] TWILIO_AUTH_TOKEN not configured");
    return new NextResponse("Twilio auth not configured", { status: 500 });
  }

  // Validate Twilio signature. Behind Vercel's reverse proxy req.url is the
  // internal URL; Twilio signs against the PUBLIC-facing URL it actually
  // dialed (the provisioned voiceUrl). The only reliable record of that host
  // is the x-forwarded-host header Twilio's request arrived on, so we use it
  // as the single source of host truth and fall back to one configured env
  // var only when the header is absent.
  const sig = req.headers.get("x-twilio-signature") ?? "";
  const body = await req.text();
  const params: Record<string, string> = {};
  new URLSearchParams(body).forEach((v, k) => { params[k] = v; });

  const reqUrlObj = new URL(req.url);
  const { host: resolvedHost, source: hostSource } = resolveInboundHost(req);

  // Guard: the host we validate against MUST be the same host the voiceUrl was
  // provisioned with (PROVISION_HOST). A divergence means signature validation
  // will reject every real call, so surface it loudly rather than silently 403.
  const provisionHost = getProvisionHost();
  if (provisionHost && resolvedHost && provisionHost !== resolvedHost) {
    console.error(
      `[inbound-call] HOST DIVERGENCE: validation host '${resolvedHost}' (from ${hostSource}) ` +
        `does not match provisioning host '${provisionHost}'. Inbound calls will fail signature ` +
        `validation. Ensure NEXT_PUBLIC_APP_URL (provisioning) and the live request host agree.`
    );
  }

  const canonicalUrl = `https://${resolvedHost}${reqUrlObj.pathname}${reqUrlObj.search}`;
  const isValid = twilio.validateRequest(TWILIO_AUTH_TOKEN, sig, canonicalUrl, params);

  if (!isValid) {
    console.error(
      `[inbound-call] Twilio signature validation failed. canonicalUrl=${canonicalUrl} hostSource=${hostSource} sig=${sig ? "present" : "missing"}`
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
  let avaEnabled = false;
  try {
    const db = getAdminDb();
    const clinicDoc = await db.collection("clinics").doc(clinicId).get();
    const ava = clinicDoc.data()?.ava;
    agentId = ava?.agent_id;
    avaEnabled = ava?.enabled === true;
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

  // Pause is enforced here: a clinic that has toggled Ava off (ava.enabled !==
  // true) gets the voicemail flow, never dialed through to the agent. This is
  // the ONLY off switch — the voiceUrl is not rewired and there is no native
  // import path that could still ring while "paused".
  if (!avaEnabled) {
    return twimlResponse(PAUSED_TWIML);
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
