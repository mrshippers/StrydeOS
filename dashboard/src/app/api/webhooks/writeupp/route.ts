import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { createPMSAdapter } from "@/lib/integrations/pms/factory";
import { buildClinicianMap } from "@/lib/pipeline/sync-clinicians";
import { syncAppointments } from "@/lib/pipeline/sync-appointments";
import { syncPatients } from "@/lib/pipeline/sync-patients";
import { computePatientFields } from "@/lib/pipeline/compute-patients";
import { triggerCommsSequences } from "@/lib/comms/trigger-sequences";
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
    if (!WEBHOOK_SECRET || secret !== WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const event = body.event as string | undefined;
    const clinicExternalRef = body.clinic_id as string | undefined;

    if (!event) {
      return NextResponse.json({ error: "Missing event" }, { status: 400 });
    }

    const db = getAdminDb();
    const results = [];

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
      targetClinicIds = clinicsSnap.docs.map((d) => d.id);
    }

    for (const clinicId of targetClinicIds) {
      const configSnap = await db
        .collection("clinics")
        .doc(clinicId)
        .collection("integrations_config")
        .doc("pms")
        .get();
      const config = configSnap.data() as PMSIntegrationConfig | undefined;

      if (!config?.apiKey?.trim() || config.provider !== "writeupp") continue;

      const adapter = createPMSAdapter(config);
      const clinicianMap = await buildClinicianMap(db, clinicId);

      // Run a targeted incremental sync (4-week window, not backfill)
      const s2 = await syncAppointments(
        db,
        clinicId,
        adapter,
        clinicianMap,
        { backfill: false }
      );

      const s3 = await syncPatients(
        db,
        clinicId,
        adapter,
        s2.patientExternalIds,
        clinicianMap
      );

      const s5 = await computePatientFields(db, clinicId);

      // Trigger comms sequences after patient fields are recomputed
      const commsResult = await triggerCommsSequences(db, clinicId).catch((e) => ({
        fired: 0, skipped: 0,
        errors: [e instanceof Error ? e.message : String(e)],
      }));

      results.push({
        clinicId,
        event,
        stages: [
          { stage: s2.stage, ok: s2.ok, count: s2.count },
          { stage: s3.stage, ok: s3.ok, count: s3.count },
          { stage: s5.stage, ok: s5.ok, count: s5.count },
          { stage: "trigger-comms", ok: commsResult.errors.length === 0, count: commsResult.fired },
        ],
      });
    }

    return NextResponse.json({ ok: true, results });
  } catch (e) {
    console.error("[Webhook Error]", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export const POST = withRequestLog(handler);
