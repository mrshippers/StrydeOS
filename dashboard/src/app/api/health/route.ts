import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { verifyCronRequest, verifyApiRequest, handleApiError } from "@/lib/auth-guard";
import { withRequestLog } from "@/lib/request-logger";

async function handler(request: NextRequest) {
  // Gate: cron secret OR authenticated superadmin
  try {
    verifyCronRequest(request);
  } catch {
    try {
      const user = await verifyApiRequest(request);
      if (user.role !== "superadmin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } catch (e) {
      return handleApiError(e);
    }
  }

  const checks: Record<string, string> = {};

  // 1. Check env vars exist — no values or metadata leaked
  checks.FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID ? "set" : "MISSING";
  checks.FIREBASE_CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL ? "set" : "MISSING";
  checks.FIREBASE_PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY ? "set" : "MISSING";
  checks.SESSION_SECRET = process.env.SESSION_SECRET ? "set" : "MISSING";

  // 2. Try Firebase Admin init
  try {
    getAdminAuth();
    checks.firebaseAdminAuth = "OK";
  } catch {
    checks.firebaseAdminAuth = "FAIL";
  }

  // 3. Try Firestore connection
  try {
    const db = getAdminDb();
    await db.collection("clinics").limit(1).get();
    checks.firestoreRead = "OK";
  } catch {
    checks.firestoreRead = "FAIL";
  }

  const allOk = !Object.values(checks).some((v) => v === "FAIL" || v === "MISSING");

  return NextResponse.json({ status: allOk ? "healthy" : "unhealthy", checks });
}

export const GET = withRequestLog(handler);
