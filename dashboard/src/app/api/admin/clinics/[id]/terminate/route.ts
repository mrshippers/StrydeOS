/**
 * POST /api/admin/clinics/[id]/terminate
 *
 * Superadmin-only endpoint to schedule (or cancel) full clinic data erasure.
 *
 * Authentication mirrors provision-clinic: BOTH a valid STRYDE_ADMIN_SECRET
 * header AND a Firebase superadmin token in Authorization: Bearer <token>.
 *
 * Body:
 *   { action?: "schedule" | "cancel", reason?: string, graceDays?: number }
 *
 *   - schedule (default): sets status "churned" + termination markers. The
 *     weekly data-health cron erases ALL clinic data once the 30-day grace
 *     period (terminationScheduledAt) elapses. See lib/compliance/clinic-erasure.
 *   - cancel: clears the termination markers and parks the clinic at "paused"
 *     (recoverable, non-billing). Safe within the grace window before erasure.
 */

import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminAuth } from "@/lib/firebase-admin";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { writeAuditLog, extractIpFromRequest } from "@/lib/audit-log";
import { withRequestLog } from "@/lib/request-logger";
import type { ClinicStatus } from "@/types";

const CLINIC_TERMINATION_GRACE_DAYS = 30;

async function handler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Rate limit: 5 requests per IP per 60 seconds (irreversible data erasure).
  const { limited, remaining } = await checkRateLimitAsync(request, { limit: 5, windowMs: 60_000 });
  if (limited) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "X-RateLimit-Remaining": String(remaining) } }
    );
  }

  // ── Auth: admin secret AND superadmin Firebase token both required ──
  const adminSecret = request.headers.get("x-admin-secret");
  const expectedSecret = process.env.STRYDE_ADMIN_SECRET;
  if (
    !adminSecret ||
    !expectedSecret ||
    adminSecret.length !== expectedSecret.length ||
    !crypto.timingSafeEqual(Buffer.from(adminSecret), Buffer.from(expectedSecret))
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Firebase superadmin token required" }, { status: 401 });
  }

  const db = getAdminDb();

  let actorUid: string;
  let actorEmail: string;
  try {
    const decoded = await getAdminAuth().verifyIdToken(authHeader.slice(7), true);
    const userDoc = await db.collection("users").doc(decoded.uid).get();
    if (!userDoc.exists || userDoc.data()?.role !== "superadmin") {
      return NextResponse.json({ error: "Superadmin role required" }, { status: 403 });
    }
    actorUid = decoded.uid;
    actorEmail = userDoc.data()?.email ?? decoded.email ?? decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid Firebase token" }, { status: 401 });
  }

  const { id: clinicId } = await params;

  const body = (await request.json().catch(() => ({}))) as {
    action?: "schedule" | "cancel";
    reason?: string;
    graceDays?: number;
  };
  const action = body.action ?? "schedule";

  const clinicRef = db.collection("clinics").doc(clinicId);
  const clinicSnap = await clinicRef.get();
  if (!clinicSnap.exists) {
    return NextResponse.json({ error: "Clinic not found" }, { status: 404 });
  }

  const now = new Date();
  const nowIso = now.toISOString();

  if (action === "cancel") {
    await clinicRef.update({
      status: "paused" as ClinicStatus,
      terminationRequestedAt: null,
      terminationScheduledAt: null,
      terminationReason: null,
      terminatedBy: null,
      updatedAt: nowIso,
    });

    await writeAuditLog(db, clinicId, {
      userId: actorUid,
      userEmail: actorEmail,
      action: "update",
      resource: "clinic_termination",
      resourceId: clinicId,
      metadata: { action: "cancel" },
      ip: extractIpFromRequest(request),
    });

    return NextResponse.json({ ok: true, action: "cancel", clinicId, status: "paused" });
  }

  // ── schedule ──
  const graceDays =
    typeof body.graceDays === "number" && body.graceDays >= 0
      ? Math.floor(body.graceDays)
      : CLINIC_TERMINATION_GRACE_DAYS;

  const scheduledAt = new Date(now.getTime() + graceDays * 86_400_000).toISOString();

  await clinicRef.update({
    status: "churned" as ClinicStatus,
    terminationRequestedAt: nowIso,
    terminationScheduledAt: scheduledAt,
    terminationReason: body.reason?.trim() || null,
    terminatedBy: actorUid,
    updatedAt: nowIso,
  });

  await writeAuditLog(db, clinicId, {
    userId: actorUid,
    userEmail: actorEmail,
    action: "update",
    resource: "clinic_termination",
    resourceId: clinicId,
    metadata: { action: "schedule", graceDays, scheduledAt, reason: body.reason?.trim() || null },
    ip: extractIpFromRequest(request),
  });

  return NextResponse.json({
    ok: true,
    action: "schedule",
    clinicId,
    status: "churned",
    terminationScheduledAt: scheduledAt,
    graceDays,
  });
}

export const POST = withRequestLog(handler);
