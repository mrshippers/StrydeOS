import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { withRequestLog } from "@/lib/request-logger";

export const runtime = "nodejs";

const ELEVENLABS_WEBHOOK_SECRET = process.env.ELEVENLABS_WEBHOOK_SECRET ?? "";

const db = getAdminDb();

interface ElevenLabsWebhookPayload {
  event: string;
  conversation_id: string;
  agent_id?: string;
  user_id?: string;
  status?: string;
  call_duration?: number;
  transcript?: string;
  summary?: string;
  reason_for_call?: string;
  caller_phone?: string;
  timestamp?: number;
  custom_metadata?: Record<string, unknown>;
}

/**
 * Verify ElevenLabs webhook signature (HMAC-SHA256).
 * ElevenLabs sends the signature in the `elevenlabs-signature` header.
 */
async function verifyElevenLabsSignature(
  body: string,
  signatureHeader: string | null
): Promise<boolean> {
  if (!ELEVENLABS_WEBHOOK_SECRET || !signatureHeader) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(ELEVENLABS_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const expected = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // ElevenLabs may send "v0=<hex>" or just "<hex>"
  const provided = signatureHeader.replace(/^v\d+=/, "");
  return expected === provided;
}

async function handler(req: NextRequest) {
  try {
    const rawBody = await req.text();

    // Verify webhook signature — fail closed if secret not configured
    if (!ELEVENLABS_WEBHOOK_SECRET) {
      console.error("[ElevenLabs webhook] ELEVENLABS_WEBHOOK_SECRET is not configured");
      return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
    }

    const sig = req.headers.get("elevenlabs-signature");
    const valid = await verifyElevenLabsSignature(rawBody, sig);
    if (!valid) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const payload: ElevenLabsWebhookPayload = JSON.parse(rawBody);

    // Webhook events we care about:
    // - conversation.started: call initiated
    // - conversation.ended: call completed
    // - call.transcript.update: transcript available
    // - agent.message: agent spoke
    // - user.message: caller spoke

    if (!payload.conversation_id || !payload.agent_id) {
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    // Extract clinic ID from custom_metadata or agent_id
    // For now, we'll need to query clinics to find which clinic owns this agent
    const agentId = payload.agent_id;

    // Find clinic by agent_id
    const clinicSnap = await db.collection("clinics")
      .where("ava.agent_id", "==", agentId)
      .limit(1)
      .get();

    if (clinicSnap.empty) {
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    const clinicId = clinicSnap.docs[0].id;
    const conversationId = payload.conversation_id;

    // Store or update call log entry
    const callRef = db
      .collection("clinics")
      .doc(clinicId)
      .collection("call_log")
      .doc(conversationId);

    const callData = {
      agentId,
      conversationId,
      event: payload.event,
      status: payload.status || "pending",
      callerPhone: payload.caller_phone || null,
      transcript: payload.transcript || null,
      callSummary: payload.summary || null,
      reasonForCall: payload.reason_for_call || null,
      durationSeconds: payload.call_duration || null,
      startTimestamp: payload.timestamp ? payload.timestamp * 1000 : Date.now(),
      updatedAt: new Date().toISOString(),
    };

    // Merge with existing call data if it exists
    await callRef.set(callData, { merge: true });

    // If call ended, calculate outcome
    if (payload.event === "conversation.ended" && payload.summary) {
      const summary = payload.summary.toLowerCase();
      let outcome = "resolved";

      if (summary.includes("book") || summary.includes("appointment")) {
        outcome = "booked";
      } else if (summary.includes("cancel") || summary.includes("cancelled")) {
        outcome = "follow_up_required";
      } else if (summary.includes("voicemail") || !payload.transcript) {
        outcome = "voicemail";
      } else if (summary.includes("escalat") || summary.includes("urgent")) {
        outcome = "escalated";
      }

      await callRef.update({ outcome });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    // Always return 200 to acknowledge receipt — ElevenLabs handles retries
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 200 }
    );
  }
}

export const POST = withRequestLog(handler);
