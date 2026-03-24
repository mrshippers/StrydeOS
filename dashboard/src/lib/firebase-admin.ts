import {
  initializeApp,
  getApps,
  cert,
  applicationDefault,
  type App,
  type ServiceAccount,
} from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getAuth, type Auth } from "firebase-admin/auth";
import * as fs from "fs";
import * as path from "path";

let _app: App | null = null;
let _adminDb: Firestore | null = null;
let _adminAuth: Auth | null = null;

function getAdminApp(): App {
  if (_app) return _app;

  const existing = getApps();
  if (existing.length > 0) {
    _app = existing[0];
    return _app;
  }

  // .trim() guards against trailing newlines pasted into Vercel env var UI
  const projectId = (
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  )?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const rawKey = process.env.FIREBASE_PRIVATE_KEY;

  // CI / next build: no real credentials available. Return a stub app so the
  // build completes (API routes are never called during page data collection).
  const isBuild = process.env.CI === "true" || process.env.NEXT_PHASE === "phase-production-build";
  if (isBuild && (!clientEmail || !rawKey)) {
    console.warn("[firebase-admin] CI/build detected without credentials — using stub app");
    _app = initializeApp({ projectId: projectId || "ci-placeholder" });
    return _app;
  }
  // Handle all common Vercel private key formats:
  // - JSON-encoded with literal \n  → replace \\n with real newlines
  // - Double-escaped \\n            → same regex catches it
  // - Already contains real newlines → no-op (replace finds nothing)
  const privateKey = rawKey?.replace(/\\n/g, "\n").trim();

  // 1. Env vars
  if (projectId && clientEmail && privateKey) {
    try {
      const serviceAccount: ServiceAccount = { projectId, clientEmail, privateKey };
      _app = initializeApp({ credential: cert(serviceAccount) });
      return _app;
    } catch (err) {
      console.error(
        "[firebase-admin] Failed to initialize with env credentials:",
        err instanceof Error ? err.message : err
      );
      console.error("[firebase-admin] FIREBASE_PROJECT_ID:", projectId);
      console.error("[firebase-admin] FIREBASE_CLIENT_EMAIL:", clientEmail ? `${clientEmail.slice(0, 12)}...` : "MISSING");
      console.error("[firebase-admin] FIREBASE_PRIVATE_KEY length:", rawKey?.length ?? 0);
      throw err;
    }
  }

  // 2. Service account key file
  const keyPath =
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    path.join(process.cwd(), "scripts", "serviceAccountKey.json");

  if (fs.existsSync(keyPath)) {
    try {
      const key = JSON.parse(fs.readFileSync(keyPath, "utf-8"));
      _app = initializeApp({ credential: cert(key) });
      return _app;
    } catch {
      // fall through
    }
  }

  // 3. Application Default Credentials (gcloud auth application-default login)
  const adcPath = path.join(
    process.env.HOME || process.env.USERPROFILE || "",
    ".config", "gcloud", "application_default_credentials.json"
  );
  if (fs.existsSync(adcPath) && projectId) {
    try {
      _app = initializeApp({
        credential: applicationDefault(),
        projectId,
      });
      return _app;
    } catch {
      // fall through
    }
  }

  throw new Error(
    "Missing Firebase Admin credentials. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY in .env.local, " +
    "or place a service account key at scripts/serviceAccountKey.json, " +
    "or run gcloud auth application-default login."
  );
}

export function getAdminDb(): Firestore {
  if (!_adminDb) {
    _adminDb = getFirestore(getAdminApp());
  }
  return _adminDb;
}

export function getAdminAuth(): Auth {
  if (!_adminAuth) {
    _adminAuth = getAuth(getAdminApp());
  }
  return _adminAuth;
}
