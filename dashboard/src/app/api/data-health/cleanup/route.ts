import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyCronRequest, handleApiError } from "@/lib/auth-guard";
import { writeAuditLog } from "@/lib/audit-log";
import { withRequestLog } from "@/lib/request-logger";

/**
 * GET /api/data-health/cleanup
 *
 * Weekly cron: enforces GDPR-compliant data retention by deleting
 * expired documents from clinic subcollections based on defined TTLs.
 *
 * Retention periods:
 *  - audit_logs:         730 days (2 years)
 *  - comms_log:          365 days (1 year)
 *  - call_log:           365 days (1 year)
 *  - integration_health:  90 days
 *  - funnel_events:      365 days (1 year)
 *  - appointments:      2920 days (8 years — UK clinical records guidance)
 *  - clinical_notes:    2920 days (8 years — UK clinical records guidance)
 *  - outcome_scores:    2920 days (8 years — UK clinical records guidance)
 *
 * Also enforces billing grace period: clinics past_due for >14 days
 * are downgraded to free tier with all features disabled.
 */

interface RetentionPolicy {
  collection: string;
  dateField: string;
  retentionDays: number;
  /** When true, dateField stores epoch ms (number) instead of ISO string */
  isEpochMs?: boolean;
}

const RETENTION_POLICIES: RetentionPolicy[] = [
  { collection: "audit_logs", dateField: "timestamp", retentionDays: 730 },
  { collection: "comms_log", dateField: "sentAt", retentionDays: 365 },
  { collection: "call_log", dateField: "startTimestamp", retentionDays: 365, isEpochMs: true },
  { collection: "integration_health", dateField: "timestamp", retentionDays: 90 },
  { collection: "funnel_events", dateField: "timestamp", retentionDays: 365 },
  // UK clinical records guidance: 8 years from last contact for adults.
  // Only clinical data records — patient identity docs have separate lifecycle (SAR/erasure).
  { collection: "appointments", dateField: "date", retentionDays: 2920 },
  { collection: "clinical_notes", dateField: "createdAt", retentionDays: 2920 },
  { collection: "outcome_scores", dateField: "recordedAt", retentionDays: 2920 },
];

const BATCH_LIMIT = 500;

/** Clean up top-level dedup collections (not per-clinic). */
async function cleanDedupCollection(
  db: FirebaseFirestore.Firestore,
  collectionName: string,
  dateField: string = "processedAt",
  retentionDays: number = 7
): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 86400000).toISOString();
  let totalDeleted = 0;
  let hasMore = true;

  while (hasMore) {
    const snap = await db
      .collection(collectionName)
      .where(dateField, "<", cutoff)
      .limit(BATCH_LIMIT)
      .get();

    if (snap.empty) break;

    const batch = db.batch();
    for (const doc of snap.docs) batch.delete(doc.ref);
    await batch.commit();
    totalDeleted += snap.size;
    if (snap.size < BATCH_LIMIT) hasMore = false;
  }

  return totalDeleted;
}

/**
 * GDPR hard-delete: cascade-remove patients past their 30-day grace period.
 *
 * Each entry below names a per-clinic subcollection that stores rows keyed
 * by `patientId`. On hard-delete we sweep all of these so no PII/PHI tied
 * to the patient survives. Adding a new patient-scoped collection? Add it
 * here too — otherwise SAR/erasure leaves orphaned re-identification risk.
 *
 * `insight_events` and `reviews` were added because both carry patient
 * names + free-text narratives / NPS replies and the original list missed
 * them — they survived hard-delete and reidentified deleted patients.
 */
const PATIENT_SUBCOLLECTIONS = [
  "appointments",
  "comms_log",
  "clinical_notes",
  "outcome_scores",
  "call_log",
  "voiceInteractions",
  "insight_events",
  "reviews",
] as const;

/**
 * Sweep `_failed_events` DLQ rows tied to a deleted patient. See the call
 * site in `executeGdprHardDeletions` for the rationale and known limitation.
 */
async function deleteFailedEventsForPatient(
  db: FirebaseFirestore.Firestore,
  clinicId: string,
  patientId: string,
  originalEventIds: string[]
): Promise<void> {
  const failedRef = db
    .collection("clinics")
    .doc(clinicId)
    .collection("_failed_events");

  // Prong 1: top-level originalPayload.patientId equality (cheap, indexed
  // if a composite index exists; otherwise a small collection scan).
  let hasMore = true;
  while (hasMore) {
    const snap = await failedRef
      .where("originalPayload.patientId", "==", patientId)
      .limit(BATCH_LIMIT)
      .get();

    if (snap.empty) {
      hasMore = false;
      break;
    }

    const batch = db.batch();
    for (const doc of snap.docs) batch.delete(doc.ref);
    await batch.commit();

    if (snap.size < BATCH_LIMIT) hasMore = false;
  }

  // Prong 2: derived from a deleted insight_event. `in` queries cap at 30
  // values so chunk the id list.
  const CHUNK = 30;
  for (let i = 0; i < originalEventIds.length; i += CHUNK) {
    const chunk = originalEventIds.slice(i, i + CHUNK);
    if (chunk.length === 0) continue;

    const snap = await failedRef
      .where("originalEventId", "in", chunk)
      .get();

    if (snap.empty) continue;

    const batch = db.batch();
    for (const doc of snap.docs) batch.delete(doc.ref);
    await batch.commit();
  }
}

