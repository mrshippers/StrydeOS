import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyApiRequest, requireRole, handleApiError } from "@/lib/auth-guard";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { withRequestLog } from "@/lib/request-logger";

/**
 * POST /api/clinic/check-go-live
 *
 * Called by FirstLoginTour after a user completes their first-login experience.
 * Checks whether ALL owner/admin users in the clinic have completed first login.
 * If yes, promotes the clinic status from "onboarding" → "live".
 *
 * Auth: Bearer {Firebase ID token}
 */
async function handler(req: NextRequest) {
  // Rate limit: 10 requests per IP per 60 seconds
  const { limited, remaining } = await checkRateLimitAsync(req, { limit: 10, windowMs: 60_000 });
  if (limited) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "X-RateLimit-Remaining": String(remaining) } }
    );
  }

  try {
    const user = await verifyApiRequest(req);
    requireRole(user, ["owner", "admin", "superadmin"]);

    const clinicId = user.clinicId;
    if (!clinicId) {
      return NextResponse.json({ error: "User has no clinicId" }, { status: 400 });
    }

    const db = getAdminDb();

    // Check current clinic status
    const clinicSnap = await db.collection("clinics").doc(clinicId).get();
    if (!clinicSnap.exists) {
      return NextResponse.json({ error: "Clinic not found" }, { status: 404 });
    }

    const clinicData = clinicSnap.data() as Record<string, unknown>;

    if (clinicData.status === "live") {
      return NextResponse.json({ promoted: false, alreadyLive: true });
    }

    // Determine which module this clinic signed up for
    const trialModule = (clinicData["onboardingV2.trialModule"] ?? clinicData.trialModule ?? "intelligence") as string;
    const missing: string[] = [];

    // sessionPricePence required for all modules (Intelligence narratives + KPI revenue)
    const sessionPricePence = clinicData.sessionPricePence as number | undefined;
    if (!sessionPricePence || sessionPricePence <= 0) {
      missing.push("sessionPricePence");
    }

    // bookingUrl required for Pulse and fullstack
    if (trialModule === "pulse" || trialModule === "fullstack") {
      if (!clinicData.bookingUrl) missing.push("bookingUrl");
    }

    // Ava phone required for ava and fullstack
    if (trialModule === "ava" || trialModule === "fullstack") {
      const avaPhone = (clinicData.ava as Record<string, unknown> | undefined)?.config;
      const phone = (avaPhone as Record<string, unknown> | undefined)?.phone;
      if (!phone) missing.push("ava.config.phone");
    }

    if (missing.length > 0) {
      return NextResponse.json({ promoted: false, reason: "missing_config", missing });
    }

    // Query all owner/admin users for this clinic
    const usersSnap = await db
      .collection("users")
      .where("clinicId", "==", clinicId)
      .where("role", "in", ["owner", "admin"])
      .get();

    if (usersSnap.empty) {
      // No admin users found — can't go live without at least one
      return NextResponse.json({ promoted: false, reason: "no_admin_users" });
    }

    // Check all have completed first login (firstLogin starts as true, set to false after tour)
    const allDone = usersSnap.docs.every((doc) => {
      const data = doc.data() as { firstLogin?: boolean };
      return data.firstLogin === false;
    });

    if (!allDone) {
      return NextResponse.json({ promoted: false, reason: "pending_logins" });
    }

    // All admin/owner users have logged in — promote to live
    await db.collection("clinics").doc(clinicId).update({
      status: "live",
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({ promoted: true });
  } catch (err) {
    return handleApiError(err);
  }
}

export const POST = withRequestLog(handler);
