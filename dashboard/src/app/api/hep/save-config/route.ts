import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyApiRequest, handleApiError, requireRole } from "@/lib/auth-guard";
import type { HEPIntegrationConfig } from "@/lib/integrations/hep/types";
import { writeAuditLog, extractIpFromRequest } from "@/lib/audit-log";
import { withRequestLog } from "@/lib/request-logger";

const INTEGRATIONS_CONFIG = "integrations_config";
const HEP_DOC_ID = "hep";

async function handler(request: NextRequest) {
  try {
    const user = await verifyApiRequest(request);
    requireRole(user, ["owner", "admin", "superadmin"]);
    const clinicId = user.clinicId;
    if (!clinicId) {
      return NextResponse.json({ error: "No clinic" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const provider = (body.provider as HEPIntegrationConfig["provider"]) ?? "physitrack";
    const apiKey = body.apiKey as string | undefined;
    if (!apiKey?.trim()) {
      return NextResponse.json({ error: "API key is required" }, { status: 400 });
    }

    const db = getAdminDb();

    await db
      .collection("clinics")
      .doc(clinicId)
      .collection(INTEGRATIONS_CONFIG)
      .doc(HEP_DOC_ID)
      .set(
        {
          provider,
          apiKey: apiKey.trim(),
        },
        { merge: true }
      );

    await db
      .collection("clinics")
      .doc(clinicId)
      .update({
        hepType: provider,
        hepConnectedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

    await writeAuditLog(db, clinicId, {
      userId: user.uid,
      userEmail: user.email,
      action: "config_change",
      resource: "integrations_config",
      resourceId: HEP_DOC_ID,
      metadata: { provider, action: "connect" },
      ip: extractIpFromRequest(request),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}

export const POST = withRequestLog(handler);
