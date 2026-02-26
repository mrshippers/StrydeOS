import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyApiRequest, verifyCronRequest, handleApiError, requireRole } from "@/lib/auth-guard";
import { createPMSAdapter } from "@/lib/integrations/pms/factory";
import type { Appointment, AppointmentStatus, AppointmentType } from "@/types";
import type { PMSIntegrationConfig } from "@/types/pms";

const COLLECTION_APPOINTMENTS = "appointments";
const COLLECTION_CLINICIANS = "clinicians";
const INTEGRATIONS_PMS = "integrations_config";
const PMS_DOC_ID = "pms";

function getWeekRange(weeksBack: number): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const to = new Date(now);
  const from = new Date(now);
  from.setDate(from.getDate() - weeksBack * 7);
  return {
    dateFrom: from.toISOString().slice(0, 10),
    dateTo: to.toISOString().slice(0, 10),
  };
}

export async function POST(request: NextRequest) {
  try {
    const isCron = request.headers.get("authorization")?.startsWith("Bearer ");
    if (isCron) {
      try {
        verifyCronRequest(request);
      } catch {
        const user = await verifyApiRequest(request);
        requireRole(user, ["owner", "admin", "superadmin"]);
      }
    } else {
      const user = await verifyApiRequest(request);
      requireRole(user, ["owner", "admin", "superadmin"]);
    }

    const db = getAdminDb();
    const clinicsSnap = await db.collection("clinics").get();
    const results: { clinicId: string; ok: boolean; count?: number; error?: string }[] = [];

    for (const clinicDoc of clinicsSnap.docs) {
      const clinicId = clinicDoc.id;
      try {
        const configSnap = await db
          .collection("clinics")
          .doc(clinicId)
          .collection(INTEGRATIONS_PMS)
          .doc(PMS_DOC_ID)
          .get();

        const config = configSnap.data() as PMSIntegrationConfig | undefined;
        if (!config?.apiKey?.trim() || !config?.provider) {
          results.push({ clinicId, ok: true });
          continue;
        }

        const clinicianSnap = await db
          .collection("clinics")
          .doc(clinicId)
          .collection(COLLECTION_CLINICIANS)
          .get();
        const externalToInternalClinician: Record<string, string> = {};
        clinicianSnap.docs.forEach((d) => {
          const data = d.data();
          if (data.pmsExternalId) externalToInternalClinician[data.pmsExternalId] = d.id;
        });

        const adapter = createPMSAdapter(config);
        const { dateFrom, dateTo } = getWeekRange(4);
        const pmsAppointments = await adapter.getAppointments({ dateFrom, dateTo });

        const batch = db.batch();
        const ref = db.collection("clinics").doc(clinicId).collection(COLLECTION_APPOINTMENTS);
        const now = new Date().toISOString();

        for (const pms of pmsAppointments) {
          const clinicianId = externalToInternalClinician[pms.clinicianExternalId] ?? pms.clinicianExternalId;
          const status = pms.status as AppointmentStatus;
          const doc: Omit<Appointment, "id"> = {
            patientId: pms.patientExternalId,
            clinicianId,
            dateTime: pms.dateTime,
            endTime: pms.endTime,
            status,
            appointmentType: (pms.appointmentType as AppointmentType) ?? "follow_up",
            isInitialAssessment: false,
            hepAssigned: false,
            revenueAmountPence: pms.revenueAmountPence ?? 0,
            followUpBooked: false,
            source: "pms_sync",
            pmsExternalId: pms.externalId,
            createdAt: now,
            updatedAt: now,
          };
          const docRef = ref.doc(pms.externalId);
          batch.set(docRef, doc);
        }

        await batch.commit();
        await db
          .collection("clinics")
          .doc(clinicId)
          .collection(INTEGRATIONS_PMS)
          .doc(PMS_DOC_ID)
          .set(
            {
              lastSyncAt: now,
              lastSyncStatus: "success",
              syncErrors: null,
            },
            { merge: true }
          );
        await db.collection("clinics").doc(clinicId).update({
          pmsLastSyncAt: now,
          updatedAt: now,
        });
        results.push({ clinicId, ok: true, count: pmsAppointments.length });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Sync failed";
        results.push({ clinicId, ok: false, error: message });
        const now = new Date().toISOString();
        await db
          .collection("clinics")
          .doc(clinicId)
          .collection(INTEGRATIONS_PMS)
          .doc(PMS_DOC_ID)
          .set(
            { lastSyncAt: now, lastSyncStatus: "error", syncErrors: [message] },
            { merge: true }
          );
        await db.collection("clinics").doc(clinicId).update({
          pmsLastSyncAt: now,
          updatedAt: now,
        });
      }
    }

    return NextResponse.json({ results });
  } catch (e) {
    return handleApiError(e);
  }
}
