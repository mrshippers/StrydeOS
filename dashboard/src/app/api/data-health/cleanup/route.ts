import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyCronRequest, handleApiError } from "@/lib/auth-guard";
import { withRequestLog } from "@/lib/request-logger";

/**
 * GET /api/data-health/cleanup
 *
 * Weekly cron: enforces GDPR-compliant data retention by deleting
 * expired documents from clinic subcollections based on defined TTLs.
 *
 * Retention periods:
 *  - audit_logs:        730 days (2 years)
 *  - comms_log:         365 days (1 year)
 *  - call_log:          365 days (1 year)
 *  - integration_health: 90 days
 *  - funnel_events:     365 days (1 year)
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

  const totalDeleted = Object.values(summary).reduce((acc, s) => acc + s.deleted, 0) + dedupDeleted;

  return NextResponse.json({
    ok: true,
    processedAt: new Date().toISOString(),
    clinicsScanned: clinicsSnap.size,
    totalDeleted,
    webhookDedupDeleted: dedupDeleted,
    collections: summary,
  });
}

export const GET = withRequestLog(handler);
