/**
 * POST /api/clinic/set-claims
 *
 * Admin-only endpoint that reads a user's Firestore doc and stamps the
 * corresponding custom claims on their Firebase Auth token.
 *
 * Used during provisioning and as a targeted migration for individual users.
 *
 * Body: { targetUid: string }
 * Auth: Bearer token — owner, admin, or superadmin
 *
 * - superadmin can set claims for any user
 * - owner/admin can only set claims for users in their own clinic
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import {
  verifyApiRequest,
  requireRole,
  handleApiError,
} from "@/lib/auth-guard";
import { setCustomClaims } from "@/lib/set-custom-claims";
import type { UserRole } from "@/types";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const caller = await verifyApiRequest(request);
    requireRole(caller, ["owner", "admin", "superadmin"]);

    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const targetUid = (body.targetUid as string | undefined)?.trim();
    if (!targetUid) {
      return NextResponse.json(
        { error: "targetUid is required" },
        { status: 400 }
      );
    }

    const db = getAdminDb();
    const userDoc = await db.collection("users").doc(targetUid).get();

    if (!userDoc.exists) {
      return NextResponse.json(
        { error: "Target user not found" },
        { status: 404 }
      );
    }

    const data = userDoc.data()!;
    const targetClinicId = data.clinicId as string | undefined;
    const targetRole = data.role as UserRole | undefined;

    if (!targetRole) {
      return NextResponse.json(
        { error: "Target user has no role in Firestore" },
        { status: 400 }
      );
    }

    if (targetRole !== "superadmin" && !targetClinicId) {
      return NextResponse.json(
        { error: "Target user has no clinicId in Firestore" },
        { status: 400 }
      );
    }

    // Non-superadmin callers can only set claims for users in their own clinic
    if (caller.role !== "superadmin") {
      if (targetClinicId !== caller.clinicId) {
        return NextResponse.json(
          { error: "Access denied — target user is in a different clinic" },
          { status: 403 }
        );
      }
    }

    const claims = {
      clinicId: targetClinicId ?? "",
      role: targetRole,
      ...(data.clinicianId ? { clinicianId: data.clinicianId as string } : {}),
    };

    await setCustomClaims(targetUid, claims);

    return NextResponse.json({ ok: true, claims }, { status: 200 });
  } catch (e) {
    return handleApiError(e);
  }
}
