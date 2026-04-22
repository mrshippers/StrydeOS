import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyApiRequest, handleApiError, requireRole } from "@/lib/auth-guard";
import { GooglePlacesClient } from "@/lib/integrations/reviews/google/client";
import { withRequestLog } from "@/lib/request-logger";

/**
 * POST /api/reviews/test-connection
 *
 * Tests a Google Places API credential + Place ID pair. Uses the submitted
 * API key if provided, else falls back to the platform-level env var.
 * Returns the place name + user rating count so operators see immediate
 * confirmation they wired up the right clinic profile.
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

    const body = await request.json().catch(() => ({}));
    const placeId = typeof body.placeId === "string" ? body.placeId.trim() : "";
    const rawApiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";

    if (!placeId) {
      return NextResponse.json({ error: "Place ID is required" }, { status: 400 });
    }

    const apiKey = rawApiKey || process.env.GOOGLE_PLACES_API_KEY || "";
    if (!apiKey) {
      return NextResponse.json(
        { error: "No Google Places API key — add one here or ask ops to set GOOGLE_PLACES_API_KEY" },
        { status: 400 }
      );
    }

    const client = new GooglePlacesClient(apiKey);
    const summary = await client.getPlaceSummary(placeId);
    return NextResponse.json({
      ok: true,
      displayName: summary.displayName,
      totalReviews: summary.userRatingCount ?? 0,
      avgRating: summary.rating ?? 0,
    });
  } catch (e) {
    if (e instanceof Error && /Google Places API/.test(e.message)) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    }
    return handleApiError(e);
  }
}

export const POST = withRequestLog(handler);
