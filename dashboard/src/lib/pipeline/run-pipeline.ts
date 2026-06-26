import type { Firestore } from "firebase-admin/firestore";
import type { PMSIntegrationConfig } from "@/types/pms";
import type { HEPIntegrationConfig } from "@/lib/integrations/hep/types";
import { createPMSAdapter, detectPmsProviderMismatch } from "@/lib/integrations/pms/factory";
import { createHEPAdapter } from "@/lib/integrations/hep/factory";
import { syncClinicians, buildClinicianMap, reconcileClinicianSeats } from "./sync-clinicians";
import { syncAppointments } from "./sync-appointments";
import { syncPatients } from "./sync-patients";
import { syncHep } from "./sync-hep";
import { syncHeidi } from "./sync-heidi";
import { computePatientFields } from "./compute-patients";
import { computeWeeklyMetricsForClinic } from "@/lib/metrics/compute-weekly";
import { syncReviews } from "./sync-reviews";
import { triggerCommsSequences } from "@/lib/comms/trigger-sequences";
import { computeAttribution } from "./compute-attribution";
import { computeKPIs } from "@/lib/intelligence/compute-kpis";
import { writeComputeState, appendDataQualityIssues } from "@/lib/intelligence/compute-state";
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
  ONBOARDING_BACKFILL_WEEKS,
} from "./types";
import { logIntegrationHealth, cleanOldHealthLogs } from "./health-logger";
import { isEncrypted, decryptCredential } from "@/lib/crypto/credentials";

