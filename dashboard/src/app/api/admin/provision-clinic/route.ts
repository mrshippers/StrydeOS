/**
 * POST /api/admin/provision-clinic
 *
 * Superadmin-only endpoint for manually provisioning a new clinic.
 * Used by the StrydeOS team to onboard clients without self-serve signup,
 * and called by n8n when a qualified lead converts in Notion.
 *
 * Authentication: requires a valid STRYDE_ADMIN_SECRET header AND a Firebase
 * superadmin token in Authorization: Bearer <token>.
 *
 * Creates:
 *   - Firebase Auth user for the clinic owner (temp password, reset email sent)
 *   - Firestore clinic doc
 *   - Firestore user doc
 *   - Stripe customer
 *
 * Returns: { clinicId, uid, email, passwordResetLink }
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminAuth } from "@/lib/firebase-admin";
import { setCustomClaims } from "@/lib/set-custom-claims";
import type {
  UserRole,
  UserStatus,
  ClinicStatus,
  FeatureFlags,
  ClinicTargets,
  OnboardingState,
  OnboardingV2,
  BrandConfig,
  PmsProvider,
} from "@/types";

export async function POST(request: NextRequest) {
  let uid: string | undefined;
  try {
    // ── Auth check ──────────────────────────────────────────────────────────────
    const adminSecret = request.headers.get("x-admin-secret");
    if (!adminSecret || adminSecret !== process.env.STRYDE_ADMIN_SECRET) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Optionally verify Firebase superadmin token (reads from custom claims)
    const authHeader = request.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      try {
        const adminAuth = getAdminAuth();
        const decoded = await adminAuth.verifyIdToken(token);
        if (decoded.role !== "superadmin") {
          return NextResponse.json({ error: "Superadmin role required" }, { status: 403 });
        }
      } catch {
        return NextResponse.json({ error: "Invalid Firebase token" }, { status: 401 });
      }
    }

    // ── Parse body ──────────────────────────────────────────────────────────────
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const {
      clinicName,
      ownerEmail,
      ownerFirstName,
      ownerLastName,
      pmsType,
      country,
      plan,
      notionLeadId,
    } = body as {
      clinicName?: string;
      ownerEmail?: string;
      ownerFirstName?: string;
      ownerLastName?: string;
      pmsType?: PmsProvider;
      country?: string;
      plan?: "starter" | "growth" | "scale";
      notionLeadId?: string;
    };

    if (!clinicName?.trim() || !ownerEmail?.trim()) {
      return NextResponse.json(
        { error: "clinicName and ownerEmail are required" },
        { status: 400 }
      );
    }

    const trimmedEmail = ownerEmail.trim().toLowerCase();
    const trimmedName = clinicName.trim();
    const auth = getAdminAuth();
    const db = getAdminDb();
    const now = new Date().toISOString();

    // ── Create Firebase Auth user ────────────────────────────────────────────────
    // Generate a cryptographically random temp password — user will reset via email
    const tempPassword = Array.from({ length: 24 }, () =>
      "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$".charAt(
        Math.floor(Math.random() * 59)
      )
    ).join("");

    try {
      const userRecord = await auth.createUser({
        email: trimmedEmail,
        password: tempPassword,
        displayName: [ownerFirstName, ownerLastName].filter(Boolean).join(" ") || trimmedName,
      });
      uid = userRecord.uid;
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === "auth/email-already-exists") {
        return NextResponse.json(
          { error: "An account with this email already exists." },
          { status: 409 }
        );
      }
      throw err;
    }

    // ── Firestore setup ──────────────────────────────────────────────────────────
    const clinicRef = db.collection("clinics").doc();
    const clinicId = clinicRef.id;

    const defaultTargets: ClinicTargets = {
      followUpRate: 75,
      physitrackRate: 80,
      utilisationRate: 85,
      dnaRate: 5,
      courseCompletionTarget: 70,
    };

    // All flags start false — trial grants temporary access, Stripe webhook
    // sets flags to true when the clinic subscribes.
    const defaultFeatureFlags: FeatureFlags = {
      intelligence: false,
      continuity: false,
      receptionist: false,
    };

    const defaultOnboarding: OnboardingState = {
      pmsConnected: false,
      cliniciansConfirmed: false,
      targetsSet: false,
    };

    const onboardingV2: OnboardingV2 = {
      stage: "signup_complete",
      path: "assisted",
      blockers: [],
      firstValueAt: null,
      activationAt: null,
      lastEventAt: now,
    };

    const defaultBrandConfig: BrandConfig = {};

    // ── Stripe customer ──────────────────────────────────────────────────────────
    let stripeCustomerId: string | null = null;
    try {
      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (stripeKey) {
        const { getStripe } = await import("@/lib/stripe");
        const stripe = getStripe();
        const customer = await stripe.customers.create({
          email: trimmedEmail,
          name: trimmedName,
          metadata: {
            clinicId,
            source: "admin_provision",
            plan: plan ?? "starter",
            ...(notionLeadId ? { notionLeadId } : {}),
          },
        });
        stripeCustomerId = customer.id;
      }
    } catch {
      // Non-blocking — billing page will link later
    }

    // ── Write Firestore docs atomically ──────────────────────────────────────────
    const batch = db.batch();

    batch.set(db.collection("users").doc(uid!), {
      clinicId,
      role: "owner" as UserRole,
      firstName: ownerFirstName?.trim() ?? "",
      lastName: ownerLastName?.trim() ?? "",
      email: trimmedEmail,
      status: "onboarding" as UserStatus,
      firstLogin: true,
      tourCompleted: false,
      createdAt: now,
      updatedAt: now,
      createdBy: "admin_provision",
      updatedBy: "admin_provision",
    });

    batch.set(clinicRef, {
      name: trimmedName,
      timezone: country === "au" ? "Australia/Sydney" : country === "us" ? "America/New_York" : "Europe/London",
      ownerEmail: trimmedEmail,
      status: "onboarding" as ClinicStatus,
      pmsType: pmsType ?? null,
      pmsLastSyncAt: null,
      featureFlags: defaultFeatureFlags,
      targets: defaultTargets,
      brandConfig: defaultBrandConfig,
      onboarding: defaultOnboarding,
      onboardingV2,
      billing: {
        stripeCustomerId,
        subscriptionId: null,
        subscriptionStatus: null,
        currentPeriodEnd: null,
      },
      provisionedPlan: plan ?? "starter",
      country: country ?? "uk",
      trialStartedAt: now,
      createdAt: now,
      updatedAt: now,
      ...(notionLeadId ? { notionLeadId } : {}),
    });

    await batch.commit();

    // Stamp custom claims so verifyApiRequest reads from the JWT
    await setCustomClaims(uid!, { clinicId, role: "owner" });

    // ── Password reset link ──────────────────────────────────────────────────────
    let passwordResetLink: string | null = null;
    try {
      passwordResetLink = await auth.generatePasswordResetLink(trimmedEmail, {
        url: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://app.strydeos.com"}/login?welcome=1`,
      });
    } catch {
      // Non-blocking — can be resent manually
    }

    // ── Funnel event ─────────────────────────────────────────────────────────────
    try {
      await db.collection("funnel_events").add({
        event: "admin_provision",
        clinicId,
        userId: uid!,
        metadata: { source: "admin_provision", plan: plan ?? "starter", notionLeadId: notionLeadId ?? null },
        timestamp: now,
      });
    } catch {
      // Non-blocking
    }

    return NextResponse.json(
      { uid, clinicId, email: trimmedEmail, passwordResetLink },
      { status: 201 }
    );
  } catch (err) {
    console.error("[provision-clinic error]", err);
    if (uid) {
      try {
        await getAdminAuth().deleteUser(uid);
      } catch {
        console.error("[provision-clinic cleanup] Failed to delete orphaned auth user:", uid);
      }
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
