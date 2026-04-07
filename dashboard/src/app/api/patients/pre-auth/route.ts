/**
 * POST /api/patients/pre-auth
 *
 * Create or update a patient's pre-authorisation record.
 * Used by back-office staff when they receive a pre-auth code from an insurer.
 *
 * Body:
 *   patientId          — Firestore patient ID
 *   insurerName        — e.g. "Bupa", "AXA Health"
 *   preAuthCode        — e.g. "BPA-2026-4421"
 *   sessionsAuthorised — number of sessions approved
 *   expiryDate?        — ISO date string (optional)
 *   excessAmountPence? — patient excess in pence (optional)
 *   status             — "confirmed" | "pending" | "rejected"
 *
 * Auth: owner / admin / superadmin only.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyApiRequest, requireRole, handleApiError } from "@/lib/auth-guard";
import { validatePreAuth } from "@/lib/insurance/pre-auth";
import { withRequestLog } from "@/lib/request-logger";
import type { PreAuthStatus } from "@/types";

interface PreAuthBody {
  patientId: string;
  insurerName: string;
  preAuthCode: string;
  sessionsAuthorised: number;
  expiryDate?: string;
  excessAmountPence?: number;
  status: PreAuthStatus;
}

async function handler(req: NextRequest) {
  try {
    const db = getAdminDb();
    const user = await verifyApiRequest(req);
    requireRole(user, ["owner", "admin", "superadmin"]);
    const clinicId = user.clinicId;

    if (!clinicId) {
      return NextResponse.json({ error: "No clinic associated with user" }, { status: 400 });
    }

    const body: PreAuthBody = await req.json();

    if (!body.patientId) {
      return NextResponse.json({ error: "Missing patientId" }, { status: 400 });
    }

    // Validate pre-auth data
    const validation = validatePreAuth({
      insurerName: body.insurerName || "",
      preAuthCode: body.preAuthCode || "",
      sessionsAuthorised: body.sessionsAuthorised || 0,
      expiryDate: body.expiryDate,
    });

    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // Verify patient belongs to this clinic
    const patientRef = db
      .collection("clinics")
      .doc(clinicId)
      .collection("patients")
      .doc(body.patientId);

    const patientDoc = await patientRef.get();
    if (!patientDoc.exists) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }

    const now = new Date().toISOString();

    // Check for existing pre-auth
    const existingSnap = await patientRef
      .collection("pre_auths")
      .where("preAuthCode", "==", body.preAuthCode)
      .limit(1)
      .get();

    let preAuthId: string;

    if (!existingSnap.empty) {
      // Update existing pre-auth
      preAuthId = existingSnap.docs[0].id;
      await patientRef.collection("pre_auths").doc(preAuthId).update({
        insurerName: body.insurerName,
        sessionsAuthorised: body.sessionsAuthorised,
        expiryDate: body.expiryDate || null,
        excessAmountPence: body.excessAmountPence || null,
        status: body.status,
        confirmedBy: user.uid,
        updatedAt: now,
      });
    } else {
      // Create new pre-auth
      const newRef = patientRef.collection("pre_auths").doc();
      preAuthId = newRef.id;
      await newRef.set({
        patientId: body.patientId,
        insurerName: body.insurerName,
        preAuthCode: body.preAuthCode,
        sessionsAuthorised: body.sessionsAuthorised,
        sessionsUsed: 0,
        expiryDate: body.expiryDate || null,
        excessAmountPence: body.excessAmountPence || null,
        excessCollected: false,
        status: body.status,
        confirmedBy: user.uid,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Update patient-level fields
    await patientRef.update({
      insurerName: body.insurerName,
      insuranceFlag: true,
      preAuthStatus: body.status,
      updatedAt: now,
    });

    return NextResponse.json({
      preAuthId,
      message: existingSnap?.empty ? "Pre-auth created" : "Pre-auth updated",
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export const POST = withRequestLog(handler);
