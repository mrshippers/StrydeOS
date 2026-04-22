import {
  collection,
  query,
  orderBy,
  where,
  onSnapshot,
  limit,
  addDoc,
  doc,
  updateDoc,
  type Unsubscribe,
  type QueryConstraint,
} from "firebase/firestore";
import { db } from "./firebase";
import type {
  WeeklyStats,
  Clinician,
  Patient,
  CallLog,
  Appointment,
  CommsLogEntry,
  Review,
  OutcomeScore,
} from "@/types";
import type { ValueEvent, ValueSummary, DeepMetrics } from "@/types/value-ledger";
import type { KpiDoc, KpiId, ComputeStateDoc } from "@/types/kpi";

function noopUnsubscribe(): Unsubscribe {
  return () => {};
}

function clinicCollection(clinicId: string, sub: string) {
  return collection(db!, "clinics", clinicId, sub);
}

// ─── Weekly Stats (subcollection) ────────────────────────────────────────────

export function subscribeWeeklyStats(
  clinicId: string | null,
  clinicianId: string,
  callback: (data: WeeklyStats[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  if (!db || !clinicId) {
    callback([]);
    return noopUnsubscribe();
  }

  const target = clinicianId === "all" ? "all" : clinicianId;
  const q = query(
    clinicCollection(clinicId, "metrics_weekly"),
    where("clinicianId", "==", target),
    orderBy("weekStart", "asc"),
    limit(104) // 2 years of weekly data
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<WeeklyStats, "id">),
      }));
      callback(data);
    },
    onError
  );
}

/**
 * Subscribe to weekly stats for multiple clinicians in a single Firestore listener.
 * Uses `where("clinicianId", "in", [...])` — Firestore supports up to 30 values.
 */
export function subscribeWeeklyStatsBatch(
  clinicId: string | null,
  clinicianIds: string[],
  callback: (grouped: Map<string, WeeklyStats[]>) => void,
  onError: (err: Error) => void
): Unsubscribe {
  if (!db || !clinicId || clinicianIds.length === 0) {
    callback(new Map());
    return noopUnsubscribe();
  }

  const q = query(
    clinicCollection(clinicId, "metrics_weekly"),
    where("clinicianId", "in", clinicianIds.slice(0, 30)),
    orderBy("weekStart", "asc")
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const grouped = new Map<string, WeeklyStats[]>();
      for (const d of snapshot.docs) {
        const stat = { id: d.id, ...(d.data() as Omit<WeeklyStats, "id">) };
        const arr = grouped.get(stat.clinicianId) ?? [];
        arr.push(stat);
        grouped.set(stat.clinicianId, arr);
      }
      callback(grouped);
    },
    onError
  );
}

// ─── Clinicians (subcollection) ──────────────────────────────────────────────

export function subscribeClinicians(
  clinicId: string | null,
  callback: (data: Clinician[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  if (!db || !clinicId) {
    callback([]);
    return noopUnsubscribe();
  }

  const q = query(
    clinicCollection(clinicId, "clinicians"),
    where("active", "==", true),
    orderBy("name", "asc")
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<Clinician, "id">),
      }));
      callback(data);
    },
    onError
  );
}

// ─── Patients (subcollection) ────────────────────────────────────────────────

export function subscribePatients(
  clinicId: string | null,
  clinicianId: string | null,
  callback: (data: Patient[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  if (!db || !clinicId) {
    callback([]);
    return noopUnsubscribe();
  }

  const constraints: QueryConstraint[] = [];
  if (clinicianId) {
    constraints.push(where("clinicianId", "==", clinicianId));
  }
  constraints.push(limit(500));

  const q = query(clinicCollection(clinicId, "patients"), ...constraints);

  return onSnapshot(
    q,
    (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<Patient, "id">),
      }));
      callback(data);
    },
    onError
  );
}

// ─── Update Patient (subcollection) ─────────────────────────────────────────

export async function updatePatient(
  clinicId: string,
  patientId: string,
  data: Partial<Omit<Patient, "id">>
): Promise<void> {
  if (!db) throw new Error("Firestore not initialised");
  const ref = doc(db, "clinics", clinicId, "patients", patientId);
  await updateDoc(ref, { ...data, updatedAt: new Date().toISOString() });
}

// ─── Appointments (subcollection) ────────────────────────────────────────────

export function subscribeAppointments(
  clinicId: string | null,
  clinicianId: string | null,
  dateFrom: string,
  callback: (data: Appointment[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  if (!db || !clinicId) {
    callback([]);
    return noopUnsubscribe();
  }

  const constraints: QueryConstraint[] = [
    where("dateTime", ">=", dateFrom),
    orderBy("dateTime", "desc"),
    limit(500),
  ];
  if (clinicianId && clinicianId !== "all") {
    constraints.push(where("clinicianId", "==", clinicianId));
  }

  const q = query(
    clinicCollection(clinicId, "appointments"),
    ...constraints
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<Appointment, "id">),
      }));
      callback(data);
    },
    onError
  );
}

