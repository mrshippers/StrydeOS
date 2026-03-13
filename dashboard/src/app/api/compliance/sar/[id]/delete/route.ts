/**
 * POST /api/compliance/sar/[id]/delete
 *
 * Marks patient data for deletion (soft delete with 30-day grace period)
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

    const now = new Date().toISOString();
    const gracePeriodEnd = new Date();
    gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 30);

    await db
      .collection("clinics")
      .doc(clinicId)
      .collection("patients")
      .doc(patientId)
      .update({
        markedForDeletion: true,
        deletionRequestedAt: now,
        deletionScheduledAt: gracePeriodEnd.toISOString(),
        updatedAt: now,
      });

    await db
      .collection("clinics")
      .doc(clinicId)
      .collection("sar_requests")
      .doc(sarId)
      .update({
        status: "completed",
        completedAt: now,
        updatedAt: now,
      });

    return NextResponse.json({
      success: true,
      message: `Patient ${patientId} marked for deletion. Grace period ends ${gracePeriodEnd.toISOString()}`,
      gracePeriodEnd: gracePeriodEnd.toISOString(),
    });
  } catch (e) {
    return handleApiError(e);
  }
}
