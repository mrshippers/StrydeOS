import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyApiRequest, requireRole, handleApiError } from "@/lib/auth-guard";
import { withRequestLog } from "@/lib/request-logger";

/**
 * POST /api/ava/toggle
 *
 * Flips Ava's active/paused state by flipping the single `ava.enabled` flag on
 * the clinic doc. That flag is the ONE source of truth for routing:
 * /api/ava/inbound-call reads it on every inbound call and returns the
 * voicemail flow when it is false, so the toggle genuinely turns Ava off.
 *
 * Active:  ava.enabled = true   -> inbound proxy dials Ava (SIP)
 * Paused:  ava.enabled = false  -> inbound proxy returns voicemail TwiML
 *
 * Note: we deliberately do NOT detach the ElevenLabs agent from the number as
 * the off switch. Under the proxy-first topology that detach controlled the
 * wrong path (the native import) and left the proxy still dialing, so a paused
 * clinic was not actually off. Pause now lives entirely in this flag.
 *
 * Requires: owner / admin / superadmin role.
 */

async function handler(req: NextRequest): Promise<NextResponse> {
  try {
    const user = await verifyApiRequest(req);
    requireRole(user, ["owner", "admin", "superadmin"]);

    const clinicId = user.clinicId;
    if (!clinicId) {
      return NextResponse.json({ error: "No clinic associated with user" }, { status: 400 });
    }

    const db = getAdminDb();
    const clinicRef = db.collection("clinics").doc(clinicId);
    const clinicSnap = await clinicRef.get();

    if (!clinicSnap.exists) {
      return NextResponse.json({ error: "Clinic not found" }, { status: 404 });
    }

    const data = clinicSnap.data()!;
    const ava = data.ava ?? {};
    const currentlyEnabled: boolean = ava.enabled ?? false;
    const newEnabled = !currentlyEnabled;

    const agentId: string | undefined = ava.agent_id;
    if (!agentId) {
      return NextResponse.json({ error: "No ElevenLabs agent configured for this clinic" }, { status: 400 });
    }

    // Persist the new state to Firestore. The inbound proxy reads this flag, so
    // the toggle is effective the moment this write lands — no ElevenLabs call
    // is needed to make pause real.
    await clinicRef.update({
      "ava.enabled": newEnabled,
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({ enabled: newEnabled });
  } catch (error) {
    console.error("[ava/toggle] error:", error);
    return handleApiError(error);
  }
}

export const POST = withRequestLog(handler);
