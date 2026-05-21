import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import crypto from "crypto";

export const runtime = "nodejs";

// ElevenLabs signs post-call webhooks with HMAC-SHA256 using the webhook secret.
// Header: ElevenLabs-Signature: t=<timestamp>,v0=<hmac>
function verifyElevenLabsSignature(
  secret: string,
  rawBody: string,
  signatureHeader: string
): boolean {
  try {
    const parts = Object.fromEntries(
      signatureHeader.split(",").map((p) => p.split("=") as [string, string])
    );
    const timestamp = parts["t"];
    const received = parts["v0"];
    if (!timestamp || !received) return false;
    const payload = `${timestamp}.${rawBody}`;
    const expected = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");
    return crypto.timingSafeEqual(
      Buffer.from(received, "hex"),
      Buffer.from(expected, "hex")
    );
  } catch {
    return false;
  }
}

interface ElevenLabsTranscriptTurn {
  role: "agent" | "user";
  message: string;
  time_in_call_secs?: number;
}

interface ElevenLabsPostCallPayload {
  type: string;
  event_timestamp?: number;
  data: {
    conversation_id: string;
    agent_id: string;
    status: string;
    transcript?: ElevenLabsTranscriptTurn[];
    metadata?: {
      start_time_unix_secs?: number;
      call_duration_secs?: number;
      termination_reason?: string;
      phone_call?: {
        caller_id?: string;
        callee_id?: string;
      } | null;
    };
    analysis?: {
      call_successful?: string | boolean | null;
      transcript_summary?: string | null;
    };
  };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.ELEVENLABS_WEBHOOK_SECRET ?? "";
  const rawBody = await req.text();

  // Validate signature if secret is configured
  if (secret) {
    const sig = req.headers.get("elevenlabs-signature") ?? "";
    if (!sig || !verifyElevenLabsSignature(secret, rawBody, sig)) {
      console.error("[post-call] ElevenLabs signature validation failed");
      return new NextResponse("Forbidden", { status: 403 });
    }
  }

  let payload: ElevenLabsPostCallPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new NextResponse("Bad Request", { status: 400 });
  }

  // Only handle post_call_transcription events
  if (payload.type !== "post_call_transcription") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const { conversation_id, agent_id, status, transcript, metadata, analysis } =
    payload.data ?? {};

  if (!conversation_id || !agent_id) {
    return new NextResponse("Missing conversation_id or agent_id", {
      status: 400,
    });
  }

  const db = getAdminDb();

  // Resolve clinicId from agent_id stored in clinics/{id}.ava.agent_id
  let clinicId: string | null = null;
  try {
    const snap = await db
      .collection("clinics")
      .where("ava.agent_id", "==", agent_id)
      .limit(1)
      .get();
    if (!snap.empty) clinicId = snap.docs[0].id;
  } catch (err) {
    console.error("[post-call] Firestore clinic lookup failed:", err);
  }

  if (!clinicId) {
    // Log but don't fail — agent may not be registered yet
    console.warn(
      `[post-call] No clinic found for agent_id ${agent_id}, conversation ${conversation_id}`
    );
    return NextResponse.json({ ok: true, clinicId: null });
  }

  const callerPhone =
    metadata?.phone_call?.caller_id ?? null;
  const durationSecs = metadata?.call_duration_secs ?? null;
  const startTimestamp = metadata?.start_time_unix_secs
    ? metadata.start_time_unix_secs * 1000
    : null;
  const endTimestamp =
    startTimestamp && durationSecs
      ? startTimestamp + durationSecs * 1000
      : null;

  const callSuccessfulRaw = analysis?.call_successful;
  const callSuccessful =
    callSuccessfulRaw === "success" ||
    callSuccessfulRaw === true ||
    callSuccessfulRaw === "true";

  const flatTranscript = (transcript ?? [])
    .map((t) => `${t.role === "agent" ? "Ava" : "Caller"}: ${t.message}`)
    .join("\n");

  const doc = {
    callId: conversation_id,
    agentId: agent_id,
    callType: "phone_call" as const,
    callStatus: status === "done" ? "completed" : status,
    callerPhone,
    toNumber: null,
    patientId: null,
    reasonForCall: null,
    outcome: null,
    urgency: null,
    callSummary: analysis?.transcript_summary ?? null,
    userSentiment: null,
    callSuccessful,
    inVoicemail: false,
    transcript: flatTranscript || null,
    transcriptUrl: null,
    recordingUrl: null,
    durationSeconds: durationSecs,
    startTimestamp,
    endTimestamp,
    disconnectionReason: metadata?.termination_reason ?? null,
    callbackType: null,
    actionedAt: null,
    actionedBy: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  try {
    await db
      .collection("clinics")
      .doc(clinicId)
      .collection("voiceInteractions")
      .doc(conversation_id)
      .set(doc, { merge: true });

    console.log(
      `[post-call] Wrote voiceInteraction ${conversation_id} for clinic ${clinicId}`
    );
  } catch (err) {
    console.error("[post-call] Firestore write failed:", err);
    return new NextResponse("Internal Server Error", { status: 500 });
  }

  return NextResponse.json({ ok: true, clinicId, conversationId: conversation_id });
}
