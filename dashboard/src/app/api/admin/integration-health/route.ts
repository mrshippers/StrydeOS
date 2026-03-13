import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import {
  verifyApiRequest,
  handleApiError,
  requireRole,
} from "@/lib/auth-guard";
import type { IntegrationHealthEntry } from "@/lib/pipeline/health-logger";

const INTEGRATION_HEALTH_COLLECTION = "integration_health";

export type IntegrationHealthStatus = "healthy" | "degraded" | "down";

export interface ProviderHealthStats {
  totalSyncs: number;
  successfulSyncs: number;
  successRate: number;
  avgDurationMs: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastErrors: string[];
  status: IntegrationHealthStatus;
  stages?: StageHealthStats[];
}

export interface StageHealthStats {
  stage: string;
  totalSyncs: number;
  successfulSyncs: number;
  successRate: number;
  avgDurationMs: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastErrors: string[];
  status: IntegrationHealthStatus;
}

export interface ClinicIntegrationHealth {
  clinicId: string;
  clinicName: string;
  pmsProvider: string;
  integrations: Record<string, ProviderHealthStats>;
}

function computeStatus(
  successRate: number,
  recentEntries: { ok: boolean }[]
): IntegrationHealthStatus {
  const last3 = recentEntries.slice(0, 3);
  const allLast3Failed = last3.length === 3 && last3.every((e) => !e.ok);
  if (successRate < 70 || allLast3Failed) return "down";
  if (successRate < 95) return "degraded";
  return "healthy";
}

function aggregateByProvider(entries: IntegrationHealthEntry[]): Record<string, ProviderHealthStats> {
  const byProvider: Record<string, IntegrationHealthEntry[]> = {};
  for (const e of entries) {
    if (!byProvider[e.provider]) byProvider[e.provider] = [];
    byProvider[e.provider].push(e);
  }

  const result: Record<string, ProviderHealthStats> = {};

  for (const [provider, list] of Object.entries(byProvider)) {
    const sorted = [...list].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    const total = list.length;
    const successful = list.filter((e) => e.ok).length;
    const successRate = total > 0 ? Math.round((successful / total) * 1000) / 10 : 100;
    const totalDuration = list.reduce((s, e) => s + e.durationMs, 0);
    const avgDurationMs = total > 0 ? Math.round(totalDuration / total) : 0;
    const lastSuccess = sorted.find((e) => e.ok)?.timestamp ?? null;
    const lastFailure = sorted.find((e) => !e.ok);
    const lastFailureAt = lastFailure?.timestamp ?? null;
    const lastErrors = lastFailure?.errors ?? [];
    const status = computeStatus(successRate, sorted);

    const byStage: Record<string, IntegrationHealthEntry[]> = {};
    for (const e of list) {
      const key = e.stage;
      if (!byStage[key]) byStage[key] = [];
      byStage[key].push(e);
    }
    const stages: StageHealthStats[] = Object.entries(byStage).map(([stage, stageList]) => {
      const stSorted = [...stageList].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      const stTotal = stageList.length;
      const stOk = stageList.filter((e) => e.ok).length;
      const stRate = stTotal > 0 ? Math.round((stOk / stTotal) * 1000) / 10 : 100;
      const stDuration = stageList.reduce((s, e) => s + e.durationMs, 0);
      const stAvg = stTotal > 0 ? Math.round(stDuration / stTotal) : 0;
      const stLastSuccess = stSorted.find((e) => e.ok)?.timestamp ?? null;
      const stLastFail = stSorted.find((e) => !e.ok);
      return {
        stage,
        totalSyncs: stTotal,
        successfulSyncs: stOk,
        successRate: stRate,
        avgDurationMs: stAvg,
        lastSuccessAt: stLastSuccess,
        lastFailureAt: stLastFail?.timestamp ?? null,
        lastErrors: stLastFail?.errors ?? [],
        status: computeStatus(stRate, stSorted),
      };
    });

    result[provider] = {
      totalSyncs: total,
      successfulSyncs: successful,
      successRate,
      avgDurationMs,
      lastSuccessAt: lastSuccess,
      lastFailureAt,
      lastErrors,
      status,
      stages,
    };
  }

  return result;
}

/**
 * GET /api/admin/integration-health?days=30
 * Superadmin only. Returns aggregated integration health for all clinics.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await verifyApiRequest(request);
    requireRole(user, ["superadmin"]);

    const { searchParams } = new URL(request.url);
    const daysParam = searchParams.get("days");
    const days = Math.min(
      90,
      Math.max(1, parseInt(daysParam ?? "30", 10) || 30)
    );

    const db = getAdminDb();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffIso = cutoff.toISOString();

    const clinicsSnap = await db.collection("clinics").get();
    const clinics: ClinicIntegrationHealth[] = [];

    for (const clinicDoc of clinicsSnap.docs) {
      const clinicId = clinicDoc.id;
      const clinicData = clinicDoc.data();
      const clinicName = (clinicData?.name as string) ?? clinicId;
      const pmsProvider = (clinicData?.pmsType as string) ?? "";

      const healthSnap = await db
        .collection("clinics")
        .doc(clinicId)
        .collection(INTEGRATION_HEALTH_COLLECTION)
        .where("timestamp", ">=", cutoffIso)
        .get();

      const entries: IntegrationHealthEntry[] = healthSnap.docs.map((d) => ({
        ...d.data(),
        timestamp: d.data().timestamp as string,
      })) as IntegrationHealthEntry[];

      const integrations = aggregateByProvider(entries);

      clinics.push({
        clinicId,
        clinicName,
        pmsProvider,
        integrations,
      });
    }

    return NextResponse.json({ clinics });
  } catch (e) {
    return handleApiError(e);
  }
}