// ─── Outcome Scores (subcollection) ──────────────────────────────────────────

export function subscribeOutcomeScores(
  clinicId: string | null,
  patientId: string,
  callback: (data: OutcomeScore[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  if (!db || !clinicId) {
    callback([]);
    return noopUnsubscribe();
  }

  const q = query(
    clinicCollection(clinicId, "outcome_scores"),
    where("patientId", "==", patientId),
    orderBy("recordedAt", "asc")
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<OutcomeScore, "id">),
      }));
      callback(data);
    },
    onError
  );
}

// ─── Comms Log (subcollection) ───────────────────────────────────────────────

export function subscribeCommsLog(
  clinicId: string | null,
  callback: (data: CommsLogEntry[]) => void,
  onError: (err: Error) => void,
  /** When set, only returns comms for patients assigned to this clinician. */
  clinicianId?: string | null
): Unsubscribe {
  if (!db || !clinicId) {
    callback([]);
    return noopUnsubscribe();
  }

  const constraints: QueryConstraint[] = [
    orderBy("sentAt", "desc"),
    limit(100),
  ];
  if (clinicianId) {
    constraints.push(where("clinicianId", "==", clinicianId));
  }

  const q = query(
    clinicCollection(clinicId, "comms_log"),
    ...constraints
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<CommsLogEntry, "id">),
      }));
      callback(data);
    },
    onError
  );
}

// ─── Reviews (subcollection) ─────────────────────────────────────────────────

export function subscribeReviews(
  clinicId: string | null,
  callback: (data: Review[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  if (!db || !clinicId) {
    callback([]);
    return noopUnsubscribe();
  }

  const q = query(
    clinicCollection(clinicId, "reviews"),
    orderBy("date", "desc"),
    limit(50)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<Review, "id">),
      }));
      callback(data);
    },
    onError
  );
}

// ─── Outcome Scores — All (subcollection, clinic-wide) ───────────────────────

export function subscribeOutcomeScoresAll(
  clinicId: string | null,
  callback: (data: OutcomeScore[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  if (!db || !clinicId) {
    callback([]);
    return noopUnsubscribe();
  }

  const q = query(
    clinicCollection(clinicId, "outcome_scores"),
    orderBy("recordedAt", "desc"),
    limit(500)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<OutcomeScore, "id">),
      }));
      callback(data);
    },
    onError
  );
}

// ─── Record Outcome Scores (write) ───────────────────────────────────────────

export async function recordOutcomeScores(
  clinicId: string,
  entries: Omit<OutcomeScore, "id">[]
): Promise<void> {
  if (!db) throw new Error("Firestore not initialised");
  const col = clinicCollection(clinicId, "outcome_scores");
  await Promise.all(
    entries.map((entry) =>
      addDoc(col, { ...entry, recordedAt: entry.recordedAt || new Date().toISOString() })
    )
  );
}

// ─── Insight Events (subcollection) ──────────────────────────────────────────

export function subscribeInsightEvents(
  clinicId: string | null,
  callback: (data: import("@/types/insight-events").InsightEvent[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  if (!db || !clinicId) {
    callback([]);
    return noopUnsubscribe();
  }

  const q = query(
    clinicCollection(clinicId, "insight_events"),
    orderBy("createdAt", "desc"),
    limit(50)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<import("@/types/insight-events").InsightEvent, "id">),
      }));
      callback(data);
    },
    onError
  );
}

// ─── Events Actioned by Pulse (coupling tile — 7d window) ───────────────────

/**
 * Subscribe to `/clinics/{clinicId}/events` filtered to events that Pulse has
 * consumed (`consumedBy` contains `'pulse'`) within the last 7 days. Used by
 * the Intelligence dashboard tile to show cross-module activity. Read-only.
 *
 * Note: reads the NEW events collection written by `computeKPIs()` — not the
 * older `insight_events` collection. Event shape: `{ type, kpiId, severity,
 * createdAt, consumedBy[], ... }` with `createdAt` as ISO string.
 */
export function subscribeEventsActionedByPulse(
  clinicId: string | null,
  callback: (events: Array<{ id: string; createdAt: string; consumedBy: string[] }>) => void,
  onError: (err: Error) => void
): Unsubscribe {
  if (!db || !clinicId) {
    callback([]);
    return noopUnsubscribe();
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const q = query(
    clinicCollection(clinicId, "events"),
    where("consumedBy", "array-contains", "pulse"),
    where("createdAt", ">=", sevenDaysAgo),
    orderBy("createdAt", "desc"),
    limit(500)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const data = snapshot.docs.map((d) => {
        const raw = d.data() as { createdAt?: string; consumedBy?: string[] };
        return {
          id: d.id,
          createdAt: raw.createdAt ?? "",
          consumedBy: raw.consumedBy ?? [],
        };
      });
      callback(data);
    },
    onError
  );
}

// ─── Call Logs (subcollection) ───────────────────────────────────────────────

