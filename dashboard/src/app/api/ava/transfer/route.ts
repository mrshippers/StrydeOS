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

    // ElevenLabs sends tool calls with agent_id and conversation context
    const agentId = body.agent_id;
    const conversationId = body.conversation_id;
    const callerPhone = body.caller_phone || body.from;

    if (!agentId || !callerPhone) {
      return NextResponse.json(
        { error: "Missing agent_id or caller_phone" },
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
      // Transfer failed — tell ElevenLabs so Ava can fall back to callback
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
  } catch (error) {
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
