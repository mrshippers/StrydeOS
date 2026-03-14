import type { Firestore } from "firebase-admin/firestore";
import type { PMSIntegrationConfig } from "@/types/pms";
import type { HEPIntegrationConfig } from "@/lib/integrations/hep/types";
import { createPMSAdapter } from "@/lib/integrations/pms/factory";
import { createHEPAdapter } from "@/lib/integrations/hep/factory";
import { syncClinicians, buildClinicianMap } from "./sync-clinicians";
import { syncAppointments } from "./sync-appointments";
import { syncPatients } from "./sync-patients";
import { syncHep } from "./sync-hep";
import { computePatientFields } from "./compute-patients";
import { computeWeeklyMetricsForClinic } from "@/lib/metrics/compute-weekly";
import { syncReviews } from "./sync-reviews";
import { triggerCommsSequences } from "@/lib/comms/trigger-sequences";
import { computeAttribution } from "./compute-attribution";
import type {
  PipelineResult,
  StageResult,
} from "./types";
import {
  INTEGRATIONS_CONFIG,
  PMS_DOC_ID,
  HEP_DOC_ID,
  PIPELINE_DOC_ID,
  REVIEWS_DOC_ID,
  BACKFILL_WEEKS,
  INCREMENTAL_WEEKS,
} from "./types";
import { logIntegrationHealth, cleanOldHealthLogs } from "./health-logger";

