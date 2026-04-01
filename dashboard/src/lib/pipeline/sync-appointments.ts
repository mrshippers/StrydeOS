import type { Firestore, WriteBatch } from "firebase-admin/firestore";
import type { PMSAdapter, PMSAppointment } from "@/types/pms";
import type { AppointmentType, AppointmentStatus } from "@/types";
import type { StageResult, PipelineConfig } from "./types";
import {
  DEFAULT_APPOINTMENT_TYPE_MAP,
  BACKFILL_WEEKS,
  INCREMENTAL_WEEKS,
} from "./types";

const MAX_BATCH_SIZE = 500;

function getDateRange(weeksBack: number): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - weeksBack * 7);
  return {
    dateFrom: from.toISOString().slice(0, 10),
    dateTo: now.toISOString().slice(0, 10),
  };
}

function classifyAppointmentType(
  pmsType: string | undefined,
  typeMap: Record<string, AppointmentType>,
  isFirstForPatient: boolean
): { appointmentType: AppointmentType; isInitialAssessment: boolean } {
  if (pmsType) {
    const normalized = pmsType.trim();
    // Try exact match first, then case-insensitive
    const mapped =
      typeMap[normalized] ??
      Object.entries(typeMap).find(
        ([k]) => k.toLowerCase() === normalized.toLowerCase()
      )?.[1];

    if (mapped) {
      return {
        appointmentType: mapped,
        isInitialAssessment: mapped === "initial_assessment",
      };
    }
  }

  // Heuristic fallback: first appointment for this patient → IA
  if (isFirstForPatient) {
    return { appointmentType: "initial_assessment", isInitialAssessment: true };
  }

  return { appointmentType: "follow_up", isInitialAssessment: false };
}

/**
 * Stage 2: Sync appointments from the PMS into Firestore.
 *
 * Fetches appointments for the configured lookback window, maps external IDs
 * to internal clinician IDs, classifies IA/FU, and upserts into Firestore.
 * Uses set-with-merge to preserve fields set by later stages (e.g. hepAssigned).
 */
export async function syncAppointments(
  db: Firestore,
  clinicId: string,
  adapter: PMSAdapter,
  clinicianMap: Map<string, string>,
  options: { backfill?: boolean; sessionPricePence?: number }
): Promise<StageResult & { patientExternalIds: Set<string> }> {
  const start = Date.now();
  const errors: string[] = [];
  let count = 0;
  const patientExternalIds = new Set<string>();

  try {
    const pipelineSnap = await db
      .collection("clinics")
      .doc(clinicId)
      .collection("integrations_config")
      .doc("pipeline")
      .get();
    const pipelineConfig = (pipelineSnap.data() as PipelineConfig) ?? {};
    const typeMap: Record<string, AppointmentType> = {
      ...DEFAULT_APPOINTMENT_TYPE_MAP,
      ...(pipelineConfig.appointmentTypeMap ?? {}),
    };

    const weeks = options.backfill ? BACKFILL_WEEKS : INCREMENTAL_WEEKS;

    // For backfill (26 weeks), chunk into 4-week windows to respect PMS rate limits.
    // For incremental syncs, single request is fine.
    const CHUNK_WEEKS = 4;
    let pmsAppointments: Awaited<ReturnType<typeof adapter.getAppointments>> = [];

    if (options.backfill && weeks > CHUNK_WEEKS) {
      const totalChunks = Math.ceil(weeks / CHUNK_WEEKS);
      for (let i = 0; i < totalChunks; i++) {
        const chunkWeeks = Math.min(CHUNK_WEEKS, weeks - i * CHUNK_WEEKS);
        const chunkEnd = new Date();
        chunkEnd.setDate(chunkEnd.getDate() - i * CHUNK_WEEKS * 7);
        const chunkStart = new Date(chunkEnd);
        chunkStart.setDate(chunkStart.getDate() - chunkWeeks * 7);
        const chunk = await adapter.getAppointments({
          dateFrom: chunkStart.toISOString().split("T")[0],
          dateTo: chunkEnd.toISOString().split("T")[0],
        });
        pmsAppointments = pmsAppointments.concat(chunk);
      }
    } else {
      const { dateFrom, dateTo } = getDateRange(weeks);
      pmsAppointments = await adapter.getAppointments({ dateFrom, dateTo });
    }

    // Track per-patient earliest appointment to detect first visits
    const patientFirstSeen = new Map<string, string>();
    const sortedByDate = [...pmsAppointments].sort(
      (a, b) => a.dateTime.localeCompare(b.dateTime)
    );

    // Also check existing appointments to avoid misclassifying repeats.
    // Include both pms_sync and strydeos_receptionist (Ava bookings) sources
    // so that patients booked by Ava are not re-classified as first-timers.
    const existingApptSnap = await db
      .collection("clinics")
      .doc(clinicId)
      .collection("appointments")
      .where("source", "in", ["pms_sync", "strydeos_receptionist"])
      .select("patientId")
      .get();
    const patientsWithHistory = new Set<string>();
    for (const doc of existingApptSnap.docs) {
      const pid = doc.data().patientId;
      if (pid) patientsWithHistory.add(pid);
    }

    for (const appt of sortedByDate) {
      const pid = appt.patientExternalId;
      if (!patientFirstSeen.has(pid) && !patientsWithHistory.has(pid)) {
        patientFirstSeen.set(pid, appt.externalId);
      }
    }

    const apptRef = db
      .collection("clinics")
      .doc(clinicId)
      .collection("appointments");

    const now = new Date().toISOString();
    let batch: WriteBatch = db.batch();
    let batchCount = 0;

    for (const pms of pmsAppointments) {
      const clinicianId =
        clinicianMap.get(pms.clinicianExternalId) ?? pms.clinicianExternalId;
      const status = pms.status as AppointmentStatus;
      const isFirstForPatient =
        patientFirstSeen.get(pms.patientExternalId) === pms.externalId;

      const { appointmentType, isInitialAssessment } = classifyAppointmentType(
        pms.appointmentType,
        typeMap,
        isFirstForPatient
      );

      patientExternalIds.add(pms.patientExternalId);

      // Merge to preserve hepAssigned / hepProgramId set by Stage 4,
      // and bookedBy set by Ava booking route.
      // Note: source is always set to "pms_sync" here — the bookedBy field
      // (set by /api/bookings/create) is the canonical origin indicator and
      // is preserved by merge since we don't include it in docData.
      const docData: Record<string, unknown> = {
        patientId: pms.patientExternalId,
        clinicianId,
        dateTime: pms.dateTime,
        endTime: pms.endTime,
        status,
        appointmentType,
        isInitialAssessment,
        revenueAmountPence: pms.revenueAmountPence ?? options.sessionPricePence ?? 0,
        followUpBooked: false,
        source: "pms_sync" as const,
        pmsExternalId: pms.externalId,
        pmsWriteStatus: "success",
        updatedAt: now,
      };

      const docRef = apptRef.doc(pms.externalId);
      batch.set(docRef, docData, { merge: true });

      // Ensure createdAt is set only on first write
      batch.set(docRef, { createdAt: now }, { merge: true });

      batchCount++;
      count++;

      if (batchCount >= MAX_BATCH_SIZE) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }

    if (batchCount > 0) {
      await batch.commit();
    }

    // Update sync metadata on the clinic doc
    await db.collection("clinics").doc(clinicId).update({
      pmsLastSyncAt: now,
      updatedAt: now,
    });
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  return {
    stage: "sync-appointments",
    ok: errors.length === 0,
    count,
    errors,
    durationMs: Date.now() - start,
    patientExternalIds,
  };
}
