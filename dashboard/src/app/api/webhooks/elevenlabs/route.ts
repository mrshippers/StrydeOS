import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { getTrace, withRequestLog } from "@/lib/request-logger";
import { writeModuleHealth } from "@/lib/module-health";
import type { AvaAction } from "@/lib/ava/graph";
import { sendCallbackNotification, sendBookingAcknowledgement } from "@/lib/ava/notify-callback";
import { verifyElevenLabsSignature, isWebhookSecretConfigured } from "@/lib/ava/verify-signature";
import { claimAvaWebhookEvent } from "@/lib/ava/processed-events";
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

// ─── CANONICAL Ava post-call handler ────────────────────────────────────────
// This route is the single source of truth for Ava call ingestion. It owns the
// canonical collection set:
//   - clinics/{id}/call_log      (full call record)
//   - clinics/{id}/call_facts    (Intelligence KPI fact stream)
//   - clinics/{id}/insight_events (Pulse / Intelligence cross-module bus)
// Register THIS URL (/api/webhooks/elevenlabs) as the ElevenLabs post-call
// webhook. /api/ava/post-call is a thin delegate that forwards here so a
// mis-registered URL cannot silently dark Digest/Pulse/Intelligence by writing
// to a divergent `voiceInteractions` collection.
async function handler(req: NextRequest) {
  const db = getAdminDb();

  try {
    const rawBody = await req.text();

    // Verify webhook signature.
    //
    // If the secret isn't configured on OUR side that's a deploy bug, not a
    // transient failure. Returning 5xx makes ElevenLabs retry-storm us for
    // hours. Return 200 with structured `config_missing` and log loudly so
    // the on-call sees it — retries won't fix a missing env var.
    if (!isWebhookSecretConfigured()) {
      console.error(
        "[CRITICAL] [ElevenLabs webhook] ELEVENLABS_WEBHOOK_SECRET not configured — refusing to process. Returning 200 to suppress retries; fix the deploy.",
      );
      return NextResponse.json(
        { error: "config_missing", reason: "ELEVENLABS_WEBHOOK_SECRET not configured" },
        { status: 200 },
      );
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

    // Retention (GDPR): the call_log doc carries verbatim transcript + caller
    // phone. Stamp a `purgeAfter` epoch-ms TTL so the data-health/cleanup cron
    // can hard-delete it once the window elapses. Configurable via env; default
    // 365 days (matches the existing call_log retention policy in
    // data-health/cleanup). Whole-clinic erasure (clinic-erasure.ts) already
    // sweeps this collection via listCollections() on termination.
    const transcriptRetentionDays = (() => {
      const raw = Number(process.env.AVA_TRANSCRIPT_RETENTION_DAYS);
      return Number.isFinite(raw) && raw > 0 ? raw : 365;
    })();

    const callData: AvaCallLogEntry & { purgeAfter: number } = {
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
      purgeAfter: Date.now() + transcriptRetentionDays * 86400000,
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
            // A red-flag handoff sets metadata.escalate — it is a clinical
            // escalation, not a routine reception transfer, so it must raise the
            // critical insight + escalation SMS rather than a quiet "transferred".
            outcome = graphMetadata.escalate ? "escalated" : "transferred";
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

      // ─── Live-call outcome guard (never downgrade a terminal outcome) ───────
      // callRef points at the SAME call_log doc that the live-call transfer
      // handler (transfer-call.ts) writes during a warm transfer:
      //   { transferredAt, transferredTo, transferReason, outcome: "transferred" }
      // That live write is the authoritative outcome. The post-call summary
      // classifier above must NOT clobber it (a real transfer or escalation
      // being re-labelled "resolved"/"booked"/etc by the LLM summary). If the
      // doc already carries a terminal live-call marker, keep it and let the
      // rest of the pipeline (SMS / insight / call_facts) follow the preserved
      // value.
      const existing: FirebaseFirestore.DocumentData = (await callRef.get()).data() ?? {};
      const existingOutcome = typeof existing.outcome === "string" ? existing.outcome : null;
      const liveBookingExternalId =
        typeof existing.bookingExternalId === "string" && existing.bookingExternalId.trim()
          ? existing.bookingExternalId
          : null;
      const liveCancelledAt =
        typeof existing.cancelledAt === "string" && existing.cancelledAt.trim()
          ? existing.cancelledAt
          : null;
      // Escalation precedence: `escalated` is the strictly-higher clinical
      // outcome and must win over a prior live `transferred` marker. A red-flag
      // warm transfer (transfer-call.ts) writes { transferredAt, outcome:
      // "transferred" } DURING the call; the post-call graph then resolves the
      // same call as an escalation (transfer_call + metadata.escalate). Capture
      // that escalation BEFORE the guard so the ordering only ever blocks
      // escalated -> (lesser), never (lesser) -> escalated — otherwise the
      // critical AVA_CALL_ESCALATED insight + escalation SMS (both gate on
      // outcome === "escalated") never fire and a clinical red flag is logged as
      // a routine transfer.
      const computedEscalation = graphMetadata.escalate === true || outcome === "escalated";
      if (computedEscalation || existingOutcome === "escalated") {
        outcome = "escalated";
      } else if (existingOutcome === "transferred" || existing.transferredAt) {
        outcome = "transferred";
      } else if (liveBookingExternalId) {
        // The live booking tool (/api/ava/tools) created a real PMS appointment
        // during the call. That is an authoritative terminal outcome — the LLM
        // summary classifier must not bury it as resolved/follow_up just because
        // the closing chit-chat didn't say "booked". A genuine booking also means
        // the patient is owed the booking-acknowledgement SMS, not a callback.
        // A reschedule writes bookingExternalId too, so it correctly lands here.
        outcome = "booked";
      } else if (liveCancelledAt) {
        // The live cancel tool freed a slot during the call. A happy-path cancel
        // leaves graphAction="continue", which would otherwise resolve the call
        // silently. Lift it to follow_up_required so it raises
        // AVA_CALLBACK_REQUESTED and Pulse chases the freed slot. (A reschedule
        // never reaches here — it sets bookingExternalId above.)
        outcome = "follow_up_required";
      }

      await callRef.update({
        outcome,
        graphAction,
        graphIntent: graphMetadata.reason ?? null,
        graphMetadata: Object.keys(graphMetadata).length > 0 ? graphMetadata : null,
      });

      // ─── Replay / retry guard ──────────────────────────────────────────────
      // The call_log/call_facts writes are idempotent (deterministic ids +
      // set/merge), but the SMS + insight side effects below are NOT — a replay
      // or an ElevenLabs at-least-once retry would re-text the patient and
      // re-fire booking events. Atomically claim this (conversationId, event)
      // before any side effect; only the first caller proceeds. Failures here
      // bubble to the outer catch → 500 → ElevenLabs retries (safe: claim is
      // atomic, so the retry that wins is the only one that runs side effects).
      const firstDelivery = await claimAvaWebhookEvent(
        db,
        clinicId,
        conversationId,
        payload.event,
      );
      if (!firstDelivery) {
        await writeModuleHealth(db, clinicId, {
          module: "ava",
          status: "ok",
          counts: { processed: 1, succeeded: 0, failed: 0, skipped: 1 },
          diagnostics: { lastEvent: payload.event, conversationId, deduplicated: true },
        });
        return NextResponse.json({ ok: true, deduplicated: true }, { status: 200 });
      }

      // Release the dedup claim so an at-least-once ElevenLabs retry is not blocked
      // when a side effect below throws. Best-effort: if the delete itself fails the
      // retry still 500s and the cleanup cron reclaims the doc.
      const releaseDedupClaim = async () => {
        await db
          .collection("clinics")
          .doc(clinicId)
          .collection("_ava_processed_events")
          .doc(`${conversationId}__${payload.event}`)
          .delete()
          .catch(() => {});
      };

      // ─── Side-effect ordering (durable, exactly-once) ───────────────────────
      // The dedup claim above is committed BEFORE every side effect, so a
      // swallowed failure would permanently drop the signal while the claim
      // blocked any redelivery. We run the IDEMPOTENT writes first (insight_events
      // then call_facts — both set/merge on deterministic ids) and the
      // NON-idempotent SMS sends LAST, and give all three the same
      // release-claim-and-rethrow treatment. Any earlier-write failure releases the
      // claim and 500s; the retry re-runs the idempotent writes and only then sends
      // the SMS exactly once (the failed attempt never reached the send).

      // ─── Cross-module bus: emit InsightEvent for Pulse / Intelligence ───────
      // Structured handoff so Pulse's insight-event-consumer can run continuity
      // cadences and Intelligence's insight UI can surface owner-facing signals.
      // Idempotent: deterministic id collapses ElevenLabs retries to one write. On
      // a thrown write, release the dedup claim and rethrow so the retry can re-run
      // it (and only then reach the SMS) rather than the insight being lost forever.
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

          // Do NOT embed callerPhone in this free-text field: `description` is
          // surfaced in owner-facing UI and copied into logs/Sentry, and a phone
          // number in a free-text string evades the key-name PII scrubber
          // (sentry-scrub.ts redacts the structured `callerPhone` field, not an
          // interpolated substring). The number lives in metadata.callerPhone.
          const description = title;

          // Red-flag detail from the graph (structured array, NOT interpolated
          // into `description`) so Pulse/Intelligence can surface the specific
          // trigger on an escalation. Omitted when the graph supplies none.
          const flagsFound = Array.isArray(graphMetadata.flagsFound)
            ? (graphMetadata.flagsFound as unknown[]).filter(
                (f): f is string => typeof f === "string",
              )
            : null;

          const metadata: AvaInsightEventMetadata = {
            conversationId,
            callerPhone,
            callbackType,
            reason,
            callDurationSeconds,
            ...(flagsFound && flagsFound.length > 0 ? { flagsFound } : {}),
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
        // The insight is the structured cross-module signal — losing it silently
        // would dark Pulse/Intelligence. Release the dedup claim and rethrow so
        // ElevenLabs redelivers and the idempotent write is re-run.
        console.error(
          "[ElevenLabs webhook] insight_events write failed:",
          err instanceof Error ? err.message : String(err),
        );
        await releaseDedupClaim();
        throw err;
      }

      // ─── Ava → Intelligence fact stream (call_facts) ─────────────────────
      // Captures atomic call facts for Intelligence to compute voice-channel
      // KPIs (booking conversion, after-hours capture, FCR, transfer rate).
      // Idempotent: deterministic id + Firestore set/merge collapses retries. On a
      // thrown write, release the dedup claim and rethrow so the retry re-runs it
      // (and only then reaches the SMS) rather than dropping the Intelligence fact.
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
          // Prefer the durable PMS id the live booking tool stamped on the
          // call_log doc; fall back to graph metadata. Without this the
          // appointmentExternalId was NEVER populated (no graph node sets
          // bookingId), so Intelligence couldn't join a voice booking to its PMS
          // record for booking-conversion KPIs.
          ...(liveBookingExternalId
            ? { appointmentExternalId: liveBookingExternalId }
            : graphMetadata.bookingId
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
        // The call_fact is the Intelligence KPI signal — losing it silently would
        // skew booking-conversion/transfer metrics. Release the dedup claim and
        // rethrow so ElevenLabs redelivers and the idempotent write is re-run.
        console.error(
          "[ElevenLabs webhook] call_facts write failed:",
          err instanceof Error ? err.message : String(err),
        );
        await releaseDedupClaim();
        throw err;
      }

      // ─── Critical SMS side effects (durable, exactly-once) ──────────────────
      // Run LAST so the non-idempotent sends only fire after the idempotent
      // insight/call_facts writes have committed — a retry that 500'd on one of
      // those never reached here, so it cannot double-send. On a thrown send we
      // RELEASE the claim before bubbling to the outer catch -> 500 -> ElevenLabs
      // retries (which then re-runs the idempotent writes and re-attempts the send
      // exactly once).
      try {
        // Booking acknowledgement SMS to patient.
        if (outcome === "booked" && payload.caller_phone) {
          await sendBookingAcknowledgement({
            clinicId,
            callerPhone: payload.caller_phone,
            conversationId,
          });
        }

        // SMS notification for escalated / callback calls.
        if (outcome === "follow_up_required" || outcome === "escalated") {
          await sendCallbackNotification({
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
      } catch (err) {
        // A send failed. Release the dedup claim so the at-least-once retry is not
        // blocked, then rethrow so the outer catch returns 500 and ElevenLabs
        // re-delivers.
        await releaseDedupClaim();
        throw err;
      }
    }

    // Heartbeat into the unified module-health surface — Ava reports OK
    // for every successfully-handled webhook. Fire-and-forget.
    await writeModuleHealth(db, clinicId, {
      module: "ava",
      status: "ok",
      counts: { processed: 1, succeeded: 1, failed: 0, skipped: 0 },
      diagnostics: { lastEvent: payload.event, conversationId },
    });

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
