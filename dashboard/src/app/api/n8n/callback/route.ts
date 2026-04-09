import * as crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import type { CommsOutcome, SequenceType, CommsChannel, NpsCategory } from "@/types";
import { withRequestLog } from "@/lib/request-logger";

const N8N_SECRET = process.env.N8N_COMMS_WEBHOOK_SECRET;

/**
 * POST /api/n8n/callback
 *
 * Handles two event types:
 *
 * 1. Standard n8n execution callback (type absent or type != 'inbound_reply'):
 *    Enriches the comms_log doc created by trigger-sequences with execution ID and outcome.
 *
 * 2. Inbound SMS reply (type = 'inbound_reply'):
 *    Matches the sender's phone to the most recently contacted patient,
 *    writes inboundReply + inboundAt to the most recent comms_log entry.
 *    On no match, writes an orphan log entry. Always returns 200.
 */
async function handler(request: NextRequest) {
  try {
    const secret =
      request.headers.get("x-webhook-secret") ??
      request.headers.get("authorization")?.replace("Bearer ", "");

    if (
      !N8N_SECRET ||
      !secret ||
      secret.length !== N8N_SECRET.length ||
      !crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(N8N_SECRET))
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));

    if (body.type === "inbound_reply") {
      return handleInboundReply(body);
    }

    return handleOutboundCallback(body);
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── Outbound callback ────────────────────────────────────────────────────────

async function handleOutboundCallback(body: Record<string, unknown>) {
  const {
    clinicId,
    patientId,
    sequenceType,
    channel,
    logId,
    executionId,
    outcome,
    openedAt,
    clickedAt,
  } = body as {
    clinicId:     string;
    patientId:    string;
    sequenceType: SequenceType;
    channel:      CommsChannel;
    logId:        string;
    executionId:  string;
    outcome:      string;
    openedAt?:    string;
    clickedAt?:   string;
  };

  if (!clinicId || !patientId || !sequenceType) {
    return NextResponse.json(
      { error: "clinicId, patientId and sequenceType are required" },
      { status: 400 }
    );
  }

  const db  = getAdminDb();

  // Validate clinicId exists — prevents writes to arbitrary clinic paths
  const clinicSnap = await db.collection("clinics").doc(clinicId).get();
  if (!clinicSnap.exists) {
    return NextResponse.json({ error: "Invalid clinicId" }, { status: 400 });
  }

  // Validate patientId belongs to this clinic
  if (patientId) {
    const patientSnap = await db
      .collection("clinics").doc(clinicId)
      .collection("patients")
      .where("pmsExternalId", "==", patientId)
      .limit(1)
      .get();
    const directSnap = await db
      .collection("clinics").doc(clinicId)
      .collection("patients").doc(patientId)
      .get();
    if (patientSnap.empty && !directSnap.exists) {
      return NextResponse.json({ error: "Patient not found in this clinic" }, { status: 400 });
    }
  }

  const now = new Date().toISOString();
  const clinicRef    = db.collection("clinics").doc(clinicId);
  const commsLogColl = clinicRef.collection("comms_log");
  const resolvedOutcome = mapOutcome(outcome);

  if (logId) {
    await commsLogColl.doc(logId).set(
      {
        n8nExecutionId: executionId ?? null,
        outcome:        resolvedOutcome,
        ...(openedAt  ? { openedAt }  : {}),
        ...(clickedAt ? { clickedAt } : {}),
        updatedAt: now,
      },
      { merge: true }
    );
  } else {
    await commsLogColl.add({
      patientId,
      sequenceType,
      channel:        channel ?? "email",
      sentAt:         now,
      outcome:        resolvedOutcome,
      n8nExecutionId: executionId ?? null,
      ...(openedAt  ? { openedAt }  : {}),
      ...(clickedAt ? { clickedAt } : {}),
      createdAt:  now,
      createdBy:  "n8n-callback",
    });
  }

  return NextResponse.json({ ok: true });
}

// ─── Inbound reply ────────────────────────────────────────────────────────────

