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

  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  // 1. Env vars
  if (projectId && clientEmail && privateKey) {
    const serviceAccount: ServiceAccount = { projectId, clientEmail, privateKey };
    _app = initializeApp({ credential: cert(serviceAccount) });
    return _app;
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

/**
 * Set custom claims on a Firebase Auth user token.
 * These claims are embedded in the JWT and available via decoded token
 * without a Firestore read — the primary perf + security win.
 *
 * Call this whenever clinicId, role, or clinicianId changes.
 */
export async function setUserClaims(
  uid: string,
  claims: { clinicId: string; role: string; clinicianId?: string }
): Promise<void> {
  await getAdminAuth().setCustomUserClaims(uid, {
    clinicId: claims.clinicId,
    role: claims.role,
    ...(claims.clinicianId ? { clinicianId: claims.clinicianId } : {}),
  });
}
