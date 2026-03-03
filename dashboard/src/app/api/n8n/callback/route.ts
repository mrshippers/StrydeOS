import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import type { CommsOutcome, SequenceType, CommsChannel } from "@/types";

const N8N_SECRET = process.env.N8N_COMMS_WEBHOOK_SECRET;

/**
 * POST /api/n8n/callback
 *
 * Called by n8n after each workflow execution to log the send
 * and update outcome data. Enriches the comms_log doc created
 * by trigger-sequences.ts with the n8n execution ID.
 *
 * Body shape (n8n sends this via HTTP Request node):
 * {
 *   clinicId:        string       — required
 *   patientId:       string       — required
 *   sequenceType:    SequenceType — required
 *   channel:         "email" | "sms"
 *   logId:           string       — Firestore doc ID created by trigger-sequences
 *   executionId:     string       — n8n execution ID
 *   outcome:         "sent" | "failed" | "bounced"
 *   openedAt?:       ISO string
 *   clickedAt?:      ISO string
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Validate shared secret
    const secret =
      request.headers.get("x-webhook-secret") ??
      request.headers.get("authorization")?.replace("Bearer ", "");

    if (N8N_SECRET && secret !== N8N_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));

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
    const now = new Date().toISOString();

    const clinicRef  = db.collection("clinics").doc(clinicId);
    const commsLogColl = clinicRef.collection("comms_log");

    const resolvedOutcome = mapOutcome(outcome);

    if (logId) {
      // Update the pre-created doc from trigger-sequences
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
      // Fallback: n8n called back without a logId — create a new entry
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
  } catch (e) {
    console.error("[n8n callback error]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

function mapOutcome(raw: string | undefined): CommsOutcome {
  if (!raw) return "no_action";
  const lower = raw.toLowerCase();
  if (lower === "booked" || lower === "rebooked") return "booked";
  if (lower === "unsubscribed" || lower === "optout" || lower === "stop") return "unsubscribed";
  return "no_action";
}
