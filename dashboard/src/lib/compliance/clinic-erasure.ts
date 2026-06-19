import * as Sentry from "@sentry/nextjs";
import { getAdminAuth } from "@/lib/firebase-admin";

/**
 * Clinic-termination full-erasure engine (GDPR Art. 17 — controller-level
 * erasure / account closure).
 *
 * A clinic is scheduled for erasure by setting `terminationScheduledAt` on the
 * clinic doc (see POST /api/admin/clinics/[id]/terminate). The weekly
 * data-health cron calls `executeClinicTerminationErasures`, which erases every
 * clinic whose grace period has elapsed:
 *
 *   1. Every subcollection under the clinic doc (enumerated dynamically via
 *      `listCollections()` so no collection can be silently missed).
 *   2. Clinic-scoped top-level docs (`users`, `funnel_events`) filtered by
 *      `clinicId` equality.
 *   3. The clinic's Firebase Auth user accounts (best-effort bulk delete).
 *   4. The clinic doc itself.
 *
 * A PII-free tombstone is written to the retained top-level `_erasure_log`
 * collection as proof the erasure happened — the clinic's own `audit_logs` are
 * gone by then, so the evidence must live outside the clinic.
 *
 * Safety: the trigger query matches ONLY docs that carry `terminationScheduledAt`
 * (a field absent on every normal clinic), and each candidate is re-checked for
 * `status === "churned"` before any delete. Nothing fires by accident.
 */

const BATCH_LIMIT = 500;
const AUTH_DELETE_CHUNK = 1000; // firebase-admin deleteUsers() hard cap

/** Top-level collections that store clinic-scoped docs keyed by a `clinicId` field. */
const TOP_LEVEL_CLINIC_SCOPED = ["users", "funnel_events"] as const;

export interface ClinicErasureResult {
  /** Clinics fully erased this run. */
  erased: number;
  /** Total Firestore docs deleted across all erased clinics. */
  docsDeleted: number;
  /** Firebase Auth accounts deleted across all erased clinics. */
  authUsersDeleted: number;
  /** Clinics that matched the schedule but were skipped (e.g. status guard). */
  skipped: string[];
  errors: string[];
}

type Db = FirebaseFirestore.Firestore;
type QuerySnapshot = FirebaseFirestore.QuerySnapshot;
type Query = FirebaseFirestore.Query;
type ClinicDoc = FirebaseFirestore.QueryDocumentSnapshot;

/** Page through a query/collection and hard-delete every matching doc. */
async function purgeQuery(db: Db, baseQuery: Query): Promise<number> {
  let deleted = 0;
  for (;;) {
    const snap: QuerySnapshot = await baseQuery.limit(BATCH_LIMIT).get();
    if (snap.empty) break;

    const batch = db.batch();
    for (const doc of snap.docs) batch.delete(doc.ref);
    await batch.commit();

    deleted += snap.size;
    if (snap.size < BATCH_LIMIT) break;
  }
  return deleted;
}

/**
 * Erase a single clinic's entire data footprint. Returns the counts so the
 * caller can aggregate and tombstone. Throws on a fatal error (caller catches
 * per-clinic so one failure doesn't abort the whole run).
 */
