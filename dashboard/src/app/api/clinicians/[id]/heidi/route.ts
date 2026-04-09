/**
 * PATCH /api/clinicians/[id]/heidi
 *
 * Per-clinician Heidi Health opt-in/opt-out.
 *
 * Access rules:
 * - A clinician can only update their own record.
 * - Owners, admins, and superadmins can update any clinician within their clinic.
 *
 * Body:
 *   { enabled: boolean, email?: string }
 *
 * When enabling, `email` is required (Heidi JWTs are issued per-user via email).
 * When disabling, email is cleared.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyApiRequest, handleApiError } from "@/lib/auth-guard";
import type { UserRole } from "@/types";
import { withRequestLog } from "@/lib/request-logger";

const ADMIN_ROLES = new Set(["owner", "admin", "superadmin"]);

async function handler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await verifyApiRequest(request);
    const { id: clinicianId } = await params;

    let effectiveRole: UserRole = user.role;
    if (ADMIN_ROLES.has(user.role)) {
      // Re-verify role via fresh Firestore lookup — don't trust cached token for privileged ops
      const freshUserDoc = await getAdminDb().collection("users").doc(user.uid).get();
      effectiveRole = (freshUserDoc.data()?.role as UserRole) ?? user.role;
    }

    const isAdmin = ADMIN_ROLES.has(effectiveRole);
    const isSelf = user.clinicianId === clinicianId;

    // Clinicians can only update their own record
    if (!isAdmin && !isSelf) {
      return NextResponse.json(
        { error: "You can only update your own Heidi integration settings" },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const enabled = body.enabled as boolean | undefined;
    const email = body.email as string | undefined;

    if (enabled === undefined) {
      return NextResponse.json({ error: "'enabled' field is required" }, { status: 400 });
    }

    if (enabled && !email?.trim()) {
      return NextResponse.json(
        { error: "Heidi email is required when enabling the integration" },
        { status: 400 },
      );
    }

    const db = getAdminDb();
    const clinicianRef = db
      .collection("clinics")
      .doc(user.clinicId)
      .collection("clinicians")
      .doc(clinicianId);

    const snap = await clinicianRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Clinician not found" }, { status: 404 });
    }

    await clinicianRef.update({
      heidiEnabled: enabled,
      heidiEmail: enabled ? email!.trim() : null,
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}

export const PATCH = withRequestLog(handler);
