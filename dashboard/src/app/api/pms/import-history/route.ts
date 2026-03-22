import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyApiRequest, handleApiError, requireRole } from "@/lib/auth-guard";
import { withRequestLog } from "@/lib/request-logger";

async function handler(request: NextRequest): Promise<NextResponse> {
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