export async function eraseClinicData(
  db: Db,
  clinicDoc: ClinicDoc
): Promise<{ docsDeleted: number; authUsersDeleted: number; subcollections: string[] }> {
  const clinicId = clinicDoc.id;
  let docsDeleted = 0;

  // 1. Every subcollection under the clinic doc — enumerated dynamically so a
  //    newly-added collection can never survive erasure. (One level deep:
  //    the data model stores clinic-scoped rows as direct subcollections keyed
  //    by patientId, not nested under patient docs.)
  const subcollections = await clinicDoc.ref.listCollections();
  const subcollectionIds: string[] = [];
  for (const col of subcollections) {
    subcollectionIds.push(col.id);
    docsDeleted += await purgeQuery(db, col);
  }

  // 2. Clinic-scoped top-level docs + collect Auth UIDs from `users`.
  const authUids: string[] = [];
  for (const collection of TOP_LEVEL_CLINIC_SCOPED) {
    const baseQuery = db.collection(collection).where("clinicId", "==", clinicId);
    if (collection === "users") {
      // Collect uids (doc id) before deleting so we can remove the Auth accounts.
      let hasMore = true;
      while (hasMore) {
        const snap = await baseQuery.limit(BATCH_LIMIT).get();
        if (snap.empty) break;
        const batch = db.batch();
        for (const doc of snap.docs) {
          authUids.push(doc.id);
          batch.delete(doc.ref);
        }
        await batch.commit();
        docsDeleted += snap.size;
        if (snap.size < BATCH_LIMIT) hasMore = false;
      }
    } else {
      docsDeleted += await purgeQuery(db, baseQuery);
    }
  }

  // 3. Delete Firebase Auth accounts (best-effort, in chunks). Identity-bearing
  //    PII (email, display name) lives here, so honest erasure must remove it.
  let authUsersDeleted = 0;
  const auth = getAdminAuth();
  for (let i = 0; i < authUids.length; i += AUTH_DELETE_CHUNK) {
    const chunk = authUids.slice(i, i + AUTH_DELETE_CHUNK);
    try {
      const res = await auth.deleteUsers(chunk);
      authUsersDeleted += res.successCount;
      if (res.failureCount > 0) {
        Sentry.captureMessage("clinic_erasure: partial Auth deletion", {
          level: "warning",
          tags: { clinicId, source: "clinic_termination_erasure" },
          extra: { failureCount: res.failureCount },
        });
      }
    } catch (err) {
      // Non-fatal: Firestore PII is already gone; surface for manual cleanup.
      Sentry.captureException(err, {
        tags: { clinicId, source: "clinic_termination_erasure_auth" },
      });
    }
  }

  // 4. Delete the clinic doc itself (done last so a partial failure leaves the
  //    termination markers intact and the clinic is retried next run).
  await clinicDoc.ref.delete();
  docsDeleted += 1;

  return { docsDeleted, authUsersDeleted, subcollections: subcollectionIds };
}

/**
 * Erase every clinic whose 30-day termination grace period has elapsed.
 * Idempotent: erased clinics no longer match the schedule query.
 */
export async function executeClinicTerminationErasures(
  db: Db
): Promise<ClinicErasureResult> {
  const result: ClinicErasureResult = {
    erased: 0,
    docsDeleted: 0,
    authUsersDeleted: 0,
    skipped: [],
    errors: [],
  };

  const now = new Date().toISOString();

  // Matches ONLY clinics that carry `terminationScheduledAt` (absent on every
  // normal clinic) AND whose grace period has elapsed.
  const dueSnap = await db
    .collection("clinics")
    .where("terminationScheduledAt", "<", now)
    .get();

  for (const clinicDoc of dueSnap.docs) {
    const clinicId = clinicDoc.id;
    const data = clinicDoc.data();

    // Defence in depth: termination always sets status to "churned". A scheduled
    // clinic in any other state is an anomaly — skip and flag rather than erase.
    if (data.status !== "churned") {
      result.skipped.push(clinicId);
      Sentry.captureMessage("clinic_erasure: scheduled but status !== churned", {
        level: "warning",
        tags: { clinicId, source: "clinic_termination_erasure" },
        extra: { status: data.status },
      });
      continue;
    }

    try {
      const { docsDeleted, authUsersDeleted, subcollections } =
        await eraseClinicData(db, clinicDoc);

      // Retained, PII-free proof of erasure. The clinic's own audit_logs are
      // gone — this tombstone is the surviving evidence.
      await db.collection("_erasure_log").doc(clinicId).set({
        clinicId,
        clinicName: data.name ?? null,
        erasedAt: new Date().toISOString(),
        docsDeleted,
        authUsersDeleted,
        subcollectionsErased: subcollections,
        terminationRequestedAt: data.terminationRequestedAt ?? null,
        terminationScheduledAt: data.terminationScheduledAt ?? null,
        terminationReason: data.terminationReason ?? null,
        terminatedBy: data.terminatedBy ?? null,
      });

      result.erased += 1;
      result.docsDeleted += docsDeleted;
      result.authUsersDeleted += authUsersDeleted;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(`${clinicId}: ${message}`);
      Sentry.captureException(err, {
        tags: { clinicId, source: "clinic_termination_erasure" },
      });
    }
  }

  return result;
}
