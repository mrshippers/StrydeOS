/**
 * GET /api/health/modules?clinicId=<id>
 *
 * Per-clinic module health summary. Reads
 * `/clinics/{clinicId}/_health/{moduleName}` for each of
 * ava / intelligence / pulse and returns the aggregated `ModuleHealth`
 * plus the worst overall status.
 *
 * Auth: owner / admin / superadmin of the clinic in question. Underpins
 * `/admin/integration-health` and any external monitoring scraping
 * module status.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { withRequestLog } from "@/lib/request-logger";
import { readAllModuleHealth, worstStatus } from "@/lib/module-health";
import {
  MODULES,
  type HealthStatus,
  type ModuleHealth,
  type ModuleName,
} from "@/lib/contracts";
import {
  verifyApiRequest,
  requireRole,
  requireClinic,
  handleApiError,
} from "@/lib/auth-guard";

interface ClinicHealthResponse {
  ok: boolean;
  clinicId: string;
  status: HealthStatus;
  checkedAt: string;
  modules: Partial<
    Record<ModuleName, ModuleHealth | { status: "disabled"; reason: "no-heartbeat" }>
  >;
}

async function handler(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const clinicId = url.searchParams.get("clinicId");

    if (!clinicId) {
      return NextResponse.json(
        { error: "clinicId query param is required" },
        { status: 400 }
      );
    }

    const user = await verifyApiRequest(request);
    requireRole(user, ["owner", "admin", "superadmin"]);
    if (user.role !== "superadmin") {
      requireClinic(user, clinicId);
    }

    const db = getAdminDb();
    const healths = await readAllModuleHealth(db, clinicId);

    const modulesOut: ClinicHealthResponse["modules"] = {};
    const statuses: HealthStatus[] = [];
    for (const m of MODULES) {
      const h = healths[m];
      if (h) {
        modulesOut[m] = h;
        statuses.push(h.status);
      } else {
        modulesOut[m] = { status: "disabled", reason: "no-heartbeat" };
        // Absent module doesn't push into worst-status — disabled means
        // not yet wired or feature-flagged off, not unhealthy.
      }
    }

    const overall = worstStatus(statuses);
    const body: ClinicHealthResponse = {
      ok: overall === "ok",
      clinicId,
      status: overall,
      checkedAt: new Date().toISOString(),
      modules: modulesOut,
    };

    return NextResponse.json(body, { status: 200 });
  } catch (e) {
    return handleApiError(e);
  }
}

export const GET = withRequestLog(handler);
