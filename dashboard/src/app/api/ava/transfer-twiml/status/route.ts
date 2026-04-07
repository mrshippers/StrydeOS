import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";

export const runtime = "nodejs";

const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN ?? "";

/**
 * Dial status callback — handles the case where reception doesn't pick up.
 * Twilio POSTs here after the <Dial> completes with DialCallStatus param.
 */
export async function POST(req: NextRequest) {
  const formData = await req.formData();

  // Validate Twilio signature
  if (TWILIO_AUTH_TOKEN) {
    const sig = req.headers.get("x-twilio-signature") ?? "";
    const params: Record<string, string> = {};
    formData.forEach((value, key) => { params[key] = value.toString(); });
    const isValid = twilio.validateRequest(TWILIO_AUTH_TOKEN, sig, req.url, params);
    if (!isValid) {
      return new NextResponse("Forbidden", { status: 403 });
    }
  }

  const dialStatus = formData.get("DialCallStatus")?.toString();

  // If the call connected and completed, nothing more to do
  if (dialStatus === "completed" || dialStatus === "answered") {
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><Response/>`,
      { status: 200, headers: { "Content-Type": "text/xml" } }
    );
  }

  // Reception didn't answer (busy, no-answer, failed) — apologise and end
  const fallbackTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice" language="en-GB">I'm sorry — the team aren't available to take your call right now. Someone will call you back as soon as possible. Thank you for your patience.</Say>
  <Hangup/>
</Response>`;

  return new NextResponse(fallbackTwiml, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}
