import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
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
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let uid: string;
  let clinicId: string;

  try {
    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  try {
    const db = getAdminDb();

    // Get the calling user's clinicId
    const userSnap = await db.collection("users").doc(uid).get();
    if (!userSnap.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const userData = userSnap.data() as { clinicId?: string; role?: string };
    clinicId = userData.clinicId ?? "";

    if (!clinicId) {
      return NextResponse.json({ error: "User has no clinicId" }, { status: 400 });
    }

    // Check current clinic status
    const clinicSnap = await db.collection("clinics").doc(clinicId).get();
    if (!clinicSnap.exists) {
      return NextResponse.json({ error: "Clinic not found" }, { status: 404 });
    }

    const clinicData = clinicSnap.data() as { status?: string };
    if (clinicData.status === "live") {
      // Already live — no-op
      return NextResponse.json({ promoted: false, alreadyLive: true });
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

    // Check all have completed first login (firstLogin === true)
    const allDone = usersSnap.docs.every((doc) => {
      const data = doc.data() as { firstLogin?: boolean };
      return data.firstLogin === true;
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
    console.error("[check-go-live] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export const POST = withRequestLog(handler);
