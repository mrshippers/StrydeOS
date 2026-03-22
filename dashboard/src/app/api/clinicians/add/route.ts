/**
 * POST /api/clinicians/add
 *
 * Adds a clinician to a clinic, enforcing seat limits based on billing tier.
 *
 * Body:
 *   {
 *     name: string
 *     role?: string          (default: "Physiotherapist")
 *     pmsExternalId?: string
 *     physitrackId?: string
 *   }
 *
 * Returns: { id: string, clinician: object }
 *
 * Requires: Authorization: Bearer <Firebase ID token> (owner or admin)
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyApiRequest, requireRole, handleApiError } from "@/lib/auth-guard";
import { canAddClinician } from "@/lib/billing";
import { withRequestLog } from "@/lib/request-logger";

export const runtime = "nodejs";

async function handler(request: NextRequest) {
  try {
    const user = await verifyApiRequest(request);
    requireRole(user, ["owner", "admin", "superadmin"]);

    const { clinicId } = user;
    if (!clinicId) {
      return NextResponse.json(
        { error: "No clinic associated with this account" },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const name = (body.name ?? "").trim();
    if (!name) {
      return NextResponse.json(
        { error: "Clinician name is required" },
        { status: 400 }
      );
    }

    const db = getAdminDb();

    // ── Seat enforcement ──────────────────────────────────────────────
    if (user.role !== "superadmin" && user.role !== "owner") {
      const seatCheck = await canAddClinician(clinicId, db);
      if (!seatCheck.allowed) {
        return NextResponse.json(
          {
            error: seatCheck.reason,
            currentCount: seatCheck.currentCount,
            limit: seatCheck.limit,
            tierLimit: seatCheck.tierLimit,
            extraSeats: seatCheck.extraSeats,
            canPurchaseSeat: seatCheck.canPurchaseSeat,
          },
          { status: 403 }
        );
      }
    }

    // ── Create clinician ──────────────────────────────────────────────
    const now = new Date().toISOString();
    const clinicianData = {
      name,
      role: (body.role ?? "Physiotherapist").trim(),
      pmsExternalId: body.pmsExternalId ?? null,
      physitrackId: body.physitrackId ?? null,
      active: true,
      avatar: null,
      createdAt: now,
      createdBy: user.uid,
    };

    const ref = await db
      .collection("clinics")
      .doc(clinicId)
      .collection("clinicians")
      .add(clinicianData);

    return NextResponse.json(
      { id: ref.id, clinician: { id: ref.id, ...clinicianData } },
      { status: 201 }
    );
  } catch (e) {
    return handleApiError(e);
  }
}

export const POST = withRequestLog(handler);
