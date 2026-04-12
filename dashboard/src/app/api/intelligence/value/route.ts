import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import {
  verifyApiRequest,
  verifyCronRequest,
  handleApiError,
  requireRole,
} from "@/lib/auth-guard";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { detectValueEvents } from "@/lib/intelligence/detect-value-events";
import { computeValueSummary } from "@/lib/intelligence/compute-value-summary";
import { withRequestLog } from "@/lib/request-logger";

/**
 * POST /api/intelligence/value
 *
 * Runs the value attribution detection engine and computes monthly summary.
 * Called on the same schedule as /api/intelligence/detect (after it).
 *
 * Body: { clinicId?: string }
 */
async function handler(request: NextRequest) {
  // Rate limit: 10 requests per IP per 60 seconds (heavy computation + writes)
  const { limited, remaining } = await checkRateLimitAsync(request, { limit: 10, windowMs: 60_000 });
  if (limited) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "X-RateLimit-Remaining": String(remaining) } }
    );
  }

  try {
    const isCron = request.headers.get("authorization")?.startsWith("Bearer ");
    let userClinicId: string | undefined;

    if (isCron) {
      try {
        verifyCronRequest(request);
      } catch {
        const user = await verifyApiRequest(request);
        requireRole(user, ["owner", "admin", "superadmin"]);
        userClinicId = user.clinicId;
      }
    } else {
      const user = await verifyApiRequest(request);
      requireRole(user, ["owner", "admin", "superadmin"]);
      userClinicId = user.clinicId;
    }

    const db = getAdminDb();
    const body = await request.json().catch(() => ({}));
    const targetClinicId = (body.clinicId as string | undefined) ?? userClinicId;

    // Tenant isolation: non-superadmin users can only process their own clinic
    if (targetClinicId && userClinicId && targetClinicId !== userClinicId) {
      return NextResponse.json({ error: "Forbidden: clinic mismatch" }, { status: 403 });
    }

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const results: Array<{
      clinicId: string;
      detection: Awaited<ReturnType<typeof detectValueEvents>>;
      summary: Awaited<ReturnType<typeof computeValueSummary>> | null;
    }> = [];

    async function processClinic(clinicId: string) {
      const detection = await detectValueEvents(db, clinicId);
      const summary = await computeValueSummary(db, clinicId, year, month);
      results.push({ clinicId, detection, summary });
    }

    if (targetClinicId) {
      await processClinic(targetClinicId);
    } else {
      const clinicsSnap = await db
        .collection("clinics")
        .where("status", "in", ["live", "onboarding"])
        .get();

      for (const clinicDoc of clinicsSnap.docs) {
        try {
          await processClinic(clinicDoc.id);
        } catch (err) {
          results.push({
            clinicId: clinicDoc.id,
            detection: {
              clinicId: clinicDoc.id,
              eventsCreated: 0,
              eventsSkipped: 0,
              errors: [err instanceof Error ? err.message : String(err)],
            },
            summary: null,
          });
        }
      }
    }

    return NextResponse.json({
      ok: true,
      processedAt: new Date().toISOString(),
      results,
    });
  } catch (e) {
    return handleApiError(e);
  }
}

export const POST = withRequestLog(handler);
