/**
 * POST /api/compliance/sar/[id]/export
 *
 * Exports all patient data for a Subject Access Request.
 * Only valid for SAR requests of type "access".
 *
 * Exported collections:
 *   - patients (single doc)
 *   - appointments
 *   - comms_log
 *   - call_log          (matched by callerPhone when no patientId)
 *   - voiceInteractions (matched by patientId OR callerPhone)
 *   - clinical_notes    (Heidi clinical notes)
 *   - outcome_scores
 *   - reviews           (where patientId matches)
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyApiRequest, requireRole, handleApiError } from "@/lib/auth-guard";
import { getAdminDb } from "@/lib/firebase-admin";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { writeAuditLog, extractIpFromRequest } from "@/lib/audit-log";
import { withRequestLog } from "@/lib/request-logger";

const QUERY_LIMIT = 1000;

/** Fields that should never appear in a SAR export (internal IDs, raw webhook payloads). */
const INTERNAL_FIELDS = new Set([
  "pmsExternalId",
  "physitrackPatientId",
  "heidiPatientId",
  "raw",
]);

/** Strip internal-only fields from a Firestore document map. */
function stripInternal(data: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (!INTERNAL_FIELDS.has(key)) {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

/** Map a Firestore snapshot to an array of cleaned records. */
function mapDocs(
  snap: FirebaseFirestore.QuerySnapshot
): Record<string, unknown>[] {
  return snap.docs.map((doc) => stripInternal({ id: doc.id, ...doc.data() }));
}

async function handler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Rate limit: 5 requests per IP per 60 seconds (exports large patient PII datasets)
  const { limited, remaining } = await checkRateLimitAsync(request, { limit: 5, windowMs: 60_000 });
  if (limited) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "X-RateLimit-Remaining": String(remaining) } }
    );
  }

  try {
    const user = await verifyApiRequest(request);
    requireRole(user, ["owner", "admin", "superadmin"]);

    const clinicId = user.clinicId;
    if (!clinicId) {
      return NextResponse.json({ error: "No clinic" }, { status: 400 });
    }

    const { id: sarId } = await params;
    const db = getAdminDb();

    const sarDoc = await db
      .collection("clinics")
      .doc(clinicId)
      .collection("sar_requests")
      .doc(sarId)
      .get();

    if (!sarDoc.exists) {
      return NextResponse.json({ error: "SAR not found" }, { status: 404 });
    }

    const sarData = sarDoc.data();

    if (sarData?.type !== "access") {
      return NextResponse.json(
        { error: `SAR type is "${sarData?.type}" — only access SARs can be exported` },
        { status: 400 }
      );
    }

    const patientId = sarData?.patientId;

    if (!patientId) {
      return NextResponse.json(
        { error: "No patientId specified in SAR" },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const clinicBase = db.collection("clinics").doc(clinicId);

    const exportData: Record<string, unknown> = {
      exportedAt: now,
      patientId,
      clinicId,
    };

    // ── 1. Patient record ─────────────────────────────────────────────────────
    const patientDoc = await clinicBase.collection("patients").doc(patientId).get();
    const patientPhone = patientDoc.exists
      ? (patientDoc.data()?.contact?.phone as string | undefined)
      : undefined;

    if (patientDoc.exists) {
      exportData.patient = stripInternal(patientDoc.data()!);
    }

    // ── 2. Collections queryable by patientId ─────────────────────────────────
    const [
      appointmentsSnap,
      commsSnap,
      outcomesSnap,
      clinicalNotesSnap,
      reviewsSnap,
      voiceByPatientSnap,
    ] = await Promise.all([
      clinicBase
        .collection("appointments")
        .where("patientId", "==", patientId)
        .limit(QUERY_LIMIT)
        .get(),
      clinicBase
        .collection("comms_log")
        .where("patientId", "==", patientId)
        .limit(QUERY_LIMIT)
        .get(),
      clinicBase
        .collection("outcome_scores")
        .where("patientId", "==", patientId)
        .limit(QUERY_LIMIT)
        .get(),
      clinicBase
        .collection("clinical_notes")
        .where("patientId", "==", patientId)
        .limit(QUERY_LIMIT)
        .get(),
      clinicBase
        .collection("reviews")
        .where("patientId", "==", patientId)
        .limit(QUERY_LIMIT)
        .get(),
      clinicBase
        .collection("voiceInteractions")
        .where("patientId", "==", patientId)
        .limit(QUERY_LIMIT)
        .get(),
    ]);

    exportData.appointments = mapDocs(appointmentsSnap);
    exportData.comms_log = mapDocs(commsSnap);
    exportData.outcome_scores = mapDocs(outcomesSnap);
    exportData.clinical_notes = mapDocs(clinicalNotesSnap);
    exportData.reviews = mapDocs(reviewsSnap);

    // ── 3. Phone-matched collections (call_log + voiceInteractions fallback) ──
    // call_log docs often lack a patientId — match on the patient's phone number.
    // voiceInteractions may also have records linked by callerPhone rather than
    // patientId, so we merge those in (deduped by doc id).

    let callLogDocs: Record<string, unknown>[] = [];
    let voiceByPhoneDocs: Record<string, unknown>[] = [];

    if (patientPhone) {
      const [callLogSnap, voiceByPhoneSnap] = await Promise.all([
        clinicBase
          .collection("call_log")
          .where("callerPhone", "==", patientPhone)
          .limit(QUERY_LIMIT)
          .get(),
        clinicBase
          .collection("voiceInteractions")
          .where("callerPhone", "==", patientPhone)
          .limit(QUERY_LIMIT)
          .get(),
      ]);
      callLogDocs = mapDocs(callLogSnap);
      voiceByPhoneDocs = mapDocs(voiceByPhoneSnap);
    }

    exportData.call_log = callLogDocs;

    // Merge voiceInteractions found by patientId and by callerPhone, deduped.
    const voiceById = mapDocs(voiceByPatientSnap);
    const seenVoiceIds = new Set(voiceById.map((d) => d.id));
    const mergedVoice = [
      ...voiceById,
      ...voiceByPhoneDocs.filter((d) => !seenVoiceIds.has(d.id as string)),
    ];
    exportData.voiceInteractions = mergedVoice;

    // ── 4. Mark SAR as completed ──────────────────────────────────────────────
    await clinicBase
      .collection("sar_requests")
      .doc(sarId)
      .update({
        status: "completed",
        completedAt: now,
        updatedAt: now,
        updatedBy: user.uid,
      });

    // ── 5. Audit log ──────────────────────────────────────────────────────────
    await writeAuditLog(db, clinicId, {
      userId: user.uid,
      userEmail: user.email,
      action: "read",
      resource: "sar_export",
      metadata: {
        sarId,
        patientId,
        recordCounts: {
          appointments: (exportData.appointments as unknown[]).length,
          comms_log: (exportData.comms_log as unknown[]).length,
          call_log: (exportData.call_log as unknown[]).length,
          voiceInteractions: (exportData.voiceInteractions as unknown[]).length,
          clinical_notes: (exportData.clinical_notes as unknown[]).length,
          outcome_scores: (exportData.outcome_scores as unknown[]).length,
          reviews: (exportData.reviews as unknown[]).length,
        },
      },
      ip: extractIpFromRequest(request),
    });

    return NextResponse.json({
      success: true,
      data: exportData,
    });
  } catch (e) {
    return handleApiError(e);
  }
}

export const POST = withRequestLog(handler);
