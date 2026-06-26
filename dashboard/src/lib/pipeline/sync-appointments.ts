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

    // Substring classification (priority: discharge > follow_up > review >
    // initial). Mirrors cliniko/classify-appointment-type.ts so compound or
    // prefixed names ("Bupa Follow-up Review", "Discharge Appointment", "MSK
    // Initial Assessment") classify correctly instead of falling through to the
    // unstable first-visit heuristic. Without this, WriteUpp clinics — whose
    // type names rarely match an exact map key — never flag discharges and
    // mis-bucket reviews. Follow-up/review/discharge are checked before initial
    // so "...Follow-up Review" can't mis-classify as an initial assessment.
    const lower = normalized.toLowerCase();
    if (/discharge|final session/.test(lower)) {
      return { appointmentType: "discharge", isInitialAssessment: false };
    }
    if (/follow[\s-]?up|subsequent|treatment/.test(lower)) {
      return { appointmentType: "follow_up", isInitialAssessment: false };
    }
    if (/review|progress/.test(lower)) {
      return { appointmentType: "review", isInitialAssessment: false };
    }
    if (/initial|assessment|new patient|consultation/.test(lower)) {
      return { appointmentType: "initial_assessment", isInitialAssessment: true };
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
  options: { backfill?: boolean; backfillWeeks?: number; sessionPricePence?: number }
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

    // One-time deep backfills can override the default 26-week window (e.g. to
    // pull a clinic's full multi-year Cliniko history after a PMS migration, so
    // each patient's sessionCount reflects their true visit count rather than a
    // truncated 6-month slice). Incremental syncs always stay at INCREMENTAL_WEEKS.
    const weeks = options.backfill
      ? (options.backfillWeeks ?? BACKFILL_WEEKS)
      : INCREMENTAL_WEEKS;

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
        const chunkFrom = chunkStart.toISOString().split("T")[0];
        const chunkTo = chunkEnd.toISOString().split("T")[0];
        // Per-chunk checkpoint: a transient failure on one window must not
        // discard the chunks already fetched. Record the error and keep going —
        // the surviving chunks still get written, and a non-empty errors[]
        // marks the stage ok:false so the partial run is visible.
        try {
          const chunk = await adapter.getAppointments({
            dateFrom: chunkFrom,
            dateTo: chunkTo,
          });
          pmsAppointments = pmsAppointments.concat(chunk);
        } catch (chunkErr) {
          errors.push(
            `backfill chunk ${i + 1}/${totalChunks} (${chunkFrom}..${chunkTo}) failed: ` +
              (chunkErr instanceof Error ? chunkErr.message : String(chunkErr))
          );
        }
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

      // Classify off the resolved type NAME, not the PMS type ID. The adapters
      // populate appointmentTypeName (e.g. "Initial Assessment") but the prior
      // code passed pms.appointmentType (a Cliniko ID like "12345"), which never
      // matched the name-keyed typeMap and so ALWAYS fell through to the unstable
      // first-visit heuristic. (Follow-up-rate no longer depends on this — that is
      // computed from stable ordinality in compute-weekly — but the stored
      // appointmentType is used elsewhere, so classify it correctly.)
      const { appointmentType, isInitialAssessment } = classifyAppointmentType(
        pms.appointmentTypeName ?? pms.appointmentType,
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
        appointmentTypeName: pms.appointmentTypeName ?? null,
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
