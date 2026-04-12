import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyApiRequest, handleApiError, requireRole } from "@/lib/auth-guard";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { syncHeidi } from "@/lib/pipeline/sync-heidi";
import { withRequestLog } from "@/lib/request-logger";

async function handler(request: NextRequest) {
  // Rate limit: 10 requests per IP per 60 seconds
  const { limited, remaining } = await checkRateLimitAsync(request, { limit: 10, windowMs: 60_000 });
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

    const db = getAdminDb();
    const result = await syncHeidi(db, clinicId);

    return NextResponse.json(result);
  } catch (e) {
    return handleApiError(e);
  }
}

export const POST = withRequestLog(handler);
