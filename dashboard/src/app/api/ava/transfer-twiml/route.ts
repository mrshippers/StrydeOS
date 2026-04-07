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
export async function POST(req: NextRequest) {
  // Validate Twilio signature — POST body params must be included in HMAC
  if (TWILIO_AUTH_TOKEN) {
    const sig = req.headers.get("x-twilio-signature") ?? "";
    const body = await req.text();
    const params: Record<string, string> = {};
    new URLSearchParams(body).forEach((v, k) => { params[k] = v; });
    const isValid = twilio.validateRequest(TWILIO_AUTH_TOKEN, sig, req.url, params);
    if (!isValid) {
      return new NextResponse("Forbidden", { status: 403 });
    }
  }

  const url = new URL(req.url);
  const clinicId = url.searchParams.get("clinicId");

  if (!clinicId) {
    const fallbackTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice" language="en-GB">I'm sorry, I'm unable to connect you right now. Someone from the clinic will call you back shortly.</Say>
  <Hangup/>
</Response>`;

    return new NextResponse(fallbackTwiml, {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  }

  // Look up reception phone from Firestore — never trust query params for phone numbers
  const db = getAdminDb();
  const clinicDoc = await db.collection("clinics").doc(clinicId).get();
  const clinicData = clinicDoc.data();
  const to = clinicData?.receptionPhone || clinicData?.notificationPhone;

  if (!to) {
    const fallbackTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice" language="en-GB">I'm sorry, I'm unable to connect you right now. Someone from the clinic will call you back shortly.</Say>
  <Hangup/>
</Response>`;

    return new NextResponse(fallbackTwiml, {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
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

  return new NextResponse(twiml, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
