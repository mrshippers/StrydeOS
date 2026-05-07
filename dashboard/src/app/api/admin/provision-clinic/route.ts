/**
 * POST /api/admin/provision-clinic
 *
 * Superadmin-only endpoint for manually provisioning a new clinic.
 * Used by the StrydeOS team to onboard clients without self-serve signup,
 * and called by n8n when a qualified lead converts in Notion.
 *
 * Authentication: requires BOTH a valid STRYDE_ADMIN_SECRET header AND a Firebase
 * superadmin token in Authorization: Bearer <token>. Both are mandatory.
 *
 * Creates:
 *   - Firebase Auth user for the clinic owner (temp password, reset email sent)
 *   - Firestore clinic doc
 *   - Firestore user doc
 *   - Stripe customer
 *
 * Returns: { clinicId, uid, email, passwordResetLink }
 */

import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminAuth } from "@/lib/firebase-admin";
import { checkRateLimitAsync } from "@/lib/rate-limit";
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
import { withRequestLog } from "@/lib/request-logger";
import { buildWelcomeEmail, buildWelcomeText } from "@/lib/intelligence/emails/welcome";
import { runMigrations, MIGRATIONS } from "@/lib/migrations";

async function handler(request: NextRequest) {
  // Rate limit: 5 requests per IP per 60 seconds (creates Firebase Auth users + Firestore docs)
  const { limited, remaining } = await checkRateLimitAsync(request, { limit: 5, windowMs: 60_000 });
  if (limited) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "X-RateLimit-Remaining": String(remaining) } }
    );
  }

  let uid: string | undefined;
  try {
    // ── Auth check: both admin secret AND superadmin Firebase token required ──
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

    let provisionedBy: string;
    const token = authHeader.slice(7);
    try {
      const adminAuth = getAdminAuth();
      const decoded = await adminAuth.verifyIdToken(token, true);
      const userDoc = await getAdminDb().collection("users").doc(decoded.uid).get();
      if (!userDoc.exists || userDoc.data()?.role !== "superadmin") {
        return NextResponse.json({ error: "Superadmin role required" }, { status: 403 });
      }
      provisionedBy = decoded.uid;
    } catch {
      return NextResponse.json({ error: "Invalid Firebase token" }, { status: 401 });
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
    const tempPassword = crypto.randomBytes(24).toString("base64url");

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
      followUpRate: 4.0,
      hepRate: 80,
      utilisationRate: 80,
      dnaRate: 5,
      treatmentCompletionTarget: 70,
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
      createdBy: `admin_provision:${provisionedBy}`,
      updatedBy: `admin_provision:${provisionedBy}`,
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
      commsConsentGrantedAt: now,
      trialStartedAt: now,
      createdAt: now,
      updatedAt: now,
      ...(notionLeadId ? { notionLeadId } : {}),
    });

    await batch.commit();

    // ── Schema migrations ────────────────────────────────────────────────────────
    // Apply any pending schema migrations to the freshly-provisioned clinic so
    // it lands at CONTRACTS_SCHEMA_VERSION from minute one. With zero entries
    // in MIGRATIONS today this is a no-op; when a v2+ migration is appended,
    // every new clinic provisioned after the deploy is automatically current.
    // Non-blocking: provisioning succeeded; if a future migration fails the
    // admin /run-migrations route can rerun it idempotently.
    try {
      const migrationResult = await runMigrations(db, clinicId, MIGRATIONS);
      if (migrationResult.errors.length > 0) {
        console.error(
          "[provision-clinic] Migration errors for new clinic:",
          clinicId,
          migrationResult.errors
        );
      }
    } catch (migErr) {
      console.error("[provision-clinic] Migration runner failed:", migErr);
    }

    // ── Password reset link ──────────────────────────────────────────────────────
    let passwordResetLink: string | null = null;
    try {
      passwordResetLink = await auth.generatePasswordResetLink(trimmedEmail, {
        url: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://portal.strydeos.com"}/login?welcome=1`,
      });
    } catch {
      // Non-blocking — can be resent manually
    }

    // ── Welcome email ────────────────────────────────────────────────────────────
    let welcomeEmailSent = false;
    if (passwordResetLink) {
      try {
        const resendKey = process.env.RESEND_API_KEY;
        if (resendKey) {
          const firstName = ownerFirstName?.trim() || "there";
          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${resendKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: "StrydeOS <noreply@strydeos.com>",
              to: [trimmedEmail],
              subject: `${trimmedName} is live on StrydeOS`,
              html: buildWelcomeEmail(firstName, trimmedName, passwordResetLink),
              text: buildWelcomeText(firstName, trimmedName, passwordResetLink),
            }),
          });
          welcomeEmailSent = res.ok;
          if (!res.ok) {
            const errBody = await res.text().catch(() => "unknown");
            console.error("[provision-clinic] Welcome email failed:", res.status, errBody);
          }
        }
      } catch (emailErr) {
        console.error("[provision-clinic] Welcome email error:", emailErr);
      }
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
      { uid, clinicId, email: trimmedEmail, passwordResetSent: !!passwordResetLink, welcomeEmailSent },
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

export const POST = withRequestLog(handler);
