import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { withRequestLog } from "@/lib/request-logger";
import type { AvaAction } from "@/lib/ava/graph";
import { sendCallbackNotification } from "@/lib/ava/notify-callback";

export const runtime = "nodejs";

const ELEVENLABS_WEBHOOK_SECRET = process.env.ELEVENLABS_WEBHOOK_SECRET ?? "";

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
  if (expected.length !== provided.length) return false;
  const a = new TextEncoder().encode(expected);
  const b = new TextEncoder().encode(provided);
  // Constant-time comparison to prevent timing attacks
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}

async function handler(req: NextRequest) {
  const db = getAdminDb();

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

    // If call ended, run LangGraph for intent classification + guardrail check
    if (payload.event === "conversation.ended" && payload.summary) {
      const clinicData = clinicSnap.docs[0].data();
      const clinicName = clinicData?.name ?? "Clinic";

      // Process through LangGraph state machine
      let outcome = "resolved";
      let graphAction: AvaAction = "continue";
      let graphMetadata: Record<string, unknown> = {};

      try {
        // Dynamic import to avoid loading LangChain at module level
        // (requires ANTHROPIC_API_KEY which may not be set in all environments)
        const { processCallerInput } = await import("@/lib/ava/graph");
        const graphResult = await processCallerInput(
          payload.summary + (payload.reason_for_call ? ` | Reason: ${payload.reason_for_call}` : ""),
          {
            clinicId,
            clinicName,
            callerPhone: payload.caller_phone ?? "",
          },
        );
        graphAction = graphResult.action;
        graphMetadata = graphResult.metadata ?? {};

        // Map graph actions to call outcomes
        switch (graphAction) {
          case "book_appointment":
            outcome = "booked";
            break;
          case "escalate_999":
            outcome = "escalated";
            break;
          case "callback_request":
            outcome = "follow_up_required";
            break;
          case "transfer_call":
            outcome = "transferred";
            break;
          case "relay_message":
            outcome = "follow_up_required";
            break;
          case "end_call":
            outcome = "resolved";
            break;
          default: {
            // Fallback to keyword match for edge cases
            const summary = payload.summary.toLowerCase();
            if (summary.includes("book") || summary.includes("appointment")) outcome = "booked";
            else if (!payload.transcript) outcome = "voicemail";
            break;
          }
        }
      } catch {
        // LangGraph unavailable — fall back to keyword matching
        const summary = payload.summary.toLowerCase();
        if (summary.includes("book") || summary.includes("appointment")) outcome = "booked";
        else if (summary.includes("cancel")) outcome = "follow_up_required";
        else if (!payload.transcript) outcome = "voicemail";
        else if (summary.includes("escalat") || summary.includes("urgent")) outcome = "escalated";
      }

      await callRef.update({
        outcome,
        graphAction,
        graphIntent: graphMetadata.reason ?? null,
        graphMetadata: Object.keys(graphMetadata).length > 0 ? graphMetadata : null,
      });

      // Fire-and-forget SMS notification for escalated / callback calls
      if (outcome === "follow_up_required" || outcome === "escalated") {
        void sendCallbackNotification({
          clinicId,
          callerPhone: payload.caller_phone ?? null,
          callbackType: (graphMetadata.callbackType as string) ?? "general",
          reason:
            (graphMetadata.reason as string) ??
            payload.reason_for_call ??
            null,
          conversationId,
        });
      }
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    // Return 500 for transient errors so ElevenLabs retries delivery
    if (error instanceof SyntaxError) {
      // Non-recoverable: malformed JSON — ack so ElevenLabs doesn't retry
      return NextResponse.json({ error: "Malformed payload" }, { status: 200 });
    }
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}

export const POST = withRequestLog(handler);
