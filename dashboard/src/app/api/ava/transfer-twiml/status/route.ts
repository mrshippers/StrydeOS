import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";

export const runtime = "nodejs";

const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN ?? "";

/**
 * Dial status callback — handles the case where reception doesn't pick up.
 * Twilio POSTs here after the <Dial> completes with DialCallStatus param.
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    // Validate Twilio signature — fail closed if auth not configured
    if (!TWILIO_AUTH_TOKEN) {
      return new NextResponse("Twilio auth not configured", { status: 500 });
    }
    {
      const sig = req.headers.get("x-twilio-signature") ?? "";
      const params: Record<string, string> = {};
      formData.forEach((value, key) => { params[key] = value.toString(); });
      // Reconstruct the public URL from forwarded headers — req.url is the
      // internal URL behind Vercel's proxy and won't match Twilio's signed URL.
      const reqUrlObj = new URL(req.url);
      const proto = req.headers.get("x-forwarded-proto") ?? "https";
      const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
      const canonicalUrl = `${proto}://${host}${reqUrlObj.pathname}${reqUrlObj.search}`;
      const isValid = twilio.validateRequest(TWILIO_AUTH_TOKEN, sig, canonicalUrl, params);
      if (!isValid) {
        console.error(
          `[transfer-twiml/status] Twilio signature validation failed. canonicalUrl=${canonicalUrl}`
        );
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
  <Say voice="Polly.Amy-Neural" language="en-GB">I'm sorry — the team aren't available to take your call right now. Someone will call you back as soon as possible. Thank you for your patience.</Say>
  <Hangup/>
</Response>`;

    return new NextResponse(fallbackTwiml, {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  } catch (err) {
    console.error("[transfer-twiml/status] Unhandled error:", err instanceof Error ? err.message : String(err));
    return new NextResponse(null, { status: 200 });
  }
}
