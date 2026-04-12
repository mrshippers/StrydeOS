import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyApiRequest, handleApiError, requireRole } from "@/lib/auth-guard";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { withRequestLog } from "@/lib/request-logger";

async function handler(request: NextRequest): Promise<NextResponse> {
  // Rate limit: 30 requests per IP per 60 seconds (sensitive read — clinic import audit trail)
  const { limited, remaining } = await checkRateLimitAsync(request, { limit: 30, windowMs: 60_000 });
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
    if (!clinicId) return NextResponse.json({ error: "No clinic" }, { status: 400 });

    const limitParam = request.nextUrl.searchParams.get("limit");
    const limit = Math.min(Math.max(parseInt(limitParam ?? "30", 10) || 30, 1), 100);

    const db = getAdminDb();
    const snap = await db
      .collection("clinics")
      .doc(clinicId)
      .collection("csv_import_history")
      .orderBy("importedAt", "desc")
      .limit(limit)
      .get();

    const imports = snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json({ ok: true, imports });
  } catch (e) {
    return handleApiError(e);
  }
}

export const GET = withRequestLog(handler);
