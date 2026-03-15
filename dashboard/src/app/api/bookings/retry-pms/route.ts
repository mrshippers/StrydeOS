/**
 * POST /api/bookings/retry-pms
 *
 * Retries failed PMS write-backs for Ava-created bookings.
 * Called by a cron job (Vercel Cron or n8n schedule) or manually by an admin.
 *
 * Finds all appointments where:
 *   - source = "strydeos_receptionist"
 *   - pmsWriteStatus = "failed"
 *   - status = "scheduled" (not cancelled or past)
 *
 * For each, re-attempts the PMS createAppointment call.
 * On success, updates the Firestore record with the PMS external ID.
 *
 * Auth: CRON_SECRET (same as other cron endpoints).
 */

import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { createPMSAdapter } from "@/lib/integrations/pms/factory";
import { writeAuditLog } from "@/lib/audit-log";
import { verifyCronRequest, handleApiError } from "@/lib/auth-guard";
import type { PMSIntegrationConfig } from "@/types/pms";
import type { AppointmentType } from "@/types";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    verifyCronRequest(request);

    const db = getAdminDb();
    const results: Array<{
      clinicId: string;
      appointmentId: string;
      status: "retried" | "failed" | "skipped";
      pmsExternalId?: string;
      error?: string;
    }> = [];

    // Find all clinics with PMS configured
    const clinicsSnap = await db
      .collection("clinics")
      .where("pmsType", "!=", null)
      .get();

    for (const clinicDoc of clinicsSnap.docs) {
      const clinicId = clinicDoc.id;

      // Find failed Ava bookings
      const failedSnap = await db
        .collection("clinics")
        .doc(clinicId)
        .collection("appointments")
        .where("source", "==", "strydeos_receptionist")
        .where("pmsWriteStatus", "==", "failed")
        .where("status", "==", "scheduled")
        .get();

      if (failedSnap.empty) continue;

      // Load PMS config once per clinic
      const configSnap = await db
        .collection("clinics")
        .doc(clinicId)
        .collection("integrations_config")
        .doc("pms")
        .get();
      const pmsConfig = configSnap.data() as PMSIntegrationConfig | undefined;

      if (!pmsConfig?.apiKey?.trim()) {
        for (const doc of failedSnap.docs) {
          results.push({
            clinicId,
            appointmentId: doc.id,
            status: "skipped",
            error: "PMS not configured",
          });
        }
        continue;
      }

      const adapter = createPMSAdapter(pmsConfig);

      for (const apptDoc of failedSnap.docs) {
        const appt = apptDoc.data();
        const now = new Date().toISOString();

        // Skip appointments in the past
        const apptDate = new Date(appt.dateTime as string);
        if (apptDate.getTime() < Date.now()) {
          results.push({
            clinicId,
            appointmentId: apptDoc.id,
            status: "skipped",
            error: "Appointment is in the past",
          });
          continue;
        }

        try {
          const pmsResult = await adapter.createAppointment({
            patientExternalId: appt.patientId as string,
            clinicianExternalId: appt.clinicianId as string,
            dateTime: appt.dateTime as string,
            endTime: appt.endTime as string,
            appointmentType: (appt.appointmentType as AppointmentType) ?? "initial_assessment",
            notes: appt.notes as string | undefined,
          });

          // Update the Firestore record with the PMS ID
          await apptDoc.ref.set(
            {
              pmsExternalId: pmsResult.externalId,
              pmsWriteStatus: "success",
              pmsWriteError: null,
              pmsRetryAt: now,
              updatedAt: now,
            },
            { merge: true }
          );

          await writeAuditLog(db, clinicId, {
            userId: "system:cron",
            userEmail: "cron@strydeos.com",
            action: "write",
            resource: "pms_write_retry",
            resourceId: apptDoc.id,
            metadata: {
              pmsExternalId: pmsResult.externalId,
              status: "success",
            },
          });

          results.push({
            clinicId,
            appointmentId: apptDoc.id,
            status: "retried",
            pmsExternalId: pmsResult.externalId,
          });
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          Sentry.captureException(err, {
            tags: { context: "ava_booking_retry", clinicId },
            extra: { appointmentId: apptDoc.id },
          });

          // Increment retry count
          const retryCount = ((appt.pmsRetryCount as number) ?? 0) + 1;
          await apptDoc.ref.set(
            {
              pmsWriteError: errorMsg,
              pmsRetryCount: retryCount,
              pmsRetryAt: now,
              updatedAt: now,
            },
            { merge: true }
          );

          results.push({
            clinicId,
            appointmentId: apptDoc.id,
            status: "failed",
            error: errorMsg,
          });
        }
      }
    }

    return NextResponse.json({
      ok: true,
      retried: results.filter((r) => r.status === "retried").length,
      failed: results.filter((r) => r.status === "failed").length,
      skipped: results.filter((r) => r.status === "skipped").length,
      results,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
