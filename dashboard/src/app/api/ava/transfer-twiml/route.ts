import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import twilio from "twilio";

export const runtime = "nodejs";

const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN ?? "";

/**
 * TwiML endpoint for warm-transferring an Ava call to reception/Moneypenny.
 *
 * When Ava detects a complaint, she triggers transfer_to_reception which
 * redirects the live Twilio call to this endpoint. The TwiML:
 *
 * 1. Plays a brief comfort message so the caller knows they're being connected
 * 2. Dials the reception number with a timeout
 * 3. If reception doesn't pick up, plays a fallback message
 *
 * Security: The reception phone number is looked up from Firestore using the
 * clinicId — never accepted from query params to prevent toll fraud.
 */
const FALLBACK_TWIML = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice" language="en-GB">I'm sorry, I'm unable to connect you right now. Someone from the clinic will call you back shortly.</Say>
  <Hangup/>
</Response>`;

function twimlResponse(body: string, status = 200): NextResponse {
  return new NextResponse(body, { status, headers: { "Content-Type": "text/xml" } });
}

export async function POST(req: NextRequest) {
  // Validate Twilio signature — fail closed if auth not configured
  if (!TWILIO_AUTH_TOKEN) {
    return new NextResponse("Twilio auth not configured", { status: 500 });
  }
  {
    const sig = req.headers.get("x-twilio-signature") ?? "";
    const body = await req.text();
    const params: Record<string, string> = {};
    new URLSearchParams(body).forEach((v, k) => { params[k] = v; });
    // Reconstruct the public URL from forwarded headers — req.url is the
    // internal URL behind Vercel's proxy and won't match Twilio's signed URL.
    const reqUrlObj = new URL(req.url);
    const proto = req.headers.get("x-forwarded-proto") ?? "https";
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
    const canonicalUrl = `${proto}://${host}${reqUrlObj.pathname}${reqUrlObj.search}`;
    const isValid = twilio.validateRequest(TWILIO_AUTH_TOKEN, sig, canonicalUrl, params);
    if (!isValid) {
      console.error(
        `[transfer-twiml] Twilio signature validation failed. canonicalUrl=${canonicalUrl}`
      );
      return new NextResponse("Forbidden", { status: 403 });
    }
  }

  const url = new URL(req.url);
  const clinicId = url.searchParams.get("clinicId");

  if (!clinicId) {
    return twimlResponse(FALLBACK_TWIML);
  }

  // Look up reception phone from Firestore — never trust query params for phone numbers
  let to: string | undefined;
  try {
    const db = getAdminDb();
    const clinicDoc = await db.collection("clinics").doc(clinicId).get();
    const clinicData = clinicDoc.data();
    to = clinicData?.receptionPhone || clinicData?.notificationPhone;
  } catch (err) {
    console.error(
      `[transfer-twiml] Firestore lookup failed for clinic ${clinicId}:`,
      err instanceof Error ? err.message : String(err)
    );
    return twimlResponse(FALLBACK_TWIML);
  }

  if (!to) {
    return twimlResponse(FALLBACK_TWIML);
  }

  // Caller ID: use the clinic's Ava number so reception sees it's an Ava transfer
  const callerIdPhone = process.env.TWILIO_PHONE_NUMBER || "";

  // Build the TwiML for a warm transfer
  // - Short comfort message (natural, not robotic)
  // - Dial reception with 30s timeout
  // - If no answer, apologise and promise callback
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice" language="en-GB">One moment — I'm connecting you now.</Say>
  <Dial callerId="${escapeXml(callerIdPhone)}" timeout="30" action="/api/ava/transfer-twiml/status?clinicId=${escapeXml(clinicId)}">
    <Number>${escapeXml(to)}</Number>
  </Dial>
</Response>`;

  return twimlResponse(twiml);
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
