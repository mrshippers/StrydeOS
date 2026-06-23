import * as admin from "firebase-admin";
import * as functionsV1 from "firebase-functions/v1";

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const REGION = "europe-west2";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SimilarityRequestPayload {
  clinicId: string;
  patientId: string;
  limit?: number;
}

interface FeatureVector {
  appointmentTypeCounts: Record<string, number>;
  totalVisits: number;
  recentVisit: boolean;
}

interface SimilarPatient {
  patientId: string;
  score: number;
}

interface AppointmentDoc {
  patientId?: string;
  // Canonical shape (written by cliniko-poll + pipeline). appointmentTypeId is
  // still carried by the poll for the cohort vector; dateTime is the canonical
  // start-time field (formerly startsAt).
  appointmentTypeId?: string;
  appointmentType?: string;
  dateTime?: string;
  status?: string;
}

// ─── Cosine similarity ────────────────────────────────────────────────────────

function dot(a: Record<string, number>, b: Record<string, number>): number {
  let sum = 0;
  for (const key of Object.keys(a)) {
    if (b[key] !== undefined) sum += a[key] * b[key];
  }
  return sum;
}

function magnitude(v: Record<string, number>): number {
  let sum = 0;
  for (const val of Object.values(v)) sum += val * val;
  return Math.sqrt(sum);
}

function cosineSimilarity(
  a: Record<string, number>,
  b: Record<string, number>
): number {
  const magA = magnitude(a);
  const magB = magnitude(b);
  if (magA === 0 || magB === 0) return 0;
  return dot(a, b) / (magA * magB);
}

// ─── Feature vector builder ───────────────────────────────────────────────────

function buildFeatureVector(
  appointments: AppointmentDoc[],
  nowMs: number
): FeatureVector {
  const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
  const appointmentTypeCounts: Record<string, number> = {};
  let recentVisit = false;

  for (const apt of appointments) {
    // Prefer the raw Cliniko type id (most granular); fall back to the
    // canonical enum, then "unknown".
    const typeKey = apt.appointmentTypeId ?? apt.appointmentType ?? "unknown";
    appointmentTypeCounts[typeKey] = (appointmentTypeCounts[typeKey] ?? 0) + 1;

    if (apt.dateTime) {
      const startsMs = new Date(apt.dateTime).getTime();
      if (nowMs - startsMs <= ninetyDaysMs) recentVisit = true;
    }
  }

  return {
    appointmentTypeCounts,
    totalVisits: appointments.length,
    recentVisit,
  };
}

// ─── Pub/Sub triggered function ───────────────────────────────────────────────

export const patientSimilarity = functionsV1
  .region(REGION)
  .runWith({ timeoutSeconds: 120, memory: "512MB" })
  .pubsub.topic("patient-similarity-request")
  .onPublish(async (message) => {
    const db = admin.firestore();

    let clinicId: string;
    let patientId: string;
    let limit: number;

    try {
      const parsed = message.json as SimilarityRequestPayload;
      clinicId = parsed.clinicId ?? "";
      patientId = parsed.patientId ?? "";
      limit = parsed.limit ?? 5;
    } catch {
      console.error("[patientSimilarity] Failed to parse Pub/Sub message:", message.data);
      return;
    }

    if (!clinicId || !patientId) {
      console.error("[patientSimilarity] Missing clinicId or patientId in message");
      return;
    }

    console.log(
      `[patientSimilarity] Computing similarity for patient ${patientId} in clinic ${clinicId}`
    );

    // Fetch up to 500 appointments for the clinic
    const appointmentsSnap = await db
      .collection("clinics")
      .doc(clinicId)
      .collection("appointments")
      .limit(500)
      .get();

    const nowMs = Date.now();

    // Group appointments by patientId
    const byPatient = new Map<string, AppointmentDoc[]>();
    for (const doc of appointmentsSnap.docs) {
      const data = doc.data() as AppointmentDoc;
      const pid = data.patientId ?? "";
      if (!pid) continue;
      if (!byPatient.has(pid)) byPatient.set(pid, []);
      byPatient.get(pid)!.push(data);
    }

    const resultRef = db
      .collection("clinics")
      .doc(clinicId)
      .collection("patient_similarity")
      .doc(patientId);

    // No appointments for the reference patient — write empty result
    const refAppointments = byPatient.get(patientId);
    if (!refAppointments || refAppointments.length === 0) {
      await resultRef.set({
        similarPatients: [],
        computedAt: new Date().toISOString(),
      });
      console.log(
        `[patientSimilarity] Patient ${patientId} has no appointments — wrote empty result`
      );
      return;
    }

    const refVector = buildFeatureVector(refAppointments, nowMs);

    // Score all other patients
    const scores: SimilarPatient[] = [];
    for (const [pid, apts] of byPatient.entries()) {
      if (pid === patientId) continue;
      const vec = buildFeatureVector(apts, nowMs);
      const score = cosineSimilarity(
        refVector.appointmentTypeCounts,
        vec.appointmentTypeCounts
      );
      scores.push({ patientId: pid, score });
    }

    // Sort descending, take top-N
    scores.sort((a, b) => b.score - a.score);
    const topN = scores.slice(0, limit);

    await resultRef.set({
      similarPatients: topN,
      computedAt: new Date().toISOString(),
    });

    console.log(
      `[patientSimilarity] Wrote ${topN.length} similar patients for patient ${patientId} in clinic ${clinicId}`
    );
  });