async function handleInboundReply(body: Record<string, unknown>) {
  const { clinicId, fromPhone, replyText, receivedAt } = body as {
    clinicId:   string;
    fromPhone:  string;
    replyText:  string;
    receivedAt: string;
  };

  if (!clinicId || !fromPhone) {
    return NextResponse.json({ ok: true }); // gracefully ignore malformed
  }

  const db  = getAdminDb();
  const now = receivedAt ?? new Date().toISOString();
  const clinicRef = db.collection("clinics").doc(clinicId);

  // Find patient(s) matching this phone number
  const patientsSnap = await clinicRef
    .collection("patients")
    .where("contact.phone", "==", fromPhone)
    .get();

  if (patientsSnap.empty) {
    // No patient match — write orphan entry
    await clinicRef.collection("comms_log").add({
      patientId:    null,
      sequenceType: null,
      channel:      "sms",
      outcome:      "no_action",
      sentAt:       now,
      inboundReply: replyText ?? null,
      inboundAt:    now,
      createdAt:    now,
      createdBy:    "inbound-orphan",
    });
    return NextResponse.json({ ok: true });
  }

  // If multiple patients share the phone, take the one most recently contacted
  let targetPatientId: string;
  if (patientsSnap.docs.length === 1) {
    targetPatientId = patientsSnap.docs[0].id;
  } else {
    const patientIds = patientsSnap.docs.map((d) => d.id);
    const logsSnap = await clinicRef
      .collection("comms_log")
      .where("patientId", "in", patientIds)
      .orderBy("sentAt", "desc")
      .limit(1)
      .get();
    targetPatientId = logsSnap.empty
      ? patientsSnap.docs[0].id
      : (logsSnap.docs[0].data().patientId as string);
  }

  // Find most recent SMS comms_log entry for this patient
  const recentLogSnap = await clinicRef
    .collection("comms_log")
    .where("patientId", "==", targetPatientId)
    .where("channel", "==", "sms")
    .orderBy("sentAt", "desc")
    .limit(1)
    .get();

  if (recentLogSnap.empty) {
    // Patient found but no log — write orphan
    await clinicRef.collection("comms_log").add({
      patientId:    targetPatientId,
      sequenceType: null,
      channel:      "sms",
      outcome:      "no_action",
      sentAt:       now,
      inboundReply: replyText ?? null,
      inboundAt:    now,
      createdAt:    now,
      createdBy:    "inbound-orphan",
    });
    return NextResponse.json({ ok: true });
  }

  const logDoc  = recentLogSnap.docs[0];
  const logData = logDoc.data();

  // Base update: always write the raw reply
  const logUpdate: Record<string, unknown> = {
    inboundReply: replyText ?? null,
    inboundAt:    now,
  };

  // ── NPS parsing for review_prompt sequences ──────────────────────────
  if (logData.sequenceType === "review_prompt" && replyText) {
    const npsScore = parseNpsScore(replyText);

    if (npsScore !== null) {
      const npsCategory = classifyNps(npsScore);

      // Enrich comms_log entry with NPS data
      logUpdate.npsScore    = npsScore;
      logUpdate.npsCategory = npsCategory;
      logUpdate.outcome     = "responded" as CommsOutcome;

      // Resolve treating clinician from the patient record
      let clinicianId: string | null = null;
      try {
        const patientDoc = await clinicRef
          .collection("patients")
          .doc(targetPatientId)
          .get();
        if (patientDoc.exists) {
          clinicianId = (patientDoc.data()?.clinicianId as string) ?? null;
        }
      } catch {
        // Non-fatal — review is still written without clinician attribution
      }

      // Write NPS response to the reviews collection with platform: "nps_sms"
      await clinicRef.collection("reviews").add({
        platform:           "nps_sms",
        rating:             npsScore,
        reviewText:         replyText,
        date:               now,
        patientId:          targetPatientId,
        clinicianId,
        clinicianMentioned: null,
        verified:           true,
        npsCategory,
        source:             "inbound_sms",
        commsLogId:         logDoc.id,
        createdAt:          now,
      });
    }
  }

  await logDoc.ref.set(logUpdate, { merge: true });

  return NextResponse.json({ ok: true });
}

// ─── NPS Parsing ──────────────────────────────────────────────────────────────

const WORD_TO_NUMBER: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4,
  five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

/**
 * Parses a free-text SMS reply into an NPS score (0–10).
 * Handles: "8", "8/10", "8 out of 10", "8.", " 8 ", "eight", "Eight", etc.
 * Returns null if no valid score can be extracted.
 */
function parseNpsScore(text: string): number | null {
  const trimmed = text.trim().toLowerCase();

  // Word form: "eight", "ten", etc.
  const wordMatch = WORD_TO_NUMBER[trimmed];
  if (wordMatch !== undefined) return wordMatch;

  // Numeric patterns: "8", "8/10", "8 out of 10", "8.", "8 /10"
  const numericPattern = /^(\d{1,2})\s*(?:\/\s*10|out\s+of\s+10)?\.?\s*$/;
  const match = trimmed.match(numericPattern);
  if (match) {
    const score = parseInt(match[1], 10);
    if (score >= 0 && score <= 10) return score;
  }

  return null;
}

/**
 * Classifies an NPS score (0–10) into promoter / passive / detractor.
 */
function classifyNps(score: number): NpsCategory {
  if (score >= 9) return "promoter";
  if (score >= 7) return "passive";
  return "detractor";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mapOutcome(raw: string | undefined): CommsOutcome {
  if (!raw) return "no_action";
  const lower = raw.toLowerCase();
  if (lower === "booked" || lower === "rebooked") return "booked";
  if (lower === "unsubscribed" || lower === "optout" || lower === "stop") return "unsubscribed";
  return "no_action";
}

export const POST = withRequestLog(handler);
