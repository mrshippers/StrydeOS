/**
 * Module health writer + reader.
 *
 * Single source of truth for the `ModuleHealth` contract from
 * `@/lib/contracts`. Each of Ava / Intelligence / Pulse calls
 * `writeModuleHealth` at the end of each run; the `/api/health` endpoint
 * aggregates the latest doc per module via `readAllModuleHealth`.
 *
 * Doc location: `/clinics/{clinicId}/_health/{moduleName}` (singleton per
 * module per clinic). Keeps history elsewhere — this is the latest-state
 * surface only.
 */

import type { Firestore } from "firebase-admin/firestore";
import {
  asTraceId,
  type HealthStatus,
  type ModuleHealth,
  type ModuleName,
  type TraceId,
} from "@/lib/contracts";
import { getTrace } from "@/lib/request-logger";

/**
 * Write the ModuleHealth singleton. Fire-and-forget — never throw from
 * here. Health observability MUST NOT block the underlying run.
 */
export async function writeModuleHealth(
  db: Firestore,
  clinicId: string,
  partial: Omit<ModuleHealth, "lastRunId" | "lastRunAt"> & {
    lastRunAt?: string;
    lastRunId?: TraceId;
  }
): Promise<void> {
  try {
    const traceId = partial.lastRunId
      ?? (getTrace()?.traceId as TraceId | undefined)
      ?? asTraceId(`hb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
    const health: ModuleHealth = {
      module: partial.module,
      status: partial.status,
      lastRunAt: partial.lastRunAt ?? new Date().toISOString(),
      lastRunId: traceId,
      counts: partial.counts,
      ...(partial.lastError !== undefined ? { lastError: partial.lastError } : {}),
      ...(partial.diagnostics ? { diagnostics: partial.diagnostics } : {}),
    };
    await db
      .collection("clinics")
      .doc(clinicId)
      .collection("_health")
      .doc(partial.module)
      .set(health, { merge: true });
  } catch {
    // Intentional: health-write failure is observability loss only.
  }
}

/** Compute the worst status from a list of module healths. */
export function worstStatus(statuses: HealthStatus[]): HealthStatus {
  if (statuses.includes("error")) return "error";
  if (statuses.includes("degraded")) return "degraded";
  if (statuses.length > 0 && statuses.every((s) => s === "disabled")) return "disabled";
  return "ok";
}

/**
 * Read the latest ModuleHealth for each module in a clinic. Returns a
 * sparse map — modules that have never written a heartbeat are absent.
 */
export async function readAllModuleHealth(
  db: Firestore,
  clinicId: string
): Promise<Partial<Record<ModuleName, ModuleHealth>>> {
  const snap = await db
    .collection("clinics")
    .doc(clinicId)
    .collection("_health")
    .get();

  const result: Partial<Record<ModuleName, ModuleHealth>> = {};
  for (const doc of snap.docs) {
    const data = doc.data() as ModuleHealth;
    if (data.module) {
      result[data.module] = data;
    }
  }
  return result;
}
