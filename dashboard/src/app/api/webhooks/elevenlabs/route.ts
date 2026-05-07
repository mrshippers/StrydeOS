import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { getTrace, withRequestLog } from "@/lib/request-logger";
import type { AvaAction } from "@/lib/ava/graph";
import { sendCallbackNotification, sendBookingAcknowledgement } from "@/lib/ava/notify-callback";
import { verifyElevenLabsSignature, isWebhookSecretConfigured } from "@/lib/ava/verify-signature";
import {
  CONTRACTS_SCHEMA_VERSION,
  asClinicId,
  asConversationId,
  asEventId,
  makeIdempotencyKey,
  makeRootTrace,
  type AvaCallFactEvent,
  type AvaCallFactPayload,
  type AvaCallLogEntry,
  type AvaCallOutcome,
  type AvaInsightEventMetadata,
  type AvaInsightEventType,
  type AvaPmsType,
  type ElevenLabsWebhookPayload,
} from "@/lib/contracts";
import type { InsightEvent, InsightSeverity } from "@/types/insight-events";

export const runtime = "nodejs";

async function handler(req: NextRequest) {
  const db = getAdminDb();

  try {
    const rawBody = await req.text();

    // Verify webhook signature — fail closed if secret not configured
    if (!isWebhookSecretConfigured()) {
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

    const callData: AvaCallLogEntry = {
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
      } catch (err) {
        // LangGraph unavailable — fall back to keyword matching
        console.error("[ElevenLabs webhook] LangGraph processing failed:", err instanceof Error ? err.message : String(err));
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

      // Booking acknowledgement SMS to patient
      if (outcome === "booked" && payload.caller_phone) {
        sendBookingAcknowledgement({
          clinicId,
          callerPhone: payload.caller_phone,
          conversationId,
        }).catch((err) => { console.error("[sendBookingAcknowledgement] Failed:", err instanceof Error ? err.message : String(err)); });
      }

      // Fire-and-forget SMS notification for escalated / callback calls
      if (outcome === "follow_up_required" || outcome === "escalated") {
        sendCallbackNotification({
          clinicId,
          callerPhone: payload.caller_phone ?? null,
          callbackType: (graphMetadata.callbackType as string) ?? "general",
          reason:
            (graphMetadata.reason as string) ??
            payload.reason_for_call ??
            null,
          conversationId,
        }).catch((err) => { console.error("[sendCallbackNotification] Failed:", err instanceof Error ? err.message : String(err)); });
      }

      // ─── Cross-module bus: emit InsightEvent for Pulse / Intelligence ───────
      // The SMS path above is best-effort human notification; this write is the
      // structured handoff so Pulse's insight-event-consumer can run continuity
      // cadences and Intelligence's insight UI can surface owner-facing signals.
      // Idempotent: deterministic id collapses ElevenLabs retries to one write.
      // Wrapped in try/catch — never let an insight_events failure surface 500
      // to ElevenLabs (would trigger a retry of the whole webhook).
      try {
        let avaEventType: AvaInsightEventType | null = null;
        let severity: InsightSeverity = "warning";
        let actionTarget: "owner" | "patient" = "owner";
        let title = "";
        let suggestedAction = "";

        if (outcome === "follow_up_required") {
          avaEventType = "AVA_CALLBACK_REQUESTED";
          severity = "warning";
          actionTarget = "patient";
          title = "Ava: callback requested";
          suggestedAction = "Follow up with the caller — Ava flagged this call for human callback.";
        } else if (outcome === "escalated") {
          avaEventType = "AVA_CALL_ESCALATED";
          severity = "critical";
          actionTarget = "owner";
          title = "Ava: call escalated";
          suggestedAction = "Urgent: Ava escalated this call. Review immediately.";
        } else if (outcome === "booked") {
          avaEventType = "AVA_CALL_BOOKED";
          severity = "positive";
          actionTarget = "owner";
          title = "Ava: booking captured";
          suggestedAction = "New booking captured by Ava — no action required.";
        }

        if (avaEventType) {
          const callerPhone = payload.caller_phone ?? null;
          const callbackType = (graphMetadata.callbackType as string | undefined) ?? null;
          const reason =
            (graphMetadata.reason as string | undefined) ??
            payload.reason_for_call ??
            null;
          const callDurationSeconds =
            typeof payload.call_duration === "number" ? payload.call_duration : null;

          const description = callerPhone
            ? `${title} (caller ${callerPhone})`
            : title;

          const metadata: AvaInsightEventMetadata = {
            conversationId,
            callerPhone,
            callbackType,
            reason,
            callDurationSeconds,
          };

          const deterministicId = `ava-${conversationId}-${avaEventType}`;
          const insightDoc: InsightEvent = {
            id: deterministicId,
            type: avaEventType,
            clinicId,
            severity,
            title,
            description,
            suggestedAction,
            actionTarget,
            createdAt: new Date().toISOString(),
            consumedBy: [],
            metadata: metadata as unknown as Record<string, unknown>,
          };

          await db
            .collection("clinics")
            .doc(clinicId)
            .collection("insight_events")
            .doc(deterministicId)
            .set(insightDoc, { merge: true });
        }
      } catch (err) {
        console.error(
          "[ElevenLabs webhook] insight_events write failed:",
          err instanceof Error ? err.message : String(err),
        );
      }

      // ─── Ava → Intelligence fact stream (call_facts) ─────────────────────
      // Captures atomic call facts for Intelligence to compute voice-channel
      // KPIs (booking conversion, after-hours capture, FCR, transfer rate).
      // Idempotent: deterministic id + Firestore set/merge collapses retries.
      // Wrapped in try/catch — fact-stream failure must never 500 the webhook.
      try {
        const clinicData = clinicSnap.docs[0].data() as Record<string, unknown>;
        const pmsType: AvaPmsType =
          ((clinicData.pmsProvider as AvaPmsType | undefined) ?? "writeupp");

        const startedAt = payload.timestamp
          ? new Date(payload.timestamp * 1000).toISOString()
          : new Date(
              Date.now() - (payload.call_duration ?? 0) * 1000
            ).toISOString();
        const endedAt = new Date().toISOString();

        const factPayload: AvaCallFactPayload = {
          conversationId: asConversationId(conversationId),
          callerPhone: payload.caller_phone ?? null,
          startedAt,
          endedAt,
          durationSeconds: payload.call_duration ?? 0,
          outcome: outcome as AvaCallOutcome,
          booked: outcome === "booked",
          ...(graphMetadata.bookingId
            ? { appointmentExternalId: String(graphMetadata.bookingId) }
            : {}),
          pmsType,
          transferred: outcome === "transferred",
          escalated: outcome === "escalated",
          // patientMatched / outOfHours / proposalCount are intentionally
          // omitted: producer doesn't have reliable signal yet. Intelligence
          // skips dependent KPIs when the field is undefined.
        };

        const factEventId = `ava-fact-${conversationId}`;
        const trace = getTrace() ?? makeRootTrace("ava", startedAt);
        const factEvent: AvaCallFactEvent = {
          id: asEventId(factEventId),
          type: "AVA_CALL_ENDED",
          schemaVersion: CONTRACTS_SCHEMA_VERSION,
          clinicId: asClinicId(clinicId),
          source: "ava",
          actor: { kind: "external", provider: "elevenlabs" },
          trace,
          idempotencyKey: makeIdempotencyKey("ava", `call-fact:${conversationId}`),
          times: {
            occurredAt: endedAt,
            detectedAt: endedAt,
            createdAt: endedAt,
          },
          payload: factPayload,
        };

        await db
          .collection("clinics")
          .doc(clinicId)
          .collection("call_facts")
          .doc(factEventId)
          .set(factEvent, { merge: true });
      } catch (err) {
        console.error(
          "[ElevenLabs webhook] call_facts write failed:",
          err instanceof Error ? err.message : String(err),
        );
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
