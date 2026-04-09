import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { verifyCronRequest, verifyApiRequest, handleApiError } from "@/lib/auth-guard";
import { withRequestLog } from "@/lib/request-logger";

interface HealthResponse {
  status: "ok" | "degraded" | "error";
  checks: Record<string, string>;
  timestamp: string;
}

async function handler(request: NextRequest): Promise<NextResponse<HealthResponse>> {
  // Gate: cron secret OR authenticated superadmin
  try {
    verifyCronRequest(request);
  } catch {
    try {
      const user = await verifyApiRequest(request);
      if (user.role !== "superadmin") {
        return NextResponse.json(
          {
            status: "error",
            checks: { auth: "FORBIDDEN" },
            timestamp: new Date().toISOString(),
          },
          { status: 403 }
        );
      }
    } catch (e) {
      return NextResponse.json(
        {
          status: "error",
          checks: { auth: "FAILED" },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }
  }

  const checks: Record<string, string> = {};
  const timestamp = new Date().toISOString();

  // 1. Check required env vars exist (no values or metadata leaked)
  checks.FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID ? "OK" : "MISSING";
  checks.FIREBASE_CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL ? "OK" : "MISSING";
  checks.FIREBASE_PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY ? "OK" : "MISSING";
  checks.SESSION_SECRET = process.env.SESSION_SECRET ? "OK" : "MISSING";
  checks.RESEND_API_KEY = process.env.RESEND_API_KEY ? "OK" : "MISSING";
  checks.TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID ? "OK" : "MISSING";
  checks.TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN ? "OK" : "MISSING";
  checks.N8N_COMMS_WEBHOOK_SECRET = process.env.N8N_COMMS_WEBHOOK_SECRET ? "OK" : "MISSING";

  // 2. Try Firebase Admin Auth
  try {
    getAdminAuth();
    checks.firebaseAdminAuth = "OK";
  } catch (err) {
    checks.firebaseAdminAuth = `FAIL: ${err instanceof Error ? err.message : "Unknown error"}`;
  }

  // 3. Try Firestore connection
  try {
    const db = getAdminDb();
    await db.collection("clinics").limit(1).get();
    checks.firestoreRead = "OK";
  } catch (err) {
    checks.firestoreRead = `FAIL: ${err instanceof Error ? err.message : "Unknown error"}`;
  }

  // 4. Check Redis (Upstash) if configured
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (upstashUrl && upstashToken) {
    try {
      const response = await fetch(`${upstashUrl}/ping`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${upstashToken}`,
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        checks.redisUpstash = "OK";
      } else {
        checks.redisUpstash = `FAIL: HTTP ${response.status}`;
      }
    } catch (err) {
      checks.redisUpstash = `FAIL: ${err instanceof Error ? err.message : "Connection error"}`;
    }
  } else {
    checks.redisUpstash = "NOT_CONFIGURED";
  }

  // 5. Check Stripe API key validity (basic check: key exists and has correct prefix)
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (stripeKey) {
    if (stripeKey.startsWith("sk_live_") || stripeKey.startsWith("sk_test_")) {
      checks.stripeApiKey = "OK";
    } else {
      checks.stripeApiKey = "FAIL: Invalid key format";
    }
  } else {
    checks.stripeApiKey = "MISSING";
  }

  // Determine overall status
  const hasMissing = Object.values(checks).some((v) => v === "MISSING");
  const hasFail = Object.values(checks).some((v) => v.startsWith("FAIL"));

  let status: "ok" | "degraded" | "error" = "ok";
  if (hasFail && hasMissing) {
    status = "error";
  } else if (hasFail || hasMissing) {
    status = "degraded";
  }

  return NextResponse.json({ status, checks, timestamp });
}

export const GET = withRequestLog(handler);
