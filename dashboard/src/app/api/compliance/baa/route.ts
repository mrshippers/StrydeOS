/**
 * POST /api/compliance/baa
 *
 * Records Business Associate Agreement acceptance for US clinics.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyApiRequest, requireRole } from "@/lib/auth-guard";
import { getAdminDb } from "@/lib/firebase-admin";
import { withRequestLog } from "@/lib/request-logger";

async function handler(request: NextRequest) {
  // Rate limit: 10 requests per IP per 60 seconds
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

    // clinicId is authoritative from the verified token — never trust body.clinicId
    const clinicId = user.clinicId;
    if (!clinicId) {
      return NextResponse.json(
        { error: "No clinic associated with this account" },
        { status: 400 }
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
