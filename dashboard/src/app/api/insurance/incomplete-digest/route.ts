/**
 * GET/POST /api/insurance/incomplete-digest
 *
 * End-of-day cron: emails each opted-in clinic's owner the insurance patients
 * whose details are staged but not yet claim-ready (missing pre-auth, held
 * insurer mismatch, or awaiting review). Auth: Vercel cron (CRON_SECRET) or an
 * authenticated owner/admin running it for their own clinic.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import {
  verifyApiRequest, verifyCronRequest, handleApiError, requireRole, type VerifiedUser,
} from "@/lib/auth-guard";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { withRequestLog } from "@/lib/request-logger";
import { sendIncompleteDigest } from "@/lib/insurance/incomplete-digest";

async function handler(request: NextRequest) {
  const { limited } = await checkRateLimitAsync(request, { limit: 10, windowMs: 60_000 });
  if (limited) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  try {
    let isCron = false;
    let authedUser: VerifiedUser | null = null;
    if (request.headers.get("authorization")?.startsWith("Bearer ")) {
      try { verifyCronRequest(request); isCron = true; }
      catch { authedUser = await verifyApiRequest(request); requireRole(authedUser, ["owner", "admin", "superadmin"]); }
    } else {
      authedUser = await verifyApiRequest(request);
      requireRole(authedUser, ["owner", "admin", "superadmin"]);
    }

    const db = getAdminDb();
    let clinicDocs: FirebaseFirestore.QueryDocumentSnapshot[];
    if (!isCron && authedUser && authedUser.role !== "superadmin") {
      const d = await db.collection("clinics").doc(authedUser.clinicId).get();
      clinicDocs = d.exists ? [d as FirebaseFirestore.QueryDocumentSnapshot] : [];
    } else {
      clinicDocs = (await db.collection("clinics").get()).docs;
    }

    const results = [];
    for (const cd of clinicDocs) {
      try {
        results.push({ clinicId: cd.id, ...(await sendIncompleteDigest(db, cd.id)) });
      } catch (e) {
        results.push({ clinicId: cd.id, sent: false, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return NextResponse.json({ results });
  } catch (e) {
    return handleApiError(e);
  }
}

export const GET = withRequestLog(handler);
export const POST = withRequestLog(handler);
