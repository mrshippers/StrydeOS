/**
 * PATCH /api/clinicians/[id]/role
 *
 * Change a team member's access role (RBAC). Owners/admins/superadmins only.
 *
 * Body: { role: "owner" | "admin" | "clinician" }
 *
 * Updates the clinician doc's authRole AND the linked user's enforced `role`.
 * Guards:
 *  - only owner/admin/superadmin may change roles (clinicians cannot)
 *  - you cannot change your own role (prevents self-lockout)
 *  - only an owner/superadmin may assign or modify owner-level access
 *  - the last active owner cannot be demoted
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyApiRequest, handleApiError } from "@/lib/auth-guard";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { writeAuditLog, extractIpFromRequest } from "@/lib/audit-log";
import { withRequestLog } from "@/lib/request-logger";
import type { UserRole } from "@/types";

const ADMIN_ROLES = new Set<UserRole>(["owner", "admin", "superadmin"]);
const ASSIGNABLE = new Set(["owner", "admin", "clinician"]);

async function handler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { limited, remaining } = await checkRateLimitAsync(request, { limit: 10, windowMs: 60_000 });
  if (limited) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "X-RateLimit-Remaining": String(remaining) } },
    );
  }

  try {
    const user = await verifyApiRequest(request);
    const { id: clinicianId } = await params;

    // Re-verify role from Firestore — don't trust the cached token for a privileged op.
    let effectiveRole: UserRole = user.role;
    if (ADMIN_ROLES.has(user.role)) {
      const fresh = await getAdminDb().collection("users").doc(user.uid).get();
      effectiveRole = (fresh.data()?.role as UserRole) ?? user.role;
    }
    if (!ADMIN_ROLES.has(effectiveRole)) {
      return NextResponse.json({ error: "Only owners and admins can change roles" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const newRole = body.role as string | undefined;
    if (!newRole || !ASSIGNABLE.has(newRole)) {
      return NextResponse.json({ error: "role must be 'owner', 'admin' or 'clinician'" }, { status: 400 });
    }

    const db = getAdminDb();
    const cliniciansCol = db.collection("clinics").doc(user.clinicId).collection("clinicians");
    const ref = cliniciansCol.doc(clinicianId);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Clinician not found" }, { status: 404 });
    }
    const target = snap.data() as { authUid?: string; authRole?: string; name?: string };

    // Cannot change your own role.
    if (target.authUid && target.authUid === user.uid) {
      return NextResponse.json({ error: "You cannot change your own role" }, { status: 403 });
    }

    // Only an owner/superadmin may assign or modify owner-level access.
    const isOwnerLevel = effectiveRole === "owner" || effectiveRole === "superadmin";
    if ((newRole === "owner" || target.authRole === "owner") && !isOwnerLevel) {
      return NextResponse.json(
        { error: "Only an owner can assign or change owner-level access" },
        { status: 403 },
      );
    }

    // Protect the last active owner.
    if (target.authRole === "owner" && newRole !== "owner") {
      const all = await cliniciansCol.get();
      const activeOwners = all.docs.filter((d) => {
        const x = d.data() as { authRole?: string; active?: boolean };
        return x.authRole === "owner" && x.active !== false;
      });
      if (activeOwners.length <= 1) {
        return NextResponse.json({ error: "Cannot remove the last owner" }, { status: 409 });
      }
    }

    const now = new Date().toISOString();
    await ref.update({ authRole: newRole, updatedAt: now });
    // Mirror to the enforced RBAC role on the linked user.
    if (target.authUid) {
      await db.collection("users").doc(target.authUid).set({ role: newRole, updatedAt: now }, { merge: true });
    }

    await writeAuditLog(db, user.clinicId, {
      userId: user.uid,
      userEmail: user.email,
      action: "config_change",
      resource: "clinician_role",
      resourceId: clinicianId,
      metadata: { from: target.authRole ?? null, to: newRole, targetName: target.name ?? null },
      ip: extractIpFromRequest(request),
    });

    return NextResponse.json({ ok: true, role: newRole });
  } catch (e) {
    return handleApiError(e);
  }
}

export const PATCH = withRequestLog(handler);
