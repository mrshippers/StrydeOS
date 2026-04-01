import * as crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { createPMSAdapter } from "@/lib/integrations/pms/factory";
import { buildClinicianMap } from "@/lib/pipeline/sync-clinicians";
import { syncAppointments } from "@/lib/pipeline/sync-appointments";
import { syncPatients } from "@/lib/pipeline/sync-patients";
import { computePatientFields } from "@/lib/pipeline/compute-patients";
import { triggerCommsSequences } from "@/lib/comms/trigger-sequences";
import { computeWeeklyMetricsForClinic } from "@/lib/metrics/compute-weekly";
import type { PMSIntegrationConfig } from "@/types/pms";
import { withRequestLog } from "@/lib/request-logger";

const WEBHOOK_SECRET = process.env.WRITEUPP_WEBHOOK_SECRET;

/**
 * POST /api/webhooks/writeupp
 *
 * Real-time webhook receiver for WriteUpp events.
 * Validates a shared secret, then runs a targeted mini-pipeline
 * for the affected clinic (appointment sync + patient resolve + field computation).
 *
 * WriteUpp sends: { event, clinicId (custom header or body), data }
 */
async function handler(request: NextRequest) {
  try {
    // Validate webhook secret
    const secret =
      request.headers.get("x-webhook-secret") ??
      request.headers.get("authorization")?.replace("Bearer ", "");
    if (
      !WEBHOOK_SECRET ||
      !secret ||
      !crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(WEBHOOK_SECRET))
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rawBody = await request.text();
    let body: Record<string, unknown> = {};
    try { body = JSON.parse(rawBody); } catch { /* malformed — body stays empty */ }
    const event = body.event as string | undefined;

    if (!event) {
      return NextResponse.json({ error: "Missing event" }, { status: 400 });
    }

    // Idempotency: SHA-256 hash of the raw webhook body to dedup exact retries
    const idempotencyKey = crypto
      .createHash("sha256")
      .update(rawBody)
      .digest("hex")
      .slice(0, 24);

    const db = getAdminDb();

    // Check if this webhook was already processed recently
    const dedupRef = db.collection("_webhook_dedup").doc(idempotencyKey);
    const dedupSnap = await dedupRef.get();
    if (dedupSnap.exists) {
      return NextResponse.json({ ok: true, deduplicated: true });
    }
    // Mark as processed (TTL cleanup handled by data-health/cleanup cron)
    await dedupRef.set({ processedAt: new Date().toISOString(), event });

    // Optimised clinic resolution: use clinicId from body/header if available,
    // otherwise fall back to scanning WriteUpp-configured clinics.
    const directClinicId =
      (body.strydeos_clinic_id as string | undefined) ??
      request.headers.get("x-strydeos-clinic-id");

    let targetClinicIds: string[] = [];

    if (directClinicId) {
      targetClinicIds = [directClinicId];
    } else {
      // Filtered scan — only clinics with pmsType = "writeupp" to avoid full collection scan
      const clinicsSnap = await db
        .collection("clinics")
        .where("pmsType", "==", "writeupp")
        .get();
      const allIds = clinicsSnap.docs.map((d) => d.id);

      if (allIds.length > 1) {
        // Ambiguous — refuse to sync multiple clinics from a single webhook.
        // Require x-strydeos-clinic-id header or strydeos_clinic_id in body.
        console.error(
          `[WriteUpp Webhook] Ambiguous clinic resolution: ${allIds.length} clinics matched. ` +
          `Set x-strydeos-clinic-id header to disambiguate. Matched: ${allIds.join(", ")}`
        );
        return NextResponse.json(
          { error: "Ambiguous clinic — set x-strydeos-clinic-id header", matchedCount: allIds.length },
          { status: 422 }
        );
      }

      targetClinicIds = allIds;
    }

    // Acknowledge receipt immediately — process pipeline in background
    after(async () => {
      for (const clinicId of targetClinicIds) {
        try {
          const configSnap = await db
            .collection("clinics")
            .doc(clinicId)
            .collection("integrations_config")
            .doc("pms")
            .get();
          const config = configSnap.data() as PMSIntegrationConfig | undefined;

          if (!config?.apiKey?.trim() || config.provider !== "writeupp") continue;

          // Read clinic session price for revenue fallback
          const clinicDoc = await db.collection("clinics").doc(clinicId).get();
          const sessionPricePence: number = clinicDoc.data()?.sessionPricePence ?? 0;

          const adapter = createPMSAdapter(config);
          const clinicianMap = await buildClinicianMap(db, clinicId);

          const s2 = await syncAppointments(
            db,
            clinicId,
            adapter,
            clinicianMap,
            { backfill: false, sessionPricePence }
          );

          const s3 = await syncPatients(
            db,
            clinicId,
            adapter,
            s2.patientExternalIds,
            clinicianMap
          );

          await computePatientFields(db, clinicId);

          await triggerCommsSequences(db, clinicId).catch((e) => {
            console.error(`[WriteUpp webhook] comms error for ${clinicId}:`, e);
          });

          // Recompute weekly metrics so dashboard reflects fresh data immediately
          await computeWeeklyMetricsForClinic(db, clinicId, 8).catch((e) => {
            console.error(`[WriteUpp webhook] metrics compute error for ${clinicId}:`, e);
          });

          // Update pmsLastSyncAt so the dashboard staleness indicator refreshes
          await db.collection("clinics").doc(clinicId).update({
            pmsLastSyncAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        } catch (err) {
          console.error(`[WriteUpp webhook] pipeline error for ${clinicId}:`, err);
        }
      }
    });

    return NextResponse.json({ ok: true, event, clinicIds: targetClinicIds });
  } catch (e) {
    console.error("[Webhook Error]", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export const POST = withRequestLog(handler);
