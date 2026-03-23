import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

export async function GET() {
  const checks: Record<string, string> = {};

  // 1. Check env vars exist
  checks.FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID ? "set" : "MISSING";
  checks.FIREBASE_CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL
    ? `set (${process.env.FIREBASE_CLIENT_EMAIL.slice(0, 20)}...)`
    : "MISSING";
  checks.FIREBASE_PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY
    ? `set (${process.env.FIREBASE_PRIVATE_KEY.length} chars, starts: ${process.env.FIREBASE_PRIVATE_KEY.slice(0, 30)})`
    : "MISSING";
  checks.SESSION_SECRET = process.env.SESSION_SECRET ? "set" : "MISSING";

  // 2. Try Firebase Admin init
  try {
    getAdminAuth();
    checks.firebaseAdminAuth = "OK";
  } catch (err) {
    checks.firebaseAdminAuth = `FAIL: ${err instanceof Error ? err.message : String(err)}`;
  }

  // 3. Try Firestore connection
  try {
    const db = getAdminDb();
    const snap = await db.collection("clinics").limit(1).get();
    checks.firestoreRead = `OK (${snap.size} doc(s))`;
  } catch (err) {
    checks.firestoreRead = `FAIL: ${err instanceof Error ? err.message : String(err)}`;
  }

  const allOk = !Object.values(checks).some((v) => v.startsWith("FAIL") || v === "MISSING");

  return NextResponse.json({ status: allOk ? "healthy" : "unhealthy", checks });
}
