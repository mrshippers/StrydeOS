import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyApiRequest, verifyCronRequest, handleApiError, requireRole, requireClinic, type VerifiedUser } from "@/lib/auth-guard";
import { createPMSAdapter } from "@/lib/integrations/pms/factory";
import type { Appointment, AppointmentStatus, AppointmentType } from "@/types";
import type { PMSIntegrationConfig } from "@/types/pms";
import { withRequestLog } from "@/lib/request-logger";

const COLLECTION_APPOINTMENTS = "appointments";
const COLLECTION_CLINICIANS = "clinicians";
const INTEGRATIONS_PMS = "integrations_config";
const PMS_DOC_ID = "pms";
const MAX_BATCH_SIZE = 500;

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

async function handler(request: NextRequest) {
  try {
    let authedUser: VerifiedUser | null = null;
    let isCron = false;

    const authHeader = request.headers.get("authorization")?.startsWith("Bearer ");
    if (authHeader) {
      try {
        verifyCronRequest(request);
        isCron = true;
      } catch {
        authedUser = await verifyApiRequest(request);
        requireRole(authedUser, ["owner", "admin", "superadmin"]);
      }
    } else {
      authedUser = await verifyApiRequest(request);
      requireRole(authedUser, ["owner", "admin", "superadmin"]);
    }

    const db = getAdminDb();

    // Non-cron, non-superadmin callers are restricted to their own clinic
    let clinicDocs: FirebaseFirestore.QueryDocumentSnapshot[];
    if (!isCron && authedUser && authedUser.role !== "superadmin") {
      const singleDoc = await db.collection("clinics").doc(authedUser.clinicId).get();
      if (!singleDoc.exists) {
        return NextResponse.json({ error: "Clinic not found" }, { status: 404 });
      }
      clinicDocs = [singleDoc as FirebaseFirestore.QueryDocumentSnapshot];
    } else {
      const clinicsSnap = await db.collection("clinics").get();
      clinicDocs = clinicsSnap.docs;
    }

    const results: { clinicId: string; ok: boolean; count?: number; error?: string }[] = [];

    for (const clinicDoc of clinicDocs) {
      const clinicId = clinicDoc.id;
      const clinicData = clinicDoc.data();
      const sessionPricePence: number = clinicData?.sessionPricePence ?? 0;
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

        const ref = db.collection("clinics").doc(clinicId).collection(COLLECTION_APPOINTMENTS);
        const now = new Date().toISOString();

        let batch = db.batch();
        let batchCount = 0;

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
            revenueAmountPence: pms.revenueAmountPence ?? sessionPricePence ?? 0,
            followUpBooked: false,
            source: "pms_sync",
            pmsExternalId: pms.externalId,
            createdAt: now,
            updatedAt: now,
          };
          const docRef = ref.doc(pms.externalId);
          batch.set(docRef, doc);
          batchCount++;

          if (batchCount >= MAX_BATCH_SIZE) {
            await batch.commit();
            batch = db.batch();
            batchCount = 0;
          }
        }

        if (batchCount > 0) {
          await batch.commit();
        }
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

export const POST = withRequestLog(handler);
