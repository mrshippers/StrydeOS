/**
 * POST /api/clinicians/add
 *
 * Adds a clinician to a clinic, enforcing seat limits based on billing tier.
 * Creates a Firebase Auth user, a Firestore user doc, and the clinician doc.
 * Sends a password-reset invite email so the clinician can set their password.
 *
 * Body:
 *   {
 *     name: string
 *     email: string
 *     role?: string              (default: "Physiotherapist")
 *     authRole?: "clinician"|"admin" (default: "clinician")
 *     pmsExternalId?: string
 *     physitrackId?: string
 *   }
 *
 * Returns: { id: string, clinician: object, emailSent: boolean }
 *
 * Requires: Authorization: Bearer <Firebase ID token> (owner or admin)
 */

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { getAdminDb, getAdminAuth } from "@/lib/firebase-admin";
import { verifyApiRequest, requireRole, handleApiError } from "@/lib/auth-guard";
import { canAddClinician } from "@/lib/billing";
import { withRequestLog } from "@/lib/request-logger";
import crypto from "crypto";

export const runtime = "nodejs";

async function handler(request: NextRequest) {
  // Rate limit: 10 requests per IP per 60 seconds (async for distributed Redis enforcement)
  const { limited, remaining } = await checkRateLimitAsync(request, { limit: 10, windowMs: 60_000 });
  if (limited) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "X-RateLimit-Remaining": String(remaining) } }
    );
  }

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
    const email = (body.email ?? "").trim().toLowerCase();
    const authRole = body.authRole === "admin" ? "admin" : "clinician";

    if (!name) {
      return NextResponse.json(
        { error: "Clinician name is required" },
        { status: 400 }
      );
    }

    if (!email) {
      return NextResponse.json(
        { error: "Clinician email is required" },
        { status: 400 }
      );
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    const db = getAdminDb();
    const adminAuth = getAdminAuth();

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

    // ── Check for existing Firebase Auth user with this email ────────
    // If they already have an account (e.g. signed up independently), we enrol
    // them into this clinic rather than blocking with a 409.
    let existingAuthUid: string | null = null;
    try {
      const existing = await adminAuth.getUserByEmail(email);
      existingAuthUid = existing.uid;
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e.code !== "auth/user-not-found") {
        throw err;
      }
    }

    const now = new Date().toISOString();
    const nameParts = name.split(/\s+/);
    const firstName = nameParts[0] ?? "";
    const lastName = nameParts.slice(1).join(" ") || "";

    let ref: Awaited<ReturnType<ReturnType<typeof db.collection>["add"]>>;

    if (existingAuthUid) {
      // ── Existing Firebase Auth user — enrol into this clinic ───────
      // Check they're not already in this clinic's clinicians subcollection
      const existingClinicianSnap = await db
        .collection("clinics")
        .doc(clinicId)
        .collection("clinicians")
        .where("authUid", "==", existingAuthUid)
        .limit(1)
        .get();

      if (!existingClinicianSnap.empty) {
        return NextResponse.json(
          { error: `${name} is already a member of this clinic` },
          { status: 409 }
        );
      }

      const clinicianData = {
        name,
        email,
        role: (body.role ?? "Physiotherapist").trim(),
        authRole,
        authUid: existingAuthUid,
        status: "registered" as const,
        pmsExternalId: body.pmsExternalId ?? null,
        physitrackId: body.physitrackId ?? null,
        active: true,
        avatar: null,
        createdAt: now,
        createdBy: user.uid,
      };

      ref = await db
        .collection("clinics")
        .doc(clinicId)
        .collection("clinicians")
        .add(clinicianData);

      // Update the existing user doc to point at this clinic + link clinicianId
      await db.collection("users").doc(existingAuthUid).update({
        clinicId,
        clinicianId: ref.id,
        role: authRole,
      });

      return NextResponse.json(
        {
          id: ref.id,
          clinician: { id: ref.id, ...clinicianData },
          emailSent: false,
          note: "Existing account enrolled into clinic — no invite email sent.",
        },
        { status: 201 }
      );
    }

    // ── New user: create Firebase Auth user ─────────────────────────
    const tempPassword = crypto.randomBytes(24).toString("base64url");

    const newAuthUser = await adminAuth.createUser({
      email,
      displayName: name,
      password: tempPassword,
      emailVerified: false,
    });

    const clinicianData = {
      name,
      email,
      role: (body.role ?? "Physiotherapist").trim(),
      authRole,
      authUid: newAuthUser.uid,
      status: "invited" as const,
      pmsExternalId: body.pmsExternalId ?? null,
      physitrackId: body.physitrackId ?? null,
      active: true,
      avatar: null,
      createdAt: now,
      createdBy: user.uid,
    };

    try {
      // ── Create clinician doc first to get its ID ──────────────────
      ref = await db
        .collection("clinics")
        .doc(clinicId)
        .collection("clinicians")
        .add(clinicianData);

      // ── Create Firestore user doc with clinicianId linked ─────────
      await db.collection("users").doc(newAuthUser.uid).set({
        clinicId,
        clinicianId: ref.id,
        role: authRole,
        firstName,
        lastName,
        email,
        status: "invited",
        firstLogin: true,
        tourCompleted: false,
        createdAt: now,
        createdBy: user.uid,
      });
    } catch (firestoreErr) {
      // Firestore write failed after Auth user was created — clean up orphan
      console.error("[clinicians/add] Firestore write failed, deleting orphaned Auth user:", firestoreErr);
      try {
        await adminAuth.deleteUser(newAuthUser.uid);
      } catch (deleteErr) {
        console.error("[clinicians/add] Failed to delete orphaned Auth user:", deleteErr);
      }
      throw firestoreErr;
    }

    // ── Send invite email via password reset link ───────────────────
    let emailSent = false;
    try {
      const resetLink = await adminAuth.generatePasswordResetLink(email, {
        url: `${process.env.APP_URL ?? "https://portal.strydeos.com"}/login`,
      });

      const resendKey = process.env.RESEND_API_KEY;
      if (resendKey) {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "StrydeOS <noreply@strydeos.com>",
            to: [email],
            subject: "Your StrydeOS invite — set your password to get started",
            html: `
              <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
                <h2 style="color: #0B2545; margin-bottom: 8px;">Welcome to StrydeOS</h2>
                <p style="color: #6B7280; margin-bottom: 24px;">
                  You've been invited to join your clinic on StrydeOS — the clinical
                  operating system built for high-performance physiotherapy practices.
                </p>
                <a href="${resetLink}" style="display: inline-block; background: #1C54F2; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
                  Set your password &amp; sign in
                </a>
                <p style="color: #9CA3AF; font-size: 12px; margin-top: 24px;">
                  This link expires in 1 hour. If you weren't expecting this email, you can safely ignore it.
                </p>
              </div>
            `,
          }),
        });

        if (res.ok) {
          emailSent = true;
        } else {
          const errBody = await res.text().catch(() => "unknown");
          console.error("[clinicians/add] Resend API returned error:", res.status, errBody);
        }
      }
    } catch (emailErr) {
      console.error("[clinicians/add] Failed to send invite email:", emailErr);
      // Non-fatal — clinician is still created, invite can be resent later
    }

    return NextResponse.json(
      {
        id: ref.id,
        clinician: { id: ref.id, ...clinicianData },
        emailSent,
      },
      { status: 201 }
    );
  } catch (e) {
    return handleApiError(e);
  }
}

export const POST = withRequestLog(handler);
