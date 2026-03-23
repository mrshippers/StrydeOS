/**
 * POST /api/compliance/sar/[id]/delete
 *
 * Marks patient data for deletion (soft delete with 30-day grace period).
 * Only valid for SAR requests of type "deletion".
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyApiRequest, requireRole, handleApiError } from "@/lib/auth-guard";
import { getAdminDb } from "@/lib/firebase-admin";
import { writeAuditLog, extractIpFromRequest } from "@/lib/audit-log";
import { withRequestLog } from "@/lib/request-logger";

const DELETION_GRACE_PERIOD_DAYS = 30;

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

    if (sarData?.type !== "deletion") {
      return NextResponse.json(
        { error: `SAR type is "${sarData?.type}" — only deletion SARs can be processed by this endpoint` },
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
    const gracePeriodEnd = new Date();
    gracePeriodEnd.setDate(gracePeriodEnd.getDate() + DELETION_GRACE_PERIOD_DAYS);

    const batch = db.batch();

    batch.update(
      db.collection("clinics").doc(clinicId).collection("patients").doc(patientId),
      {
        markedForDeletion: true,
        deletionRequestedAt: now,
        deletionScheduledAt: gracePeriodEnd.toISOString(),
        updatedAt: now,
        updatedBy: user.uid,
      }
    );

    batch.update(
      db.collection("clinics").doc(clinicId).collection("sar_requests").doc(sarId),
      {
        status: "completed",
        completedAt: now,
        updatedAt: now,
        updatedBy: user.uid,
      }
    );

    await batch.commit();

    await writeAuditLog(db, clinicId, {
      userId: user.uid,
      userEmail: user.email,
      action: "write",
      resource: "sar_deletion",
      metadata: { sarId, patientId, gracePeriodEnd: gracePeriodEnd.toISOString() },
      ip: extractIpFromRequest(request),
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

export const POST = withRequestLog(handler);