export async function runPipeline(
  db: Firestore,
  clinicId: string,
  options: { backfill?: boolean; backfillWeeks?: number } = {}
): Promise<PipelineResult> {
  const startedAt = new Date().toISOString();
  const stages: StageResult[] = [];

  const clinicDoc = await db.collection("clinics").doc(clinicId).get();
  const clinicData = clinicDoc.data();
  const sessionPricePence: number = clinicData?.sessionPricePence ?? 0;

  const configBase = db
    .collection("clinics")
    .doc(clinicId)
    .collection(INTEGRATIONS_CONFIG);

  // Load pipeline config for lastFullRunAt (used by attribution stage)
  const pipelineSnap = await configBase.doc(PIPELINE_DOC_ID).get();
  const pipelineData = pipelineSnap.data() ?? {};
  const lastFullRunAt = pipelineData.lastFullRunAt as string | undefined;
  // Auto-backfill: first sync ever (no backfillCompleted flag) picks up full history,
  // not just the 4-week incremental window, so historical patients are not missed.
  // SOP for self-onboarding clinics: that first sync pulls a DEEP window
  // (ONBOARDING_BACKFILL_WEEKS) so sessionCount/follow-up rate are correct from
  // day one. An explicit backfillWeeks override wins; a manual backfill without
  // one uses the shallower repair default.
  const onboardingAutoBackfill = !(pipelineData.backfillCompleted as boolean | undefined);
  const effectiveBackfill = options.backfill || onboardingAutoBackfill;
  const effectiveBackfillWeeks =
    options.backfillWeeks ??
    (onboardingAutoBackfill ? ONBOARDING_BACKFILL_WEEKS : BACKFILL_WEEKS);

  // ── Load PMS config ──────────────────────────────────────────────────────
  const pmsSnap = await configBase.doc(PMS_DOC_ID).get();
  const pmsConfig = pmsSnap.data() as PMSIntegrationConfig | undefined;

  // Decrypt PMS API key if it was stored encrypted (backward compatible)
  if (pmsConfig?.apiKey && isEncrypted(pmsConfig.apiKey)) {
    pmsConfig.apiKey = decryptCredential(pmsConfig.apiKey, clinicId);
  }

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

  // Guardrail: the configured provider must match the endpoint its baseUrl
  // points at. A drift here (e.g. provider left as "writeupp" after a Cliniko
  // migration updated baseUrl + apiKey) silently sends the new key to the old
  // client and 401s, which reads as "frozen data" rather than a config error.
  // Fail loud with an actionable message and surface it on the PMS config doc.
  const providerMismatch = detectPmsProviderMismatch(pmsConfig);
  if (providerMismatch) {
    const stage: StageResult = {
      stage: "pms-config",
      ok: false,
      count: 0,
      errors: [providerMismatch],
      durationMs: 0,
    };
    stages.push(stage);
    await logIntegrationHealth(db, clinicId, pmsConfig.provider, "pms", stage);
    await configBase.doc(PMS_DOC_ID).set(
      { lastSyncStatus: "error", syncErrors: [providerMismatch], lastSyncAt: new Date().toISOString() },
      { merge: true }
    );
    return { clinicId, ok: false, startedAt, completedAt: new Date().toISOString(), stages };
  }

  const pmsAdapter = createPMSAdapter(pmsConfig);

  // ── Stage 1: Sync Clinicians ─────────────────────────────────────────────
  const s1 = await syncClinicians(db, clinicId, pmsAdapter);
  stages.push(s1);
  await logIntegrationHealth(db, clinicId, pmsConfig.provider, "pms", s1);

  const clinicianMap = await buildClinicianMap(db, clinicId);

  // Reconcile seats: only clinicians with a StrydeOS account (referenced by a
  // users.clinicianId) are active/shown/counted. PMS practitioners from other
  // branches stay in the data (attribution) but are deactivated, so they don't
  // bloat the clinician table or the tier seat count.
  const seatResult = await reconcileClinicianSeats(db, clinicId);
  stages.push({
    stage: "reconcile-seats",
    ok: true,
    count: seatResult.seatIds.length,
    errors: [],
    durationMs: 0,
  });

  // ── Stage 2: Sync Appointments ───────────────────────────────────────────
  const s2 = await syncAppointments(
    db,
    clinicId,
    pmsAdapter,
    clinicianMap,
    { ...options, backfill: effectiveBackfill, backfillWeeks: effectiveBackfillWeeks, sessionPricePence }
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

  // Decrypt HEP API key if it was stored encrypted (backward compatible)
  if (hepConfig?.apiKey && isEncrypted(hepConfig.apiKey)) {
    hepConfig.apiKey = decryptCredential(hepConfig.apiKey, clinicId);
  }

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

  // ── Stage 4b: Enrich with Heidi clinical notes ──────────────────────────
  try {
    const s4b = await syncHeidi(db, clinicId);
    stages.push(s4b);
    if (s4b.count > 0) {
      await logIntegrationHealth(db, clinicId, "heidi", "enrichment", s4b);
    }
  } catch (err) {
    stages.push({
      stage: "sync-heidi",
      ok: false,
      count: 0,
      errors: [err instanceof Error ? err.message : String(err)],
      durationMs: 0,
    });
  }

  // ── Stage 5: Compute Patient Fields ──────────────────────────────────────
  const s5 = await computePatientFields(db, clinicId);
  stages.push(s5);

  // ── Stage 5b: Trigger Comms Sequences via n8n ────────────────────────────
  // Auto-send is gated on an explicit operational switch (commsAutoSend),
  // SEPARATE from the Pulse module entitlement (featureFlags.continuity). A
  // clinic can have Pulse on (board + manual Re-engage buttons) while the
  // pipeline never contacts patients on its own. Default off — opt in only.
  const commsStart = Date.now();
  // Never fire sequences during a backfill: a deep historical pull (esp. the
  // first onboarding sync) surfaces long-dormant patients who would otherwise
  // be evaluated for re-engagement and blasted on day one. Comms only run on
  // normal incremental syncs, and only when the clinic has opted in.
  if (effectiveBackfill) {
    stages.push({
      stage: "trigger-comms",
      ok: true,
      count: 0,
      errors: ["Skipped during backfill — no historical re-engagement blast"],
      durationMs: Date.now() - commsStart,
    });
  } else if (clinicData?.commsAutoSend !== true) {
    stages.push({
      stage: "trigger-comms",
      ok: true,
      count: 0,
      errors: ["Auto-send disabled (commsAutoSend off) — manual sends only"],
      durationMs: Date.now() - commsStart,
    });
  } else {
  try {
    const commsResult = await triggerCommsSequences(db, clinicId);
    stages.push({
      stage: "trigger-comms",
      ok: commsResult.errors.length === 0,
      count: commsResult.fired,
      errors: commsResult.errors,
      durationMs: Date.now() - commsStart,
      // Pulse run-state snapshot for observability — mirrors what was
      // written to /clinics/{clinicId}/pulseState by trigger-sequences.
      pulseState: commsResult.pulseState ?? null,
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

  // ── Stage 6: Sync Google Reviews ─────────────────────────────────────────
  // Runs before compute-metrics so newly synced reviews are included in weekly stats.
  const reviewsSnap = await configBase.doc(REVIEWS_DOC_ID).get();
  const reviewsConfig = reviewsSnap.data() as
    | { apiKey?: string; placeId?: string }
    | undefined;

  // Per-clinic config first, env var fallback for single-clinic (Spires) launch
  const resolvedReviewsApiKey =
    reviewsConfig?.apiKey?.trim() || process.env.GOOGLE_PLACES_API_KEY || "";
  const resolvedReviewsPlaceId =
    reviewsConfig?.placeId?.trim() || process.env.GOOGLE_PLACE_ID || "";

  if (resolvedReviewsApiKey && resolvedReviewsPlaceId) {
    try {
      const s6 = await syncReviews(
        db,
        clinicId,
        resolvedReviewsApiKey,
        resolvedReviewsPlaceId,
        clinicianMap
      );
      stages.push(s6);
      await logIntegrationHealth(db, clinicId, "google_reviews", "reviews", s6);
    } catch (err) {
      stages.push({
        stage: "sync-reviews",
        ok: false,
        count: 0,
        errors: [err instanceof Error ? err.message : String(err)],
        durationMs: 0,
      });
    }
  }

  // ── Stage 7: Compute Weekly Metrics ──────────────────────────────────────
  const metricsStart = Date.now();
  try {
    const weeksBack = effectiveBackfill
      ? effectiveBackfillWeeks
      : INCREMENTAL_WEEKS + 2;
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

  // ── Stage 8: KPI Projection (layer on top of metrics_weekly) ─────────────
  const kpiStart = Date.now();
  let kpiComputed: Awaited<ReturnType<typeof computeKPIs>> | null = null;
  try {
    kpiComputed = await computeKPIs(db, clinicId);
    stages.push({
      stage: "compute-kpis",
      ok: true,
      count: kpiComputed.written,
      errors: [],
      durationMs: Date.now() - kpiStart,
    });
    if (kpiComputed.dataQualityIssues.length > 0) {
      await appendDataQualityIssues(db, clinicId, kpiComputed.dataQualityIssues);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    stages.push({
      stage: "compute-kpis",
      ok: false,
      count: 0,
      errors: [message],
      durationMs: Date.now() - kpiStart,
    });
    // Never throw — capture to computeState so operators see the failure.
    // NOTE: completedAt is intentionally omitted here so a failed KPI compute
    // does NOT advance lastFullRecomputeAt. The freshness gate must not treat
    // a failed pipeline run as a fresh one.
    await writeComputeState(db, clinicId, {
      status: "failed",
      lastError: message,
      durationMs: Date.now() - kpiStart,
      source: "pipeline",
    });
  }

  // ── Update pipeline config ───────────────────────────────────────────────
  const completedAt = new Date().toISOString();
  const allOk = stages.every((s) => s.ok);

  const pipelineUpdate: Record<string, unknown> = {
    lastFullRunAt: completedAt,
    lastFullRunStatus: allOk ? "success" : "error",
  };
  if (effectiveBackfill) {
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

  // Write final computeState record for operator visibility (replaces silent
  // pipeline failures — see INTELLIGENCE_AUDIT.md issue 1).
  try {
    const kpiStage = stages.find((s) => s.stage === "compute-kpis");
    await writeComputeState(db, clinicId, {
      status: allOk ? "ok" : "degraded",
      completedAt,
      lastError: allOk
        ? null
        : stages.flatMap((s) => s.errors).filter(Boolean).join("; ") || null,
      lastComputedKpis: kpiComputed?.lastComputedKpis ?? [],
      durationMs: kpiStage?.durationMs,
      source: "pipeline",
    });
  } catch {
    // computeState is non-critical — don't fail the pipeline if it fails to write.
  }

  // Auto-promote: api_connected → first_value_reached on first successful sync
  if (allOk) {
    try {
      const clinicSnap = await db.collection("clinics").doc(clinicId).get();
      const clinicData = clinicSnap.data();
      const stage = (clinicData?.onboardingV2 as Record<string, unknown> | undefined)?.stage;
      const firstValueAt = (clinicData?.onboardingV2 as Record<string, unknown> | undefined)?.firstValueAt;
      if (stage === "api_connected" && !firstValueAt) {
        await db.collection("clinics").doc(clinicId).update({
          "onboardingV2.stage": "first_value_reached",
          "onboardingV2.firstValueAt": completedAt,
          "onboardingV2.lastEventAt": completedAt,
        });
      }
    } catch {
      // Non-critical — don't fail the pipeline for an onboarding stage update
    }
  }

  return {
    clinicId,
    ok: allOk,
    startedAt,
    completedAt,
    stages,
  };
}
