import * as admin from "firebase-admin";
import * as functionsV1 from "firebase-functions/v1";

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const REGION = "europe-west2";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PmsConfig {
  apiKey: string;
  baseUrl: string;
  pmsType: string;
}

// Inline decrypt — mirrors dashboard/src/lib/crypto/credentials.ts
// CREDENTIAL_MASTER_SECRET must be set in Firebase Functions config.
function decryptApiKey(encrypted: string, clinicId: string): string {
  const masterSecret = process.env.CREDENTIAL_MASTER_SECRET ?? "";
  if (!masterSecret) throw new Error("CREDENTIAL_MASTER_SECRET not set");
  const { createHmac, createDecipheriv } = require("crypto") as typeof import("crypto");
  const key = createHmac("sha256", masterSecret)
    .update(`strydeos:credentials:${clinicId}`)
    .digest();
  const blob = Buffer.from(encrypted, "base64");
  const prefixLen = Buffer.byteLength("enc:v1:", "utf8");
  const payload = blob.subarray(prefixLen);
  const iv = payload.subarray(0, 12);
  const authTag = payload.subarray(12, 28);
  const ciphertext = payload.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

function isEncryptedKey(value: string): boolean {
  try {
    const decoded = Buffer.from(value, "base64");
    return decoded.subarray(0, 7).toString("utf8") === "enc:v1:";
  } catch { return false; }
}

interface SyncState {
  lastPollAt: string | null;
  retryAfterUntil: string | null;
}

interface ClinikoAppointment {
  id: number | string;
  starts_at: string;
  ends_at: string;
  cancelled_at: string | null;
  updated_at: string;
  patient?: { links?: { self?: string } };
  practitioner?: { links?: { self?: string } };
  appointment_type?: { links?: { self?: string } };
}

interface ClinikoPageResponse {
  individual_appointments: ClinikoAppointment[];
  total_entries: number;
  links?: { next?: string };
}

interface FirestoreAppointment {
  pmsExternalId: string;
  pmsType: "cliniko";
  status: "cancelled" | "scheduled";
  startsAt: string;
  endsAt: string;
  patientId: string;
  practitionerId: string;
  appointmentTypeId: string;
  updatedAt: string;
  syncedAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractIdFromSelfLink(selfLink: string | undefined): string {
  if (!selfLink) return "";
  return selfLink.split("/").pop() ?? "";
}

function buildBasicAuthHeader(apiKey: string): string {
  const encoded = Buffer.from(`${apiKey}:`).toString("base64");
  return `Basic ${encoded}`;
}

function mapClinikoAppointment(apt: ClinikoAppointment): FirestoreAppointment {
  return {
    pmsExternalId: String(apt.id),
    pmsType: "cliniko",
    status: apt.cancelled_at ? "cancelled" : "scheduled",
    startsAt: apt.starts_at,
    endsAt: apt.ends_at,
    patientId: extractIdFromSelfLink(apt.patient?.links?.self),
    practitionerId: extractIdFromSelfLink(apt.practitioner?.links?.self),
    appointmentTypeId: extractIdFromSelfLink(apt.appointment_type?.links?.self),
    updatedAt: apt.updated_at,
    syncedAt: new Date().toISOString(),
  };
}

async function fetchAppointmentPage(
  url: string,
  authHeader: string
): Promise<ClinikoPageResponse> {
  const res = await fetch(url, {
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "StrydeOS/1.0",
    },
  });

  if (res.status === 429) {
    const error = new Error(`Cliniko rate limit: 429 Too Many Requests`);
    (error as NodeJS.ErrnoException).code = "RATE_LIMITED";
    throw error;
  }

  if (!res.ok) {
    throw new Error(`Cliniko API error: ${res.status} ${await res.text()}`);
  }

  return res.json() as Promise<ClinikoPageResponse>;
}

async function fetchAllAppointmentsSince(
  baseUrl: string,
  sinceIso: string,
  authHeader: string
): Promise<ClinikoAppointment[]> {
  const allAppointments: ClinikoAppointment[] = [];
  const normalizedBase = baseUrl.replace(/\/$/, "");
  // Cliniko uses q[]=field:>=value syntax (not Ransack q[field_gteq])
  let nextUrl: string | null =
    `${normalizedBase}/individual_appointments?${new URLSearchParams([["q[]", `updated_at:>=${sinceIso}`]])}&per_page=100`;

  while (nextUrl) {
    const page = await fetchAppointmentPage(nextUrl, authHeader);
    allAppointments.push(...page.individual_appointments);
    nextUrl = page.links?.next ?? null;
  }

  return allAppointments;
}

// ─── Pub/Sub triggered function ───────────────────────────────────────────────

export const clinikoPoll = functionsV1
  .region(REGION)
  .runWith({ timeoutSeconds: 120, memory: "256MB" })
  .pubsub.topic("cliniko-poll")
  .onPublish(async (message) => {
    const db = admin.firestore();

    let clinicId: string;
    try {
      const parsed = message.json as { clinicId?: string };
      clinicId = parsed.clinicId ?? "";
    } catch {
      console.error("[clinikoPoll] Failed to parse Pub/Sub message:", message.data);
      return;
    }

    if (!clinicId) {
      console.error("[clinikoPoll] Missing clinicId in message");
      return;
    }

    // Load PMS config
    const pmsConfigRef = db
      .collection("clinics")
      .doc(clinicId)
      .collection("integrations_config")
      .doc("pms");

    const pmsConfigSnap = await pmsConfigRef.get();
    if (!pmsConfigSnap.exists) {
      console.error(`[clinikoPoll] No PMS config for clinic ${clinicId}`);
      return;
    }

    const pmsConfig = pmsConfigSnap.data() as PmsConfig;

    if (pmsConfig.pmsType !== "cliniko") {
      console.log(
        `[clinikoPoll] Clinic ${clinicId} pmsType is '${pmsConfig.pmsType}', not 'cliniko' — skipping`
      );
      return;
    }

    if (!pmsConfig.apiKey) {
      console.error(`[clinikoPoll] No apiKey in PMS config for clinic ${clinicId}`);
      return;
    }

    // Decrypt API key if stored encrypted
    let resolvedApiKey = pmsConfig.apiKey;
    if (isEncryptedKey(resolvedApiKey)) {
      try {
        resolvedApiKey = decryptApiKey(resolvedApiKey, clinicId);
      } catch (err) {
        console.error(`[clinikoPoll] Failed to decrypt apiKey for clinic ${clinicId}:`, err);
        return;
      }
    }

    // Load sync state
    const syncStateRef = db
      .collection("clinics")
      .doc(clinicId)
      .collection("sync_state")
      .doc("cliniko");

    const syncStateSnap = await syncStateRef.get();
    const syncState: SyncState = syncStateSnap.exists
      ? (syncStateSnap.data() as SyncState)
      : { lastPollAt: null, retryAfterUntil: null };

    // Check rate-limit backoff
    const now = new Date();
    if (syncState.retryAfterUntil) {
      const retryAfter = new Date(syncState.retryAfterUntil);
      if (now < retryAfter) {
        console.log(
          `[clinikoPoll] Clinic ${clinicId} is rate-limited until ${syncState.retryAfterUntil} — skipping`
        );
        return;
      }
    }

    // Determine since timestamp — default to 24h ago for first poll
    const sinceIso =
      syncState.lastPollAt ??
      new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    const authHeader = buildBasicAuthHeader(resolvedApiKey);
    const baseUrl = pmsConfig.baseUrl || "https://api.uk1.cliniko.com/v1";

    let appointments: ClinikoAppointment[];
    try {
      appointments = await fetchAllAppointmentsSince(baseUrl, sinceIso, authHeader);
    } catch (err) {
      const error = err as NodeJS.ErrnoException & { code?: string };
      if (error.code === "RATE_LIMITED") {
        // Store a 60-second backoff window
        const retryAfterUntil = new Date(now.getTime() + 60 * 1000).toISOString();
        await syncStateRef.set(
          { retryAfterUntil },
          { merge: true }
        );
        console.warn(
          `[clinikoPoll] Rate limited for clinic ${clinicId}. Retry after ${retryAfterUntil}`
        );
        throw err;
      }
      console.error(`[clinikoPoll] Fetch failed for clinic ${clinicId}:`, err);
      throw err;
    }

    if (appointments.length === 0) {
      await syncStateRef.set(
        { lastPollAt: now.toISOString(), retryAfterUntil: null },
        { merge: true }
      );
      console.log(`[clinikoPoll] No new/updated appointments for clinic ${clinicId}`);
      return;
    }

    // Upsert appointments to Firestore in batches of 500
    const appointmentsCol = db
      .collection("clinics")
      .doc(clinicId)
      .collection("appointments");

    const BATCH_SIZE = 500;
    for (let i = 0; i < appointments.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const chunk = appointments.slice(i, i + BATCH_SIZE);

      for (const apt of chunk) {
        const mapped = mapClinikoAppointment(apt);
        const docRef = appointmentsCol.doc(mapped.pmsExternalId);
        batch.set(docRef, mapped, { merge: true });
      }

      await batch.commit();
    }

    // Update sync state
    await syncStateRef.set(
      { lastPollAt: now.toISOString(), retryAfterUntil: null },
      { merge: true }
    );

    console.log(
      `[clinikoPoll] Upserted ${appointments.length} appointments for clinic ${clinicId}`
    );
  }
);
