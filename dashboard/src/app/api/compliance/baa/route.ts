/**
 * POST /api/compliance/baa
 *
 * Records Business Associate Agreement acceptance for US clinics.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyApiRequest, requireRole } from "@/lib/auth-guard";
import { getAdminDb } from "@/lib/firebase-admin";
import { withRequestLog } from "@/lib/request-logger";

async function handler(request: NextRequest) {
  try {
    const user = await verifyApiRequest(request);
    requireRole(user, ["owner", "admin", "superadmin"]);

    const body = await request.json().catch(() => null);
    if (!body || !body.clinicId) {
      return NextResponse.json(
        { error: "clinicId is required" },
        { status: 400 }
      );
    }

    const { clinicId } = body;

    if (user.clinicId !== clinicId && user.role !== "superadmin") {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    const db = getAdminDb();
    const now = new Date().toISOString();

    await db.collection("clinics").doc(clinicId).update({
      "compliance.baaSignedAt": now,
      updatedAt: now,
    });

    return NextResponse.json({ success: true, baaSignedAt: now });
  } catch (err) {
    console.error("[BAA acceptance error]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export const POST = withRequestLog(handler);
