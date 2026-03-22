import {
  collection,
  query,
  orderBy,
  where,
  onSnapshot,
  limit,
  addDoc,
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
    orderBy("weekStart", "asc")
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
  onError: (err: Error) => void
): Unsubscribe {
  if (!db || !clinicId) {
    callback([]);
    return noopUnsubscribe();
  }

  const q = query(
    clinicCollection(clinicId, "comms_log"),
    orderBy("sentAt", "desc"),
    limit(100)
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
    orderBy("recordedAt", "asc"),
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
