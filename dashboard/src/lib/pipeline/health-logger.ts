import type { Firestore } from "firebase-admin/firestore";
import type { StageResult } from "./types";

export type IntegrationHealthProviderType = "pms" | "hep" | "reviews" | "enrichment";

export interface IntegrationHealthEntry {
  clinicId: string;
  provider: string;
  providerType: IntegrationHealthProviderType;
  stage: string;
  ok: boolean;
  count: number;
  errors: string[];
  durationMs: number;
  timestamp: string;
}

const INTEGRATION_HEALTH_COLLECTION = "integration_health";
const DEFAULT_RETENTION_DAYS = 90;

/**
 * Writes one integration health entry to clinics/{clinicId}/integration_health.
 * Call after each adapter-dependent pipeline stage.
 */
export async function logIntegrationHealth(
  db: Firestore,
  clinicId: string,
  provider: string,
  providerType: IntegrationHealthProviderType,
  stageResult: StageResult
): Promise<void> {
  try {
    const entry: Omit<IntegrationHealthEntry, "clinicId" | "provider" | "providerType" | "timestamp"> = {
      stage: stageResult.stage,
      ok: stageResult.ok,
      count: stageResult.count,
      errors: stageResult.errors ?? [],
      durationMs: stageResult.durationMs,
    };

    await db
      .collection("clinics")
      .doc(clinicId)
      .collection(INTEGRATION_HEALTH_COLLECTION)
      .add({
        clinicId,
        provider,
        providerType,
        ...entry,
        timestamp: new Date().toISOString(),
      });
  } catch (err) {
    // Do not fail the pipeline if health logging fails
    console.error("[integration-health] logIntegrationHealth failed:", err);
  }
}

/**
 * Deletes integration_health docs older than retentionDays.
 * Call at end of pipeline run to avoid unbounded growth.
 */
export async function cleanOldHealthLogs(
  db: Firestore,
  clinicId: string,
  retentionDays: number = DEFAULT_RETENTION_DAYS
): Promise<void> {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);
    const cutoffIso = cutoff.toISOString();

    const snap = await db
      .collection("clinics")
      .doc(clinicId)
      .collection(INTEGRATION_HEALTH_COLLECTION)
      .where("timestamp", "<", cutoffIso)
      .limit(500)
      .get();

    if (snap.empty) return;

    const batch = db.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  } catch (err) {
    console.error("[integration-health] cleanOldHealthLogs failed:", err);
  }
}
