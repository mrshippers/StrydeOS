import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyApiRequest, handleApiError, requireRole } from "@/lib/auth-guard";
import { writeAuditLog, extractIpFromRequest } from "@/lib/audit-log";
import { validateApiKey } from "@/lib/integrations/heidi/client";
import { encryptCredential } from "@/lib/crypto/credentials";
import { withRequestLog } from "@/lib/request-logger";

const INTEGRATIONS_CONFIG = "integrations_config";
const HEIDI_DOC_ID = "heidi";

async function handler(request: NextRequest) {
  try {
    const user = await verifyApiRequest(request);
    requireRole(user, ["owner", "admin", "superadmin"]);
    const clinicId = user.clinicId;
    if (!clinicId) {
      return NextResponse.json({ error: "No clinic" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const apiKey = body.apiKey as string | undefined;
    const region = (body.region as string) ?? "uk";
    const testEmail = body.testEmail as string | undefined;

    if (!apiKey?.trim()) {
      return NextResponse.json({ error: "API key is required" }, { status: 400 });
    }

    if (!["uk", "au", "us", "eu"].includes(region)) {
      return NextResponse.json({ error: "Invalid region" }, { status: 400 });
    }

    // Validate the API key by attempting a JWT exchange
    if (testEmail) {
      const valid = await validateApiKey(
        { apiKey: apiKey.trim(), region: region as "uk" | "au" | "us" | "eu" },
        testEmail,
      );
      if (!valid) {
        return NextResponse.json(
          { error: "Invalid API key — could not authenticate with Heidi" },
          { status: 401 },
        );
      }
    }

    const db = getAdminDb();
    const now = new Date().toISOString();

    await db
      .collection("clinics")
      .doc(clinicId)
      .collection(INTEGRATIONS_CONFIG)
      .doc(HEIDI_DOC_ID)
      .set(
        {
          enabled: true,
          apiKey: encryptCredential(apiKey.trim(), clinicId),
          region,
          configuredAt: now,
          status: "connected",
          lastSyncAt: null,
        },
        { merge: true },
      );

    await writeAuditLog(db, clinicId, {
      userId: user.uid,
      userEmail: user.email,
      action: "config_change",
      resource: "integrations_config",
      resourceId: HEIDI_DOC_ID,
      metadata: { region, action: "connect" },
      ip: extractIpFromRequest(request),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}

export const POST = withRequestLog(handler);
