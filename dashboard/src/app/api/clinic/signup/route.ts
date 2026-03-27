/**
 * POST /api/clinic/signup
 *
 * Atomic self-serve signup: creates Firebase Auth user, Firestore user doc,
 * Firestore clinic doc (with trial + onboardingV2), and a Stripe customer.
 * Idempotent — if the Firebase Auth user already exists, returns 409.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
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
  ComplianceConfig,
} from "@/types";
import { deriveJurisdictionFromCountry } from "@/data/compliance-config";
import { withRequestLog } from "@/lib/request-logger";

async function handler(request: NextRequest) {
  // Rate limit: 5 requests per IP per 15 minutes
  const { limited, remaining } = checkRateLimit(request, { limit: 5, windowMs: 15 * 60 * 1000 });
  if (limited) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "X-RateLimit-Remaining": String(remaining) } }
    );
  }

  let uid: string | undefined;
  let stripeCustomerIdForCleanup: string | undefined;
  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { clinicName, email, password, firstName, lastName, profession, clinicSize, country, trialModule, trialTier } = body as {
      clinicName?: string;
      email?: string;
      password?: string;
      firstName?: string;
      lastName?: string;
      profession?: string;
      clinicSize?: string;
      country?: string;
      trialModule?: string;
      trialTier?: string;
    };

    if (!clinicName?.trim() || !email?.trim() || !password) {
      return NextResponse.json(
        { error: "clinicName, email, and password are required" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedName = clinicName.trim();

    const auth = getAdminAuth();
    const db = getAdminDb();
    const now = new Date().toISOString();

    // ── Pre-flight: check if this email belongs to an invited clinician ──────
    // If an owner already created the clinic and invited this person,
    // they should use their invite link — not create a duplicate clinic.
    try {
      const existingUser = await auth.getUserByEmail(trimmedEmail);
      // User exists in Firebase Auth — check if they have a Firestore user doc
      const userDoc = await db.collection("users").doc(existingUser.uid).get();
      if (userDoc.exists) {
        const userData = userDoc.data()!;
        if (userData.status === "invited") {
          // They were invited but haven't accepted yet
          const clinicDoc = userData.clinicId
            ? await db.collection("clinics").doc(userData.clinicId).get()
            : null;
          const clinicDisplayName = clinicDoc?.data()?.name || "your clinic";
          return NextResponse.json(
            {
              error: `You've already been invited to ${clinicDisplayName}. Check your email for the invite link, or ask your clinic admin to resend it.`,
              code: "ALREADY_INVITED",
              clinicName: clinicDisplayName,
            },
            { status: 409 }
          );
        }
        // User exists and is active/registered — standard duplicate
        return NextResponse.json(
          {
            error: "An account with this email already exists. Please sign in instead.",
            code: "EMAIL_EXISTS",
          },
          { status: 409 }
        );
      }
      // User exists in Auth but no Firestore doc — orphaned auth user, proceed
      // (this can happen if a previous signup failed mid-way)
    } catch (lookupErr: unknown) {
      const code = (lookupErr as { code?: string }).code;
      if (code !== "auth/user-not-found") {
        // Unexpected error — log but don't block signup
        console.warn("[signup pre-flight] Unexpected error during email lookup:", lookupErr);
      }
      // auth/user-not-found is expected for new users — continue normally
    }

    // 1. Create Firebase Auth user
    try {
      const personName = firstName?.trim()
        ? `${firstName.trim()} ${(lastName || "").trim()}`.trim()
        : trimmedName;
      const userRecord = await auth.createUser({
        email: trimmedEmail,
        password,
        displayName: personName,
      });
      uid = userRecord.uid;
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === "auth/email-already-exists") {
        return NextResponse.json(
          { error: "An account with this email already exists. Please sign in instead." },
          { status: 409 }
        );
      }
      if (code === "auth/invalid-email") {
        return NextResponse.json(
          { error: "Invalid email address format." },
          { status: 400 }
        );
      }
      throw err;
    }

    // 2. Generate clinic ID and prepare docs
    const clinicRef = db.collection("clinics").doc();
    const clinicId = clinicRef.id;

    const defaultTargets: ClinicTargets = {
      followUpRate: 4.0,
      hepRate: 80,
      utilisationRate: 80,
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
      path: "self_serve",
      blockers: [],
      firstValueAt: null,
      activationAt: null,
      lastEventAt: now,
    };

    const defaultBrandConfig: BrandConfig = {};

    // Derive compliance config from country
    const jurisdiction = deriveJurisdictionFromCountry(country || "uk");
    const complianceConfig: ComplianceConfig = {
      jurisdiction,
      consentModel:
        jurisdiction === "uk"
          ? "gdpr_lawful_basis"
          : jurisdiction === "us"
          ? "hipaa_notice"
          : jurisdiction === "au"
          ? "app_explicit"
          : "pipeda_express",
      mfaRequired: jurisdiction === "us",
      baaRequired: jurisdiction === "us",
      baaSignedAt: null,
      dataRegion:
        jurisdiction === "uk"
          ? "europe-west2"
          : jurisdiction === "us"
          ? "us-central1"
          : jurisdiction === "au"
          ? "australia-southeast1"
          : "us-central1",
      privacyPolicyVersion: null,
      consentRecordedAt: null,
    };

    // 3. Create Stripe customer (non-blocking — clinic works without it)
    let stripeCustomerId: string | null = null;
    try {
      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (stripeKey) {
        const { getStripe } = await import("@/lib/stripe");
        const stripe = getStripe();
        const customer = await stripe.customers.create({
          email: trimmedEmail,
          name: trimmedName,
          metadata: { clinicId, source: "self_serve_signup" },
        });
        stripeCustomerId = customer.id;
        stripeCustomerIdForCleanup = customer.id;
      }
    } catch {
      // Stripe creation failed — continue without it; billing page will handle later
    }

    // 4. Write Firestore docs atomically
    const batch = db.batch();

    batch.set(db.collection("users").doc(uid!), {
      clinicId,
      role: "owner" as UserRole,
      firstName: (firstName as string)?.trim() || "",
      lastName: (lastName as string)?.trim() || "",
      email: trimmedEmail,
      status: "onboarding" as UserStatus,
      firstLogin: true,
      tourCompleted: false,
      createdAt: now,
      updatedAt: now,
      createdBy: "self_serve_signup",
      updatedBy: "self_serve_signup",
    });

    batch.set(clinicRef, {
      name: trimmedName,
      timezone: "Europe/London",
      ownerEmail: trimmedEmail,
      status: "onboarding" as ClinicStatus,
      pmsType: null,
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
      compliance: complianceConfig,
      profession: profession?.trim() || null,
      clinicSize: clinicSize?.trim() || null,
      commsConsentGrantedAt: now,
      trialStartedAt: now,
      trialModule: trialModule || "intelligence",
      trialTier: trialTier || "solo",
      createdAt: now,
      updatedAt: now,
    });

    await batch.commit();

    // Set custom claims so subsequent API calls skip the Firestore read
    await setCustomClaims(uid!, { clinicId, role: "owner" });

    // Fire server-side funnel event
    try {
      await db.collection("funnel_events").add({
        event: "signup_complete",
        clinicId,
        userId: uid!,
        metadata: { source: "self_serve_signup" },
        timestamp: now,
      });
    } catch {
      // Non-blocking
    }

    return NextResponse.json(
      { uid, clinicId, email: trimmedEmail },
      { status: 201 }
    );
  } catch (err) {
    console.error("[signup error]", err);
    if (uid) {
      try {
        await getAdminAuth().deleteUser(uid);
      } catch {
        console.error("[signup cleanup] Failed to delete orphaned auth user:", uid);
      }
    }
    if (stripeCustomerIdForCleanup) {
      try {
        const { getStripe } = await import("@/lib/stripe");
        await getStripe().customers.del(stripeCustomerIdForCleanup);
      } catch {
        console.error("[signup cleanup] Failed to delete orphaned Stripe customer:", stripeCustomerIdForCleanup);
      }
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export const POST = withRequestLog(handler);
