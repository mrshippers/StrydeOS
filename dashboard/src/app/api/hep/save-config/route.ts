import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyApiRequest, handleApiError, requireRole } from "@/lib/auth-guard";
import type { HEPIntegrationConfig } from "@/lib/integrations/hep/types";
import { writeAuditLog, extractIpFromRequest } from "@/lib/audit-log";
import { withRequestLog } from "@/lib/request-logger";
import { encryptCredential } from "@/lib/crypto/credentials";

const INTEGRATIONS_CONFIG = "integrations_config";
const HEP_DOC_ID = "hep";

async function handler(request: NextRequest) {
  // Rate limit: 10 requests per IP per 60 seconds
  const { limited, remaining } = checkRateLimit(request, { limit: 10, windowMs: 60_000 });
  if (limited) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "X-RateLimit-Remaining": String(remaining) } }
    );
  }

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

    const encryptedApiKey = encryptCredential(apiKey.trim(), clinicId);

    await db
      .collection("clinics")
      .doc(clinicId)
      .collection(INTEGRATIONS_CONFIG)
      .doc(HEP_DOC_ID)
      .set(
        {
          provider,
          apiKey: encryptedApiKey,
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
