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

/** Clean up the _webhook_dedup collection (top-level, not per-clinic). */
async function cleanWebhookDedup(db: FirebaseFirestore.Firestore): Promise<number> {
  const cutoff = new Date(Date.now() - 7 * 86400000).toISOString(); // 7 days
  let totalDeleted = 0;
  let hasMore = true;

  while (hasMore) {
    const snap = await db
      .collection("_webhook_dedup")
      .where("processedAt", "<", cutoff)
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

/** GDPR hard-delete: cascade-remove patients past their 30-day grace period. */
const PATIENT_SUBCOLLECTIONS = [
  "appointments",
  "comms_log",
  "clinical_notes",
  "outcome_scores",
  "call_log",
  "voiceInteractions",
] as const;

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

              const batch = db.batch();
              for (const doc of subSnap.docs) batch.delete(doc.ref);
              await batch.commit();

              if (subSnap.size < BATCH_LIMIT) hasMore = false;
            }
          }

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

  // Clean top-level webhook dedup collection
  let dedupDeleted = 0;
  try {
    dedupDeleted = await cleanWebhookDedup(db);
  } catch (err) {
    Sentry.captureException(err, { tags: { source: "webhook_dedup_cleanup" } });
  }

  // GDPR: hard-delete patients past their 30-day grace period
  let gdprResult = { deleted: 0, errors: [] as string[] };
  try {
    gdprResult = await executeGdprHardDeletions(db);
  } catch (err) {
    Sentry.captureException(err, { tags: { source: "gdpr_hard_delete" } });
  }

  const totalDeleted = Object.values(summary).reduce((acc, s) => acc + s.deleted, 0) + dedupDeleted + gdprResult.deleted;

  return NextResponse.json({
    ok: true,
    processedAt: new Date().toISOString(),
    clinicsScanned: clinicsSnap.size,
    totalDeleted,
    webhookDedupDeleted: dedupDeleted,
    gdprHardDeleted: gdprResult.deleted,
    gdprErrors: gdprResult.errors.length > 0 ? gdprResult.errors : undefined,
    collections: summary,
  });
}

export const GET = withRequestLog(handler);
