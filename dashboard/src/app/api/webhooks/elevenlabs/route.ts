import { NextRequest, NextResponse } from "next/server";
import { getFirestore } from "firebase-admin/firestore";
import { initializeApp, getApps } from "firebase-admin/app";

// Ensure Firebase Admin is initialized
if (!getApps().length) {
  initializeApp();
}

const db = getFirestore();

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

export async function POST(req: NextRequest) {
  try {
    const payload: ElevenLabsWebhookPayload = await req.json();

    console.log("[ElevenLabs webhook]", {
      event: payload.event,
      conversation_id: payload.conversation_id,
      agent_id: payload.agent_id,
    });

    // Webhook events we care about:
    // - conversation.started: call initiated
    // - conversation.ended: call completed
    // - call.transcript.update: transcript available
    // - agent.message: agent spoke
    // - user.message: caller spoke

    if (!payload.conversation_id || !payload.agent_id) {
      console.warn("[ElevenLabs webhook] Missing conversation_id or agent_id");
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
      console.warn("[ElevenLabs webhook] No clinic found for agent", agentId);
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
    console.error("[ElevenLabs webhook error]", error);
    // Always return 200 to acknowledge webhook received
    // (retry logic is ElevenLabs' responsibility)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Webhook processing failed" },
      { status: 200 }
    );
  }
}
