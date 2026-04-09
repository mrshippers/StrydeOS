import { NextRequest, NextResponse } from "next/server";
import { transferCallToReception } from "@/lib/ava/transfer-call";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyElevenLabsSignature, isWebhookSecretConfigured } from "@/lib/ava/verify-signature";

export const runtime = "nodejs";

/**
 * Webhook endpoint for ElevenLabs `transfer_to_reception` tool.
 *
 * When Ava detects a complaint and triggers the transfer tool, ElevenLabs
 * POSTs here with the conversation context. We then use Twilio to redirect
 * the live call to the clinic's reception/Moneypenny number.
 *
 * The caller experiences: Ava says "Let me put you through" → brief hold
 * message → reception picks up. Smooth, no dropped call, no callback promise.
 */
async function handler(req: NextRequest) {
  try {
    const rawBody = await req.text();

    // Verify ElevenLabs webhook signature — fail closed
    if (!isWebhookSecretConfigured()) {
      return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
    }

    const sig = req.headers.get("elevenlabs-signature");
    const valid = await verifyElevenLabsSignature(rawBody, sig);
    if (!valid) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const body = JSON.parse(rawBody);

    // ElevenLabs sends tool calls with agent_id and conversation context.
    // callerPhone may be absent on withheld CLI — transfer-call handles the fallback.
    const agentId = body.agent_id;
    const conversationId = body.conversation_id;
    const callerPhone = body.caller_phone ?? "";

    if (!agentId) {
      return NextResponse.json(
        { error: "Missing agent_id" },
        { status: 400 }
      );
    }

    // Resolve clinic from agent_id
    const db = getAdminDb();
    const clinicSnap = await db
      .collection("clinics")
      .where("ava.agent_id", "==", agentId)
      .limit(1)
      .get();

    if (clinicSnap.empty) {
      return NextResponse.json(
        { error: "Clinic not found for agent" },
        { status: 404 }
      );
    }

    const clinicId = clinicSnap.docs[0].id;

    // Execute the warm transfer
    const result = await transferCallToReception({
      clinicId,
      callerPhone,
      conversationId: conversationId || "",
      reason: "complaint",
    });

    if (!result.success) {
      // Out-of-hours — give Ava a specific script so she doesn't say "transfer failed"
      if (result.error?.startsWith("out_of_hours:")) {
        const [, start, end] = result.error.split(":");
        const startStr = formatHour(parseFloat(start));
        const endStr = formatHour(parseFloat(end));
        return NextResponse.json(
          {
            result: `out_of_hours. Reception is open ${startStr} to ${endStr}. Do NOT attempt transfer. Instead say: "The team are away from the phones at the moment — our reception is open ${startStr} to ${endStr}. Can I take your name and number and have someone call you back first thing?" Then take their details.`,
          },
          { status: 200 }
        );
      }

      // Other failure — fall back to callback
      return NextResponse.json(
        {
          result: `Transfer unavailable: ${result.error}. Please take the caller's name and number and arrange a callback instead.`,
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { result: "Call is being transferred to reception now." },
      { status: 200 }
    );
  } catch (_error) {
    // Return a graceful message so Ava can fall back
    return NextResponse.json(
      {
        result: "I wasn't able to transfer the call right now. Please take the caller's details and arrange a callback.",
      },
      { status: 200 }
    );
  }
}

export const POST = handler;

/** Convert decimal hour (e.g. 17.5) to "5:30pm" display string. */
function formatHour(hour: number): string {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  const period = h < 12 ? "am" : "pm";
  const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return m > 0 ? `${displayH}:${String(m).padStart(2, "0")}${period}` : `${displayH}${period}`;
}
