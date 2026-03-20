/**
 * POST /api/clinic/signup
 *
 * Atomic self-serve signup: creates Firebase Auth user, Firestore user doc,
 * Firestore clinic doc (with trial + onboardingV2), and a Stripe customer.
 * Idempotent — if the Firebase Auth user already exists, returns 409.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminAuth, setUserClaims } from "@/lib/firebase-admin";
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

export async function POST(request: NextRequest) {
  let uid: string | undefined;
  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { clinicName, email, password, profession, clinicSize, country } = body as {
      clinicName?: string;
      email?: string;
      password?: string;
      profession?: string;
      clinicSize?: string;
      country?: string;
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

    // 1. Create Firebase Auth user
    try {
      const userRecord = await auth.createUser({
        email: trimmedEmail,
        password,
        displayName: trimmedName,
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
      }
    } catch {
      // Stripe creation failed — continue without it; billing page will handle later
    }

    // 4. Write Firestore docs atomically
    const batch = db.batch();

    batch.set(db.collection("users").doc(uid!), {
      clinicId,
      role: "owner" as UserRole,
      firstName: "",
      lastName: "",
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
      trialStartedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    await batch.commit();

    // Set custom claims so subsequent API calls skip the Firestore read
    await setUserClaims(uid!, { clinicId, role: "owner" });

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
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
