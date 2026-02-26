import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyApiRequest, handleApiError, requireRole } from "@/lib/auth-guard";
import type { PmsProvider } from "@/types";

const INTEGRATIONS_PMS = "integrations_config";
const PMS_DOC_ID = "pms";

/** Save PMS API key to server-only integrations_config; update clinic doc for client display. */
export async function POST(request: NextRequest) {
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
      pmsLastSyncAt: now,
      onboarding: {
        ...onboarding,
        pmsConnected: true,
      },
      updatedAt: now,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
