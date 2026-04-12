import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyApiRequest, verifyCronRequest, handleApiError, requireRole, requireClinic } from "@/lib/auth-guard";
import type { VerifiedUser } from "@/lib/auth-guard";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { computeWeeklyMetricsForClinic, computeWeeklyMetricsForAllClinics } from "@/lib/metrics/compute-weekly";
import { withRequestLog } from "@/lib/request-logger";

async function handler(request: NextRequest) {
  // Rate limit: 10 requests per IP per 60 seconds (heavy computation)
  const { limited, remaining } = await checkRateLimitAsync(request, { limit: 10, windowMs: 60_000 });
  if (limited) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "X-RateLimit-Remaining": String(remaining) } }
    );
  }

  try {
    let authenticatedUser: VerifiedUser | null = null;
    let isCronAuth = false;

    const isCron = request.headers.get("authorization")?.startsWith("Bearer ");
    if (isCron) {
      try {
        verifyCronRequest(request);
        isCronAuth = true;
      } catch {
        authenticatedUser = await verifyApiRequest(request);
        requireRole(authenticatedUser, ["owner", "admin", "superadmin"]);
      }
    } else {
      authenticatedUser = await verifyApiRequest(request);
      requireRole(authenticatedUser, ["owner", "admin", "superadmin"]);
    }

    const db = getAdminDb();
    const body = await request.json().catch(() => ({}));
    const clinicId = body.clinicId as string | undefined;
    const weeksBack = Math.min(12, Math.max(1, Number(body.weeksBack) || 6));

    if (clinicId) {
      // Tenant isolation: non-superadmin, non-cron users can only target their own clinic
      if (authenticatedUser && !isCronAuth) {
        requireClinic(authenticatedUser, clinicId);
      }
      const { written } = await computeWeeklyMetricsForClinic(db, clinicId, weeksBack);
      return NextResponse.json({ clinicId, written });
    }

    const results = await computeWeeklyMetricsForAllClinics(db, weeksBack);
    return NextResponse.json({ results });
  } catch (e) {
    return handleApiError(e);
  }
}

export const POST = withRequestLog(handler);
