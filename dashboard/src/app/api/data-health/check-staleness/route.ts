import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyCronRequest, verifyApiRequest, requireRole } from "@/lib/auth-guard";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { withRequestLog } from "@/lib/request-logger";

/**
 * GET /api/data-health/check-staleness
 *
 * Daily cron: finds CSV-bridge clinics that haven't received data in 7+ days
 * and writes a DATA_STALENESS_ALERT insight event (deduped weekly).
 */

const CSV_BRIDGE_PMS_TYPES = ["tm3", "csv_import"];
const STALENESS_THRESHOLD_DAYS = 7;

async function handler(request: NextRequest) {
  // Rate limit: 10 requests per IP per 60 seconds
  const { limited, remaining } = await checkRateLimitAsync(request, { limit: 10, windowMs: 60_000 });
  if (limited) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "X-RateLimit-Remaining": String(remaining) } }
    );
  }

  const isCron =
    request.method === "GET" ||
    request.headers.get("authorization")?.startsWith("Bearer ");

  if (isCron) {
    try {
      verifyCronRequest(request);
    } catch {
      const user = await verifyApiRequest(request);
      requireRole(user, ["owner", "admin", "superadmin"]);
    }
  } else {
    const user = await verifyApiRequest(request);
    requireRole(user, ["owner", "admin", "superadmin"]);
  }

  const db = getAdminDb();
  const now = new Date().toISOString();
  const thresholdDate = new Date(Date.now() - STALENESS_THRESHOLD_DAYS * 86400000);

  // Find all active clinics using CSV-bridge PMS types
  const clinicsSnap = await db
    .collection("clinics")
    .where("status", "in", ["live", "onboarding"])
    .get();

  const results: Array<{ clinicId: string; alerted: boolean; reason?: string }> = [];

  for (const clinicDoc of clinicsSnap.docs) {
    const data = clinicDoc.data();
    const pmsType = (data.pmsType as string) ?? "";

    if (!CSV_BRIDGE_PMS_TYPES.includes(pmsType)) continue;

    const lastSync = data.pmsLastSyncAt ? new Date(data.pmsLastSyncAt as string) : null;
    if (lastSync && lastSync > thresholdDate) {
      results.push({ clinicId: clinicDoc.id, alerted: false, reason: "sync recent" });
      continue;
    }

    // Check for existing staleness alert in last 7 days (dedup)
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const existingSnap = await db
      .collection(`clinics/${clinicDoc.id}/insight_events`)
      .where("type", "==", "DATA_STALENESS_ALERT")
      .where("createdAt", ">=", sevenDaysAgo)
      .limit(1)
      .get();

    if (!existingSnap.empty) {
      results.push({ clinicId: clinicDoc.id, alerted: false, reason: "already alerted this week" });
      continue;
    }

    // Calculate days since last import
    const daysSinceSync = lastSync
      ? Math.round((Date.now() - lastSync.getTime()) / 86400000)
      : null;

    const pmsLabel = pmsType === "tm3" ? "TM3" : "your PMS";

    try {
      await db.collection(`clinics/${clinicDoc.id}/insight_events`).add({
        type: "DATA_STALENESS_ALERT",
        clinicId: clinicDoc.id,
        severity: "warning",
        title: "No data received this week",
        description: daysSinceSync
          ? `We haven\u2019t received a CSV import from ${pmsLabel} in ${daysSinceSync} days. Your dashboard metrics may be outdated.`
          : `No data has been imported from ${pmsLabel} yet. Upload a CSV or set up auto-import to get started.`,
        suggestedAction: "Upload a new CSV export or configure scheduled email import in Settings.",
        actionTarget: "owner",
        createdAt: now,
        readAt: null,
        dismissedAt: null,
        pulseActionId: null,
        resolvedAt: null,
        resolution: null,
        lastNotifiedAt: now,
      });
      results.push({ clinicId: clinicDoc.id, alerted: true });
    } catch (err) {
      results.push({
        clinicId: clinicDoc.id,
        alerted: false,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    checked: results.length,
    alerted: results.filter((r) => r.alerted).length,
    results,
  });
}

export const GET = withRequestLog(handler);
export const POST = withRequestLog(handler);
