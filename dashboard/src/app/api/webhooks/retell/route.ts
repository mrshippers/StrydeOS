/**
 * POST /api/webhooks/retell
 *
 * Receives Retell AI webhook events (call_started, call_ended, call_analyzed)
 * and persists them to Firestore under:
 *   clinics/{clinicId}/voiceInteractions/{callId}
 *
 * The clinicId is resolved from RETELL_CLINIC_ID env var (single-clinic Spires
 * deployment) — multi-tenant resolution can be added via metadata.clinicId
 * injected into the Retell agent's metadata field.
 *
 * Retell sends a webhook for each event type. call_analyzed fires last and
 * contains the full transcript + call analysis — we do a merge write so all
 * three events enrich the same document.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyRetellWebhook, type RetellWebhookEvent } from "@/lib/retell/client";
import type { VoiceInteractionOutcome, VoiceInteractionUrgency } from "@/lib/firebase/voiceInteractions";
import { VOICE_INTERACTIONS_COLLECTION } from "@/lib/firebase/voiceInteractions";
import { FieldValue } from "firebase-admin/firestore";
import { withRequestLog } from "@/lib/request-logger";

// RETELL_CLINIC_ID must be set explicitly — no fallback to prevent silent wrong-clinic writes
const CLINIC_ID = process.env.RETELL_CLINIC_ID;
// RETELL_SKIP_SIG_VERIFY is dev-only — blocked in production regardless of env var
const SKIP_SIG_VERIFY =
  process.env.NODE_ENV !== "production" &&
  process.env.RETELL_SKIP_SIG_VERIFY === "true";

async function handler(request: NextRequest): Promise<NextResponse> {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-retell-signature");

    // Signature verification (skip in dev if flag set)
    if (!SKIP_SIG_VERIFY) {
      const valid = await verifyRetellWebhook(rawBody, signature);
      if (!valid) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }

    const event = JSON.parse(rawBody) as RetellWebhookEvent;
    const { call } = event;

    if (!call?.call_id) {
      return NextResponse.json({ error: "Missing call_id" }, { status: 400 });
    }

    // Allow clinicId to be passed via agent metadata for multi-tenant use
    const clinicId = (call.metadata?.clinicId as string | undefined) ?? CLINIC_ID;
    if (!clinicId) {
      return NextResponse.json(
        { error: "RETELL_CLINIC_ID is not configured — set it in Vercel env vars" },
        { status: 500 }
      );
    }

    const db = getAdminDb();
    const docRef = db
      .collection("clinics")
      .doc(clinicId)
      .collection(VOICE_INTERACTIONS_COLLECTION)
      .doc(call.call_id);

    const now = new Date().toISOString();

    switch (event.event) {
      case "call_started": {
        await docRef.set(
          {
            callId: call.call_id,
            agentId: call.agent_id,
            callStatus: "ongoing",
            callType: call.call_type ?? "phone_call",
            callerPhone: call.from_number ?? null,
            toNumber: call.to_number ?? null,
            startTimestamp: call.start_timestamp ?? Date.now(),
            patientId: (call.metadata?.patientId as string) ?? null,
            reasonForCall: (call.metadata?.reasonForCall as string) ?? null,
            outcome: null,
            urgency: null,
            transcriptUrl: null,
            recordingUrl: null,
            durationSeconds: null,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        break;
      }

      case "call_ended": {
        const durationMs =
          call.duration_ms ??
          (call.end_timestamp && call.start_timestamp
            ? call.end_timestamp - call.start_timestamp
            : null);

        await docRef.set(
          {
            callStatus: call.call_status ?? "ended",
            endTimestamp: call.end_timestamp ?? Date.now(),
            durationSeconds: durationMs != null ? Math.round(durationMs / 1000) : null,
            recordingUrl: call.recording_url ?? null,
            disconnectionReason: call.disconnection_reason ?? null,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        break;
      }

      case "call_analyzed": {
        const analysis = call.call_analysis ?? {};
        const outcome = mapOutcome({}, call);
        const urgency = mapUrgency({}, call);

        await docRef.set(
          {
            callStatus: "analyzed",
            outcome,
            urgency,
            callSummary: analysis.call_summary ?? null,
            userSentiment: analysis.user_sentiment ?? null,
            callSuccessful: analysis.call_successful ?? null,
            inVoicemail: analysis.in_voicemail ?? false,
            customAnalysis: analysis.custom_analysis_data ?? null,
            transcript: call.transcript ?? null,
            recordingUrl: call.recording_url ?? null,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        break;
      }

      default:
        // Unknown event — log and return 200 so Retell doesn't retry
        break;
    }

    return NextResponse.json({ ok: true, event: event.event, callId: call.call_id });
  } catch (err) {
    console.error("[retell webhook error]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mapOutcome(
  _analysis: Record<string, unknown>,
  call: RetellWebhookEvent["call"]
): VoiceInteractionOutcome {
  // Custom analysis data from Retell LLM can set outcome directly
  const custom = call.call_analysis?.custom_analysis_data;
  if (custom?.outcome) return custom.outcome as VoiceInteractionOutcome;

  if (call.call_analysis?.in_voicemail) return "voicemail";
  if (call.call_analysis?.call_successful === false) return "follow_up_required";

  // Heuristic: parse summary keywords
  const summary = (call.call_analysis?.call_summary ?? "").toLowerCase();
  if (summary.includes("book") || summary.includes("appointment confirmed")) return "booked";
  if (summary.includes("escalat") || summary.includes("transfer")) return "escalated";
  if (summary.includes("voicemail")) return "voicemail";
  if (call.call_analysis?.call_successful === true) return "resolved";

  return null;
}

function mapUrgency(
  _analysis: Record<string, unknown>,
  call: RetellWebhookEvent["call"]
): VoiceInteractionUrgency {
  const custom = call.call_analysis?.custom_analysis_data;
  if (custom?.urgency) return custom.urgency as VoiceInteractionUrgency;

  const summary = (call.call_analysis?.call_summary ?? "").toLowerCase();
  if (summary.includes("urgent") || summary.includes("emergency") || summary.includes("a&e")) return "urgent";
  if (summary.includes("pain") && summary.includes("severe")) return "high";
  if (summary.includes("follow up") || summary.includes("callback")) return "medium";
  return "low";
}

export const POST = withRequestLog(handler);

