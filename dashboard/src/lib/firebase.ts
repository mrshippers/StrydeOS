import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getAuth, type Auth } from "firebase/auth";
import { getFunctions, type Functions } from "firebase/functions";

const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const isPlaceholder =
  !apiKey ||
  !projectId ||
  apiKey === "your_api_key" ||
  projectId === "your_project_id";

export const isFirebaseConfigured = !isPlaceholder;

let app: FirebaseApp | null = null;
let _db: Firestore | null = null;
let _auth: Auth | null = null;
let _functions: Functions | null = null;

if (isFirebaseConfigured) {
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
  app = getApps().length ? (getApps()[0] as FirebaseApp) : initializeApp(config);
  _db = getFirestore(app);
}

export const db = _db;

export function getFirebaseAuth(): Auth | null {
  if (!isFirebaseConfigured || !app) return null;
  if (!_auth) {
    _auth = getAuth(app);
  }
  return _auth;
}

export function getFirebaseFunctions(): Functions | null {
  if (!isFirebaseConfigured || !app) return null;
  if (!_functions) {
    _functions = getFunctions(app, "europe-west2");
  }
  return _functions;
}
