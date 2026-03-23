/**
 * POST /api/compliance/sar/[id]/export
 *
 * Exports all patient data for a Subject Access Request.
 * Only valid for SAR requests of type "access".
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyApiRequest, requireRole, handleApiError } from "@/lib/auth-guard";
import { getAdminDb } from "@/lib/firebase-admin";
import { writeAuditLog, extractIpFromRequest } from "@/lib/audit-log";
import { withRequestLog } from "@/lib/request-logger";

const QUERY_LIMIT = 1000;

async function handler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const patientDoc = await clinicBase.collection("patients").doc(patientId).get();

    if (patientDoc.exists) {
      exportData.patient = patientDoc.data();
    }

    const [appointmentsSnap, commsSnap, outcomesSnap] = await Promise.all([
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
    ]);

    exportData.appointments = appointmentsSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    exportData.comms_log = commsSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    exportData.outcome_scores = outcomesSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    await clinicBase
      .collection("sar_requests")
      .doc(sarId)
      .update({
        status: "completed",
        completedAt: now,
        updatedAt: now,
        updatedBy: user.uid,
      });

    await writeAuditLog(db, clinicId, {
      userId: user.uid,
      userEmail: user.email,
      action: "read",
      resource: "sar_export",
      metadata: {
        sarId,
        patientId,
        recordCounts: {
          appointments: appointmentsSnap.size,
          comms_log: commsSnap.size,
          outcome_scores: outcomesSnap.size,
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
