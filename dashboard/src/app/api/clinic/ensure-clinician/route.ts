/**
 * POST /api/clinic/ensure-clinician
 *
 * Self-heal endpoint called on first login. Guarantees every verified user has:
 *   1. A clinician doc in clinics/{clinicId}/clinicians with active: true
 *   2. clinicianId set on their users/{uid} doc
 *   3. status updated from "invited" → "registered" in both docs
 *
 * Idempotent — safe to call on every first login. No-ops if already correct.
 * Returns { ensured: true, clinicianId } on success.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyApiRequest, handleApiError } from "@/lib/auth-guard";
import { withRequestLog } from "@/lib/request-logger";

export const runtime = "nodejs";

async function handler(request: NextRequest) {
  try {
    const user = await verifyApiRequest(request);
    const { uid, clinicId } = user;

    if (!clinicId) {
      return NextResponse.json(
        { error: "No clinic associated with this account" },
        { status: 400 }
      );
    }

    const db = getAdminDb();
    const now = new Date().toISOString();

    // ── 1. Check if a clinician doc already exists for this user ────
    const existingSnap = await db
      .collection("clinics")
      .doc(clinicId)
      .collection("clinicians")
      .where("authUid", "==", uid)
      .limit(1)
      .get();

    if (!existingSnap.empty) {
      const existingDoc = existingSnap.docs[0];
      const existingData = existingDoc.data();
      const clinicianId = existingDoc.id;

      // Ensure clinicianId is linked in user doc and status is up to date
      const userRef = db.collection("users").doc(uid);
      const userSnap = await userRef.get();
      const userData = userSnap.data() ?? {};

      const userUpdates: Record<string, unknown> = {};
      if (!userData.clinicianId) userUpdates.clinicianId = clinicianId;
      if (userData.status === "invited") userUpdates.status = "registered";

      const clinicianUpdates: Record<string, unknown> = {};
      if (existingData.status === "invited") clinicianUpdates.status = "registered";

      await Promise.all([
        Object.keys(userUpdates).length > 0 ? userRef.update(userUpdates) : Promise.resolve(),
        Object.keys(clinicianUpdates).length > 0
          ? existingDoc.ref.update(clinicianUpdates)
          : Promise.resolve(),
      ]);

      return NextResponse.json({ ensured: true, clinicianId, created: false });
    }

    // ── 2. No clinician doc — create one ────────────────────────────
    const userSnap = await db.collection("users").doc(uid).get();
    const userData = userSnap.data() ?? {};

    const displayName =
      [userData.firstName, userData.lastName].filter(Boolean).join(" ").trim() ||
      user.email ||
      "Unknown";

    const clinicianRef = db
      .collection("clinics")
      .doc(clinicId)
      .collection("clinicians")
      .doc();

    const batch = db.batch();

    batch.set(clinicianRef, {
      name: displayName,
      email: userData.email ?? user.email ?? "",
      role: userData.role === "owner" ? "Practice Owner" : "Physiotherapist",
      authRole: userData.role ?? "clinician",
      authUid: uid,
      status: "registered",
      active: true,
      avatar: null,
      pmsExternalId: null,
      physitrackId: null,
      createdAt: now,
      createdBy: "ensure_clinician",
    });

    batch.update(db.collection("users").doc(uid), {
      clinicianId: clinicianRef.id,
      ...(userData.status === "invited" ? { status: "registered" } : {}),
    });

    await batch.commit();

    return NextResponse.json(
      { ensured: true, clinicianId: clinicianRef.id, created: true },
      { status: 201 }
    );
  } catch (e) {
    return handleApiError(e);
  }
}

export const POST = withRequestLog(handler);
