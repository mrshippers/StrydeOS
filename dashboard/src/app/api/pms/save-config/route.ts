import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyApiRequest, handleApiError, requireRole } from "@/lib/auth-guard";
import type { PmsProvider } from "@/types";
import { writeAuditLog, extractIpFromRequest } from "@/lib/audit-log";
import { withRequestLog } from "@/lib/request-logger";

const INTEGRATIONS_PMS = "integrations_config";
const PMS_DOC_ID = "pms";

/** Save PMS API key to server-only integrations_config; update clinic doc for client display. */
async function handler(request: NextRequest) {
  try {
    const user = await verifyApiRequest(request);
    requireRole(user, ["owner", "admin", "superadmin"]);
    const clinicId = user.clinicId;
    if (!clinicId) {
      return NextResponse.json({ error: "No clinic" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const provider = (body.provider as PmsProvider) ?? "writeupp";
    const apiKey = body.apiKey as string | undefined;
    const baseUrl = body.baseUrl as string | undefined;
    if (!apiKey?.trim()) {
      return NextResponse.json({ error: "API key is required" }, { status: 400 });
    }

    const db = getAdminDb();
    const now = new Date().toISOString();

    await db
      .collection("clinics")
      .doc(clinicId)
      .collection(INTEGRATIONS_PMS)
      .doc(PMS_DOC_ID)
      .set(
        {
          provider,
          apiKey: apiKey.trim(),
          ...(baseUrl ? { baseUrl } : {}),
          connectedAt: now,
          lastSyncAt: null,
          lastSyncStatus: null,
          syncErrors: null,
        },
        { merge: true }
      );

    const clinicRef = db.collection("clinics").doc(clinicId);
    const clinicSnap = await clinicRef.get();
    const onboarding = clinicSnap.data()?.onboarding ?? {};
    await clinicRef.update({
      pmsType: provider,
      onboarding: {
        ...onboarding,
        pmsConnected: true,
      },
      updatedAt: now,
    });

    await writeAuditLog(db, clinicId, {
      userId: user.uid,
      userEmail: user.email,
      action: "config_change",
      resource: "integrations_config",
      resourceId: PMS_DOC_ID,
      metadata: { provider, action: "connect" },
      ip: extractIpFromRequest(request),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}

export const POST = withRequestLog(handler);