export function subscribeCalls(
  clinicId: string | null,
  callback: (data: CallLog[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  if (!db || !clinicId) {
    callback([]);
    return noopUnsubscribe();
  }

  const q = query(
    clinicCollection(clinicId, "calls"),
    orderBy("timestamp", "desc"),
    limit(50)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<CallLog, "id">),
      }));
      callback(data);
    },
    onError
  );
}

// ─── Value Events (subcollection) ──────────────────────────────────────────

export function subscribeValueEvents(
  clinicId: string | null,
  callback: (data: ValueEvent[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  if (!db || !clinicId) {
    callback([]);
    return noopUnsubscribe();
  }

  const q = query(
    clinicCollection(clinicId, "value_events"),
    orderBy("attributedAt", "desc"),
    limit(100)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const data = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<ValueEvent, "id">),
      }));
      callback(data);
    },
    onError
  );
}

// ─── Value Summary (document) ─────────────────────────────────────────────

export function subscribeValueSummary(
  clinicId: string | null,
  periodKey: string,
  callback: (data: ValueSummary | null) => void,
  onError: (err: Error) => void
): Unsubscribe {
  if (!db || !clinicId) {
    callback(null);
    return noopUnsubscribe();
  }

  const ref = doc(db, "clinics", clinicId, "value_summaries", periodKey);

  return onSnapshot(
    ref,
    (snapshot) => {
      if (!snapshot.exists()) {
        callback(null);
        return;
      }
      callback({ id: snapshot.id, ...snapshot.data() } as ValueSummary);
    },
    onError
  );
}

// ─── Deep Metrics (subcollection) ─────────────────────────────────────────

export function subscribeDeepMetrics(
  clinicId: string | null,
  clinicianId: string,
  callback: (data: DeepMetrics[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  if (!db || !clinicId) {
    callback([]);
    return noopUnsubscribe();
  }

  const target = clinicianId === "all" ? "all" : clinicianId;
  const q = query(
    clinicCollection(clinicId, "deep_metrics"),
    where("clinicianId", "==", target),
    orderBy("weekStart", "desc"),
    limit(16)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const data = snapshot.docs.map((d) => ({
        ...(d.data() as DeepMetrics),
      }));
      callback(data);
    },
    onError
  );
}

// ─── KPI Projections (new — layer on top of metrics_weekly) ───────────────

/**
 * Subscribe to the `kpis/*` projection collection written by `computeKPIs()`
 * on every pipeline run. This is a read-optimised view — the canonical
 * numbers still live in `metrics_weekly`.
 */
export function subscribeKPIs(
  clinicId: string | null,
  callback: (kpis: Record<string, KpiDoc>) => void,
  onError: (err: Error) => void
): Unsubscribe {
  if (!db || !clinicId) {
    callback({});
    return noopUnsubscribe();
  }

  return onSnapshot(
    clinicCollection(clinicId, "kpis"),
    (snapshot) => {
      const map: Record<string, KpiDoc> = {};
      for (const d of snapshot.docs) {
        map[d.id] = d.data() as KpiDoc;
      }
      callback(map);
    },
    onError
  );
}

/**
 * Subscribe to the pipeline's `computeState` document for operator visibility
 * into the last run, data-quality issues, and any captured errors.
 */
export function subscribeComputeState(
  clinicId: string | null,
  callback: (state: ComputeStateDoc | null) => void,
  onError: (err: Error) => void
): Unsubscribe {
  if (!db || !clinicId) {
    callback(null);
    return noopUnsubscribe();
  }

  const ref = doc(db, "clinics", clinicId, "computeState", "current");
  return onSnapshot(
    ref,
    (snapshot) => {
      if (!snapshot.exists()) {
        callback(null);
        return;
      }
      callback(snapshot.data() as ComputeStateDoc);
    },
    onError
  );
}

// ─── Google Reviews summary (integrations_config/google_reviews) ───────────

export interface GoogleReviewsSummary {
  totalReviews: number;
  avgRating: number;
  displayName?: string;
  lastSyncedAt?: string;
}

/**
 * Subscribes to the Google Reviews aggregate summary persisted by the
 * sync-reviews pipeline stage. Exposes the authoritative userRatingCount +
 * rating for the clinic's Google Business Profile — the Places API only ever
 * returns 5 review bodies per request, so this summary is how we surface the
 * "real" total (e.g. Spires = 147) in the Intelligence UI.
 */
export function subscribeGoogleReviewsSummary(
  clinicId: string | null,
  callback: (summary: GoogleReviewsSummary | null) => void,
  onError: (err: Error) => void
): Unsubscribe {
  if (!db || !clinicId) {
    callback(null);
    return noopUnsubscribe();
  }

  const ref = doc(db, "clinics", clinicId, "integrations_config", "google_reviews");
  return onSnapshot(
    ref,
    (snapshot) => {
      if (!snapshot.exists()) {
        callback(null);
        return;
      }
      const data = snapshot.data() as { summary?: GoogleReviewsSummary };
      callback(data.summary ?? null);
    },
    onError
  );
}

// Re-export KpiId so consumers don't need a separate import path.
export type { KpiId };
