/**
 * GET /api/insurance/intakes?status=pending
 *
 * Staff-only review queue. Returns insurance intake records for the caller's
 * clinic. Policy and authorisation values are redacted to last 4 in the list
 * response (defense in depth — the full value lives server-side for the write).
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyApiRequest, handleApiError, requireRole } from "@/lib/auth-guard";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { withRequestLog } from "@/lib/request-logger";
import { redactPolicyNumber } from "@/lib/insurance/redact";
import type { InsuranceRecord, InsuranceReviewStatus } from "@/lib/insurance/types";

const INTAKES = "insurance_intakes";
const VALID_STATUSES: InsuranceReviewStatus[] = ["pending", "approved", "rejected"];

async function handler(request: NextRequest) {
  const { limited } = await checkRateLimitAsync(request, { limit: 30, windowMs: 60_000 });
  if (limited) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  try {
    const user = await verifyApiRequest(request);
    requireRole(user, ["owner", "admin", "superadmin"]);
    const clinicId = user.clinicId;
    if (!clinicId) return NextResponse.json({ error: "No clinic" }, { status: 400 });

    const statusParam = request.nextUrl.searchParams.get("status");
    const status = (VALID_STATUSES as string[]).includes(statusParam ?? "")
      ? (statusParam as InsuranceReviewStatus)
      : "pending";

    const db = getAdminDb();
    const snap = await db
      .collection("clinics").doc(clinicId)
      .collection(INTAKES)
      .where("reviewStatus", "==", status)
      .get();

    const intakes = snap.docs
      .map((d) => {
        const r = d.data() as InsuranceRecord;
        return {
          ...r,
          id: d.id,
          policyNumber: redactPolicyNumber(r.policyNumber ?? ""),
          authorisationCode: r.authorisationCode ? redactPolicyNumber(r.authorisationCode) : undefined,
        };
      })
      .sort((a, b) => (a.capturedAt < b.capturedAt ? 1 : -1));

    return NextResponse.json({ intakes });
  } catch (e) {
    return handleApiError(e);
  }
}

export const GET = withRequestLog(handler);
