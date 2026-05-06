import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyApiRequest, handleApiError, requireRole } from "@/lib/auth-guard";
import { writeAuditLog, extractIpFromRequest } from "@/lib/audit-log";
import { withRequestLog } from "@/lib/request-logger";
import { encryptCredential } from "@/lib/crypto/credentials";
import { INTEGRATIONS_CONFIG, REVIEWS_DOC_ID } from "@/lib/pipeline/types";

/**
 * POST /api/reviews/save-config
 *
 * Persists the clinic's Google Places config (placeId required, apiKey optional)
 * used by the pipeline sync-reviews stage. API key falls back to the
 * platform-level GOOGLE_PLACES_API_KEY env var when not supplied per-clinic.
 */
async function handler(request: NextRequest) {
  const { limited, remaining } = checkRateLimit(request, { limit: 10, windowMs: 60_000 });
  if (limited) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "X-RateLimit-Remaining": String(remaining) } }
    );
  }

  try {
    const user = await verifyApiRequest(request);
    requireRole(user, ["owner", "admin", "superadmin"]);
    const clinicId = user.clinicId;
    if (!clinicId) {
      return NextResponse.json({ error: "No clinic" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const placeId = typeof body.placeId === "string" ? body.placeId.trim() : "";
    const rawApiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";

    if (!placeId) {
      return NextResponse.json({ error: "Google Place ID is required" }, { status: 400 });
    }
    // Sanity-check the shape — Google Place IDs are opaque, but they are always
    // printable ASCII without whitespace. Catch obvious paste errors early.
    if (!/^[A-Za-z0-9_-]{10,}$/.test(placeId)) {
      return NextResponse.json({ error: "Place ID looks malformed — paste the raw ID from Google's Place ID Finder" }, { status: 400 });
    }

    const db = getAdminDb();

    const update: Record<string, unknown> = {
      placeId,
      connectedAt: new Date().toISOString(),
    };
    if (rawApiKey) {
      update.apiKey = encryptCredential(rawApiKey, clinicId);
    }

    await db
      .collection("clinics")
      .doc(clinicId)
      .collection(INTEGRATIONS_CONFIG)
      .doc(REVIEWS_DOC_ID)
      .set(update, { merge: true });

    await db.collection("clinics").doc(clinicId).update({
      googleReviewUrl: `https://search.google.com/local/writereview?placeid=${placeId}`,
      updatedAt: new Date().toISOString(),
    });

    await writeAuditLog(db, clinicId, {
      userId: user.uid,
      userEmail: user.email,
      action: "config_change",
      resource: "integrations_config",
      resourceId: REVIEWS_DOC_ID,
      metadata: { action: "connect", hasCustomApiKey: Boolean(rawApiKey) },
      ip: extractIpFromRequest(request),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}

export const POST = withRequestLog(handler);
