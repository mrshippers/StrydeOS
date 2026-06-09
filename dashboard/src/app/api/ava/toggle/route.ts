import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyApiRequest, requireRole, handleApiError } from "@/lib/auth-guard";
import { setPhoneNumberAgent } from "@/lib/ava/elevenlabs-agent";
import { withRequestLog } from "@/lib/request-logger";

/**
 * POST /api/ava/toggle
 *
 * Flips Ava's active/paused state and makes it real by attaching or detaching
 * the clinic's phone number from the ElevenLabs agent.
 *
 * Active:  phone number linked to agent  -> calls route to Ava
 * Paused:  phone number has no agent_id  -> calls go unanswered / Twilio default
 *
 * Requires: owner / admin / superadmin role.
 */

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY ?? "";

async function handler(req: NextRequest): Promise<NextResponse> {
  try {
    const user = await verifyApiRequest(req);
    requireRole(user, ["owner", "admin", "superadmin"]);

    const clinicId = user.clinicId;
    if (!clinicId) {
      return NextResponse.json({ error: "No clinic associated with user" }, { status: 400 });
    }

    if (!ELEVENLABS_API_KEY) {
      return NextResponse.json({ error: "ELEVENLABS_API_KEY not configured" }, { status: 500 });
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
    const phoneNumberId: string | undefined = ava.phone_number_id;

    if (!agentId) {
      return NextResponse.json({ error: "No ElevenLabs agent configured for this clinic" }, { status: 400 });
    }

    if (!phoneNumberId) {
      return NextResponse.json({ error: "No phone number provisioned for this clinic" }, { status: 400 });
    }

    // Sync to ElevenLabs: attach agent when activating, detach when pausing
    await setPhoneNumberAgent(
      ELEVENLABS_API_KEY,
      phoneNumberId,
      newEnabled ? agentId : null,
    );

    // Persist the new state to Firestore
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
