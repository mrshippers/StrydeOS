import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import {
  verifyApiRequest,
  verifyCronRequest,
  handleApiError,
  requireRole,
  requireClinic,
} from "@/lib/auth-guard";
import { runPipeline } from "@/lib/pipeline/run-pipeline";
import { writeAuditLog, extractIpFromRequest } from "@/lib/audit-log";
import { withRequestLog } from "@/lib/request-logger";

/**
 * POST /api/pipeline/run
 *
 * Main pipeline entry point. Runs the full data pipeline for all clinics
 * (or a specific clinicId). Accepts cron auth or user auth (owner/admin/superadmin).
 *
 * Body (optional): { clinicId?: string }
 */

async function executePipeline(request: NextRequest, isCronGet = false) {
  let userId = "cron";
  let userEmail = "cron@system";
  let userClinicId: string | undefined;
  let isSuperadmin = false;

  const isCron = isCronGet || request.headers.get("authorization")?.startsWith("Bearer ");
  if (isCron) {
    try {
      verifyCronRequest(request);
    } catch {
      const user = await verifyApiRequest(request);
      requireRole(user, ["owner", "admin", "superadmin"]);
      userId = user.uid;
      userEmail = user.email;
      userClinicId = user.clinicId;
      isSuperadmin = user.role === "superadmin";
    }
  } else {
    const user = await verifyApiRequest(request);
    requireRole(user, ["owner", "admin", "superadmin"]);
    userId = user.uid;
    userEmail = user.email;
    userClinicId = user.clinicId;
    isSuperadmin = user.role === "superadmin";
  }

  const db = getAdminDb();
  const body = isCronGet ? {} : await request.json().catch(() => ({}));
  const targetClinicId = body.clinicId as string | undefined;
  // backfill=true recomputes all historical weeks using the correct sessionPricePence
  // fallback — use this once after the revenue fix to repair old metrics_weekly docs.
  const backfill = body.backfill === true;
  const ip = extractIpFromRequest(request);

  if (targetClinicId) {
    if (!isSuperadmin && userId !== "cron") {
      requireClinic({ uid: userId, email: userEmail, clinicId: userClinicId!, role: isSuperadmin ? "superadmin" : "owner" } as import("@/lib/auth-guard").VerifiedUser, targetClinicId);
    }

    const result = await runPipeline(db, targetClinicId, { backfill });

    await writeAuditLog(db, targetClinicId, {
      userId,
      userEmail,
      action: "write",
      resource: "pipeline",
      metadata: { trigger: isCron ? "cron" : "manual", backfill, result },
      ip,
    });

    return NextResponse.json(result);
  }

  if (!isSuperadmin && userId !== "cron") {
    if (!userClinicId) {
      return NextResponse.json({ error: "No clinic associated" }, { status: 400 });
    }
    const result = await runPipeline(db, userClinicId, { backfill });
    return NextResponse.json(result);
  }

  const clinicsSnap = await db.collection("clinics").get();
  const clinicIds = clinicsSnap.docs.map((d) => d.id);

  // Process clinics in batches of 5 to avoid unbounded concurrent execution
  const PIPELINE_BATCH_SIZE = 5;
  const settled: PromiseSettledResult<Awaited<ReturnType<typeof runPipeline>>>[] = [];
  for (let i = 0; i < clinicIds.length; i += PIPELINE_BATCH_SIZE) {
    const chunk = clinicIds.slice(i, i + PIPELINE_BATCH_SIZE);
    const chunkResults = await Promise.allSettled(
      chunk.map((id) => runPipeline(db, id))
    );
    settled.push(...chunkResults);
  }

  const results = settled.map((s, i) => {
    if (s.status === "fulfilled") return s.value;
    const clinicId = clinicIds[i];
    Sentry.captureException(s.reason, { tags: { clinicId, source: "pipeline_cron" } });
    return { clinicId, ok: false, error: s.reason?.message ?? "Pipeline failed" };
  });

  return NextResponse.json({ results });
}

async function getHandler(request: NextRequest) {
  try {
    verifyCronRequest(request);
    return executePipeline(request, true);
  } catch (e) {
    return handleApiError(e);
  }
}

async function postHandler(request: NextRequest) {
  try {
    return executePipeline(request);
  } catch (e) {
    return handleApiError(e);
  }
}

export const GET = withRequestLog(getHandler);
export const POST = withRequestLog(postHandler);
