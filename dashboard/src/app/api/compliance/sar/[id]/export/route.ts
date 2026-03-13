/**
 * POST /api/compliance/sar/[id]/export
 *
 * Exports all patient data for a Subject Access Request
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyApiRequest, requireRole, handleApiError } from "@/lib/auth-guard";
import { getAdminDb } from "@/lib/firebase-admin";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyApiRequest(request);
    requireRole(user, ["owner", "admin"]);

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
    const patientId = sarData?.patientId;

    if (!patientId) {
      return NextResponse.json(
        { error: "No patientId specified in SAR" },
        { status: 400 }
      );
    }

    const exportData: Record<string, unknown> = {
      exportedAt: new Date().toISOString(),
      patientId,
      clinicId,
    };

    const patientDoc = await db
      .collection("clinics")
      .doc(clinicId)
      .collection("patients")
      .doc(patientId)
      .get();

    if (patientDoc.exists) {
      exportData.patient = patientDoc.data();
    }

    const appointmentsSnap = await db
      .collection("clinics")
      .doc(clinicId)
      .collection("appointments")
      .where("patientId", "==", patientId)
      .get();

    exportData.appointments = appointmentsSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    const commsSnap = await db
      .collection("clinics")
      .doc(clinicId)
      .collection("comms_log")
      .where("patientId", "==", patientId)
      .get();

    exportData.comms_log = commsSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    const outcomesSnap = await db
      .collection("clinics")
      .doc(clinicId)
      .collection("outcome_scores")
      .where("patientId", "==", patientId)
      .get();

    exportData.outcome_scores = outcomesSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    await db
      .collection("clinics")
      .doc(clinicId)
      .collection("sar_requests")
      .doc(sarId)
      .update({
        status: "completed",
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

    return NextResponse.json({
      success: true,
      data: exportData,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