async function executeGdprHardDeletions(
  db: FirebaseFirestore.Firestore
): Promise<{ deleted: number; errors: string[] }> {
  const result = { deleted: 0, errors: [] as string[] };
  const now = new Date().toISOString();

  // Query all clinics for patients marked for deletion whose grace period has elapsed
  const clinicsSnap = await db
    .collection("clinics")
    .where("status", "in", ["live", "onboarding"])
    .get();

  for (const clinicDoc of clinicsSnap.docs) {
    const clinicId = clinicDoc.id;

    try {
      const patientsSnap = await db
        .collection("clinics")
        .doc(clinicId)
        .collection("patients")
        .where("markedForDeletion", "==", true)
        .where("deletionScheduledAt", "<", now)
        .get();

      for (const patientDoc of patientsSnap.docs) {
        const patientId = patientDoc.id;
        // Track insight_events ids so we can cascade matching _failed_events
        // rows whose originalPayload references them (where patientId is
        // buried inside an opaque payload and not on a top-level field).
        const deletedInsightEventIds: string[] = [];

        try {
          // Cascade-delete across subcollections referencing this patient
          for (const subcollection of PATIENT_SUBCOLLECTIONS) {
            let hasMore = true;
            while (hasMore) {
              const subSnap = await db
                .collection("clinics")
                .doc(clinicId)
                .collection(subcollection)
                .where("patientId", "==", patientId)
                .limit(BATCH_LIMIT)
                .get();

              if (subSnap.empty) {
                hasMore = false;
                break;
              }

              if (subcollection === "insight_events") {
                for (const d of subSnap.docs) deletedInsightEventIds.push(d.id);
              }

              const batch = db.batch();
              for (const doc of subSnap.docs) batch.delete(doc.ref);
              await batch.commit();

              if (subSnap.size < BATCH_LIMIT) hasMore = false;
            }
          }

          // _failed_events DLQ rows preserve originalPayload verbatim, which
          // can include patient identifiers nested inside the payload. We
          // can't query nested fields cheaply, so we use a two-pronged sweep:
          //   1. originalPayload.patientId equality (covers events whose
          //      payload exposes patientId at the documented top level).
          //   2. originalEventId IN deletedInsightEventIds (covers payloads
          //      where patientId is buried — anything that DLQ'd from the
          //      insight_events we just deleted is by definition this
          //      patient's data and must go).
          // Limitation: a failed event for this patient that does NOT carry
          // patientId on its payload AND was not derived from one of the
          // deleted insight_events will survive. Acceptable trade-off — those
          // payloads already lack stable identifiers, so reidentification
          // requires the original raw text alone.
          await deleteFailedEventsForPatient(
            db,
            clinicId,
            patientId,
            deletedInsightEventIds
          );

          // Delete the patient document itself
          await patientDoc.ref.delete();
          result.deleted += 1;

          // Audit log for GDPR compliance
          await writeAuditLog(db, clinicId, {
            userId: "system:gdpr-cleanup",
            userEmail: "system@strydeos.com",
            action: "delete",
            resource: "patient",
            resourceId: patientId,
            metadata: {
              reason: "gdpr_hard_delete",
              deletionScheduledAt: patientDoc.data().deletionScheduledAt,
            },
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          result.errors.push(`${clinicId}/${patientId}: ${message}`);
          Sentry.captureException(err, {
            tags: { clinicId, patientId, source: "gdpr_hard_delete" },
          });
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(`${clinicId}: ${message}`);
      Sentry.captureException(err, {
        tags: { clinicId, source: "gdpr_hard_delete" },
      });
    }
  }

  return result;
}

const PAYMENT_GRACE_DAYS = 14;

/** Downgrade clinics whose payment has been past_due beyond the grace period. */
async function enforcePaymentGracePeriod(
  db: FirebaseFirestore.Firestore
): Promise<{ downgraded: number; errors: string[] }> {
  const result = { downgraded: 0, errors: [] as string[] };

  const pastDueSnap = await db
    .collection("clinics")
    .where("billing.subscriptionStatus", "==", "past_due")
    .get();

  for (const clinicDoc of pastDueSnap.docs) {
    const clinicId = clinicDoc.id;
    const data = clinicDoc.data();
    const paymentFailedAt = data.billing?.paymentFailedAt;

    if (!paymentFailedAt) continue;

    const failedDate =
      typeof paymentFailedAt === "string"
        ? new Date(paymentFailedAt).getTime()
        : paymentFailedAt?.toMillis?.()
          ? paymentFailedAt.toMillis()
          : Number(paymentFailedAt);

    if (isNaN(failedDate)) continue;

    const daysSinceFailure = (Date.now() - failedDate) / 86400000;
    if (daysSinceFailure <= PAYMENT_GRACE_DAYS) continue;

    try {
      await clinicDoc.ref.update({
        "billing.subscriptionStatus": "unpaid",
        "billing.tier": "free",
        "featureFlags.intelligence": false,
        "featureFlags.continuity": false,
        "featureFlags.receptionist": false,
      });

      await writeAuditLog(db, clinicId, {
        userId: "system:billing-enforcement",
        userEmail: "system@strydeos.com",
        action: "update",
        resource: "clinic",
        resourceId: clinicId,
        metadata: {
          reason: "payment_grace_period_exceeded",
          daysPastDue: Math.floor(daysSinceFailure),
          previousTier: data.billing?.tier ?? "unknown",
          previousStatus: "past_due",
          downgradedTo: "free",
        },
      });

      result.downgraded += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(`${clinicId}: ${message}`);
      Sentry.captureException(err, {
        tags: { clinicId, source: "payment_grace_downgrade" },
      });
    }
  }

  return result;
}

async function handler(request: NextRequest) {
  try {
    verifyCronRequest(request);
  } catch (e) {
    return handleApiError(e);
  }

  const db = getAdminDb();

  // Gather all active clinics
  const clinicsSnap = await db
    .collection("clinics")
    .where("status", "in", ["live", "onboarding"])
    .get();

  const summary: Record<
    string,
    { deleted: number; clinicsProcessed: number; errors: string[] }
  > = {};

  for (const policy of RETENTION_POLICIES) {
    summary[policy.collection] = { deleted: 0, clinicsProcessed: 0, errors: [] };
  }

  for (const clinicDoc of clinicsSnap.docs) {
    const clinicId = clinicDoc.id;

    for (const policy of RETENTION_POLICIES) {
      const cutoff = policy.isEpochMs
        ? Date.now() - policy.retentionDays * 86400000
        : new Date(Date.now() - policy.retentionDays * 86400000).toISOString();

      const collectionPath = `clinics/${clinicId}/${policy.collection}`;

      try {
        let totalDeleted = 0;
        let hasMore = true;

        while (hasMore) {
          const expiredSnap = await db
            .collection(collectionPath)
            .where(policy.dateField, "<", cutoff)
            .limit(BATCH_LIMIT)
            .get();

          if (expiredSnap.empty) {
            hasMore = false;
            break;
          }

          const batch = db.batch();
          for (const doc of expiredSnap.docs) {
            batch.delete(doc.ref);
          }
          await batch.commit();

          totalDeleted += expiredSnap.size;

          // If we got fewer than the limit, no more pages
          if (expiredSnap.size < BATCH_LIMIT) {
            hasMore = false;
          }
        }

        summary[policy.collection].deleted += totalDeleted;
        summary[policy.collection].clinicsProcessed += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        summary[policy.collection].errors.push(`${clinicId}: ${message}`);
        Sentry.captureException(err, {
          tags: { clinicId, collection: policy.collection, source: "data_cleanup_cron" },
        });
      }
    }
  }

  // Clean top-level dedup collections
  let dedupDeleted = 0;
  try {
    dedupDeleted += await cleanDedupCollection(db, "_webhook_dedup");
  } catch (err) {
    Sentry.captureException(err, { tags: { source: "webhook_dedup_cleanup" } });
  }

  // Stripe event dedup — 7-day TTL (matches Stripe retry window)
  let stripeDedupDeleted = 0;
  try {
    stripeDedupDeleted = await cleanDedupCollection(db, "_stripe_event_dedup");
    dedupDeleted += stripeDedupDeleted;
  } catch (err) {
    Sentry.captureException(err, { tags: { source: "stripe_dedup_cleanup" } });
  }

  // GDPR: hard-delete patients past their 30-day grace period
  let gdprResult = { deleted: 0, errors: [] as string[] };
  try {
    gdprResult = await executeGdprHardDeletions(db);
  } catch (err) {
    Sentry.captureException(err, { tags: { source: "gdpr_hard_delete" } });
  }

  // Billing: downgrade clinics past the 14-day payment grace period
  let billingResult = { downgraded: 0, errors: [] as string[] };
  try {
    billingResult = await enforcePaymentGracePeriod(db);
  } catch (err) {
    Sentry.captureException(err, { tags: { source: "payment_grace_downgrade" } });
  }

  const totalDeleted = Object.values(summary).reduce((acc, s) => acc + s.deleted, 0) + dedupDeleted + gdprResult.deleted;

  return NextResponse.json({
    ok: true,
    processedAt: new Date().toISOString(),
    clinicsScanned: clinicsSnap.size,
    totalDeleted,
    webhookDedupDeleted: dedupDeleted - stripeDedupDeleted,
    stripeDedupDeleted,
    gdprHardDeleted: gdprResult.deleted,
    gdprErrors: gdprResult.errors.length > 0 ? gdprResult.errors : undefined,
    billingDowngraded: billingResult.downgraded,
    billingErrors: billingResult.errors.length > 0 ? billingResult.errors : undefined,
    collections: summary,
  });
}

export const GET = withRequestLog(handler);
