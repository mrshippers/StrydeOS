import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyApiRequest, handleApiError, requireRole } from "@/lib/auth-guard";

const INTEGRATIONS_PMS = "integrations_config";
const PMS_DOC_ID = "pms";

export async function POST(request: NextRequest) {
  try {
    const user = await verifyApiRequest(request);
    requireRole(user, ["owner", "admin", "superadmin"]);
    const clinicId = user.clinicId;
    if (!clinicId) {
      return NextResponse.json({ error: "No clinic" }, { status: 400 });
    }

    const db = getAdminDb();
    const now = new Date().toISOString();

    await db
      .collection("clinics")
      .doc(clinicId)
      .collection(INTEGRATIONS_PMS)
      .doc(PMS_DOC_ID)
      .delete();

    const clinicRef = db.collection("clinics").doc(clinicId);
    const clinicSnap = await clinicRef.get();
    const onboarding = clinicSnap.data()?.onboarding ?? {};
    await clinicRef.update({
      pmsType: null,
      pmsLastSyncAt: null,
      onboarding: {
        ...onboarding,
        pmsConnected: false,
      },
      updatedAt: now,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