export async function runPipeline(
  db: Firestore,
  clinicId: string,
  options: { backfill?: boolean } = {}
): Promise<PipelineResult> {
  const startedAt = new Date().toISOString();
  const stages: StageResult[] = [];

  const configBase = db
    .collection("clinics")
    .doc(clinicId)
    .collection(INTEGRATIONS_CONFIG);

  // Load pipeline config for lastFullRunAt (used by attribution stage)
  const pipelineSnap = await configBase.doc(PIPELINE_DOC_ID).get();
  const lastFullRunAt = pipelineSnap.data()?.lastFullRunAt as string | undefined;

  // ── Load PMS config ──────────────────────────────────────────────────────
  const pmsSnap = await configBase.doc(PMS_DOC_ID).get();
  const pmsConfig = pmsSnap.data() as PMSIntegrationConfig | undefined;

  if (!pmsConfig?.apiKey?.trim() || !pmsConfig?.provider) {
    return {
      clinicId,
      ok: true,
      startedAt,
      completedAt: new Date().toISOString(),
      stages: [
        {
          stage: "skip",
          ok: true,
          count: 0,
          errors: ["No PMS config — skipping pipeline"],
          durationMs: 0,
        },
      ],
    };
  }

  const pmsAdapter = createPMSAdapter(pmsConfig);

  // ── Stage 1: Sync Clinicians ─────────────────────────────────────────────
  const s1 = await syncClinicians(db, clinicId, pmsAdapter);
  stages.push(s1);
  await logIntegrationHealth(db, clinicId, pmsConfig.provider, "pms", s1);

  const clinicianMap = await buildClinicianMap(db, clinicId);

  // ── Stage 2: Sync Appointments ───────────────────────────────────────────
  const s2 = await syncAppointments(
    db,
    clinicId,
    pmsAdapter,
    clinicianMap,
    options
  );
  stages.push(s2);
  await logIntegrationHealth(db, clinicId, pmsConfig.provider, "pms", s2);

  // ── Stage 3: Resolve Patients ────────────────────────────────────────────
  const s3 = await syncPatients(
    db,
    clinicId,
    pmsAdapter,
    s2.patientExternalIds,
    clinicianMap
  );
  stages.push(s3);
  await logIntegrationHealth(db, clinicId, pmsConfig.provider, "pms", s3);

  // ── Stage 4: Enrich HEP Data ────────────────────────────────────────────
  const hepSnap = await configBase.doc(HEP_DOC_ID).get();
  const hepConfig = hepSnap.data() as HEPIntegrationConfig | undefined;

  if (hepConfig?.apiKey?.trim() && hepConfig?.provider) {
    const hepAdapter = createHEPAdapter(hepConfig);
    const s4 = await syncHep(db, clinicId, hepAdapter);
    stages.push(s4);
    await logIntegrationHealth(db, clinicId, hepConfig.provider, "hep", s4);
  } else {
    stages.push({
      stage: "sync-hep",
      ok: true,
      count: 0,
      errors: ["No HEP config — skipping"],
      durationMs: 0,
    });
  }

  // ── Stage 5: Compute Patient Fields ──────────────────────────────────────
  const s5 = await computePatientFields(db, clinicId);
  stages.push(s5);

  // ── Stage 5b: Trigger Comms Sequences via n8n ────────────────────────────
  const commsStart = Date.now();
  try {
    const commsResult = await triggerCommsSequences(db, clinicId);
    stages.push({
      stage: "trigger-comms",
      ok: commsResult.errors.length === 0,
      count: commsResult.fired,
      errors: commsResult.errors,
      durationMs: Date.now() - commsStart,
    });
  } catch (err) {
    stages.push({
      stage: "trigger-comms",
      ok: false,
      count: 0,
      errors: [err instanceof Error ? err.message : String(err)],
      durationMs: Date.now() - commsStart,
    });
  }

  // ── Stage 5c: Revenue Attribution ────────────────────────────────────────
  const attrStart = Date.now();
  try {
    const attrResult = await computeAttribution(db, clinicId, lastFullRunAt);
    stages.push(attrResult);
  } catch (err) {
    stages.push({
      stage: "compute-attribution",
      ok: false,
      count: 0,
      errors: [err instanceof Error ? err.message : String(err)],
      durationMs: Date.now() - attrStart,
    });
  }

  // ── Stage 6: Compute Weekly Metrics ──────────────────────────────────────
  const metricsStart = Date.now();
  try {
    const weeksBack = options.backfill ? BACKFILL_WEEKS : INCREMENTAL_WEEKS + 2;
    const { written } = await computeWeeklyMetricsForClinic(
      db,
      clinicId,
      weeksBack
    );
    stages.push({
      stage: "compute-metrics",
      ok: true,
      count: written,
      errors: [],
      durationMs: Date.now() - metricsStart,
    });
  } catch (err) {
    stages.push({
      stage: "compute-metrics",
      ok: false,
      count: 0,
      errors: [err instanceof Error ? err.message : String(err)],
      durationMs: Date.now() - metricsStart,
    });
  }

  // ── Stage 7: Sync Google Reviews ─────────────────────────────────────────
  const reviewsSnap = await configBase.doc(REVIEWS_DOC_ID).get();
  const reviewsConfig = reviewsSnap.data() as
    | { apiKey?: string; placeId?: string }
    | undefined;

  if (reviewsConfig?.apiKey?.trim() && reviewsConfig?.placeId?.trim()) {
    const s7 = await syncReviews(
      db,
      clinicId,
      reviewsConfig.apiKey!,
      reviewsConfig.placeId!,
      clinicianMap
    );
    stages.push(s7);
    await logIntegrationHealth(db, clinicId, "google_reviews", "reviews", s7);
  } else {
    stages.push({
      stage: "sync-reviews",
      ok: true,
      count: 0,
      errors: ["No Google Reviews config — skipping"],
      durationMs: 0,
    });
  }

  // ── Update pipeline config ───────────────────────────────────────────────
  const completedAt = new Date().toISOString();
  const allOk = stages.every((s) => s.ok);

  const pipelineUpdate: Record<string, unknown> = {
    lastFullRunAt: completedAt,
    lastFullRunStatus: allOk ? "success" : "error",
  };
  if (options.backfill) {
    pipelineUpdate.backfillCompleted = true;
    pipelineUpdate.backfillCompletedAt = completedAt;
  }
  await configBase.doc(PIPELINE_DOC_ID).set(pipelineUpdate, { merge: true });

  // Update PMS sync metadata
  await configBase.doc(PMS_DOC_ID).set(
    {
      lastSyncAt: completedAt,
      lastSyncStatus: allOk ? "success" : "error",
      syncErrors: allOk ? null : stages.flatMap((s) => s.errors).filter(Boolean),
    },
    { merge: true }
  );

  await cleanOldHealthLogs(db, clinicId);

  return {
    clinicId,
    ok: allOk,
    startedAt,
    completedAt,
    stages,
  };
}
