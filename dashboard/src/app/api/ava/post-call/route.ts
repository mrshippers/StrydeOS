import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { verifyElevenLabsSignature, isWebhookSecretConfigured } from "@/lib/ava/verify-signature";
import { POST as canonicalPostCall } from "@/app/api/webhooks/elevenlabs/route";

export const runtime = "nodejs";

/**
 * Thin delegate → /api/webhooks/elevenlabs (the CANONICAL Ava post-call
 * handler).
 *
 * This route used to write its own `voiceInteractions` collection with
 * outcome:null and emit NO cross-module events. That created a split brain: if
 * ElevenLabs was pointed here instead of /api/webhooks/elevenlabs, Digest /
 * Pulse / Intelligence went dark because the canonical call_log / call_facts /
 * insight_events writes never happened.
 *
 * It now keeps zero write logic of its own. It verifies the inbound signature
 * (shared verifier, incl. replay-window check), normalises the
 * `post_call_transcription` shape into the canonical flat
 * `ElevenLabsWebhookPayload`, re-signs, and forwards to the canonical handler
 * so there is exactly one place that writes call data and fires side effects.
 * Prefer registering /api/webhooks/elevenlabs directly; this path is retained
 * only for backward compatibility with any agent still pointed here.
 */

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

/** Build a valid `t=<ts>,v0=<hex>` ElevenLabs signature header for `body`. */
function signCanonicalBody(secret: string, body: string): string {
  const ts = Math.floor(Date.now() / 1000).toString();
  const hmac = crypto
    .createHmac("sha256", secret)
    .update(`${ts}.${body}`)
    .digest("hex");
  return `t=${ts},v0=${hmac}`;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text();

  // Fail closed: an unset secret is a deploy bug, not an excuse to ingest
  // unauthenticated call transcripts. 200 + config_missing suppresses
  // ElevenLabs retry storms while the deploy is fixed (same policy as the
  // canonical handler).
  if (!isWebhookSecretConfigured()) {
    console.error(
      "[CRITICAL] [post-call] ELEVENLABS_WEBHOOK_SECRET not configured — refusing to process. Returning 200 to suppress retries; fix the deploy.",
    );
    return NextResponse.json(
      { error: "config_missing", reason: "ELEVENLABS_WEBHOOK_SECRET not configured" },
      { status: 200 },
    );
  }

  const sig = req.headers.get("elevenlabs-signature");
  if (!(await verifyElevenLabsSignature(rawBody, sig))) {
    console.error("[post-call] ElevenLabs signature validation failed");
    return new NextResponse("Forbidden", { status: 403 });
  }

  let payload: ElevenLabsPostCallPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new NextResponse("Bad Request", { status: 400 });
  }

  // Only post_call_transcription carries the terminal transcript. Anything else
  // is acked and dropped — the canonical handler owns the live-event lifecycle.
  if (payload.type !== "post_call_transcription") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const { conversation_id, agent_id, status, transcript, metadata, analysis } =
    payload.data ?? {};

  if (!conversation_id || !agent_id) {
    return new NextResponse("Missing conversation_id or agent_id", { status: 400 });
  }

  // Normalise the post_call_transcription shape into the canonical flat
  // ElevenLabsWebhookPayload. We map it to `conversation.ended` with a summary
  // so the canonical handler runs the full classify → write → notify pipeline.
  const flatTranscript = (transcript ?? [])
    .map((t) => `${t.role === "agent" ? "Ava" : "Caller"}: ${t.message}`)
    .join("\n");

  const canonicalPayload = {
    event: "conversation.ended" as const,
    conversation_id,
    agent_id,
    status: status === "done" ? "completed" : status,
    caller_phone: metadata?.phone_call?.caller_id ?? undefined,
    transcript: flatTranscript || undefined,
    summary: analysis?.transcript_summary ?? (flatTranscript || ""),
    call_duration: metadata?.call_duration_secs ?? undefined,
    timestamp: metadata?.start_time_unix_secs ?? undefined,
  };

  // Re-sign with our own freshly-stamped timestamp so the canonical handler's
  // signature + replay-window check passes on the forwarded request.
  const canonicalBody = JSON.stringify(canonicalPayload);
  const secret = process.env.ELEVENLABS_WEBHOOK_SECRET ?? "";
  const forwarded = new NextRequest(
    new URL("/api/webhooks/elevenlabs", req.url),
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "elevenlabs-signature": signCanonicalBody(secret, canonicalBody),
      },
      body: canonicalBody,
    },
  );

  return canonicalPostCall(forwarded);
}
