import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyApiRequest, requireRole, ApiAuthError } from "@/lib/auth-guard";
import { purchaseUkNumber, getTwilio } from "@/lib/twilio";
import { withRequestLog } from "@/lib/request-logger";
import { createAvaTools, createAvaAgent } from "@/lib/ava/elevenlabs-agent";

/**
 * POST /api/ava/provision-number
 *
 * Provisions a dedicated Twilio phone number for the clinic's Ava instance
 * under the single proxy-first topology:
 * 1. Creates the ElevenLabs agent if one doesn't exist yet
 * 2. Buys a UK number (near clinic locality if possible) with its voiceUrl
 *    pointed at /api/ava/inbound-call — every call routes through our proxy,
 *    which enforces pause and multi-tenant routing before reaching ElevenLabs
 * 3. Persists the purchased phoneSid to Firestore IMMEDIATELY (so a later
 *    failure can roll the number back instead of orphaning a billed number)
 * 4. Stores the number + agent ID; the clinic starts PAUSED (ava.enabled =
 *    false) until an owner toggles Ava on
 *
 * There is deliberately NO native ElevenLabs phone-number import here. That
 * second inbound path competed with the proxy and made the pause toggle
 * control the wrong route. The proxy + voiceUrl is the only inbound topology.
 *
 * Rollback: any failure after purchase deletes the Twilio number before the
 * provisioning lock is cleared, so the flow is safe to retry.
 *
 * Requires: owner / admin / superadmin role.
 */

const db = getAdminDb();

/**
 * Best-effort rollback of a purchased Twilio number. Releasing the number
 * stops the recurring charge. Failures are logged, never thrown — rollback
 * must not mask the original provisioning error that triggered it.
 *
 * Cross-file follow-up: a reusable releaseUkNumber() belongs in @/lib/twilio
 * alongside purchaseUkNumber(); inlined here to stay within scope.
 */
async function releaseTwilioNumber(phoneSid: string): Promise<void> {
  if (!phoneSid) return;
  try {
    const tw = getTwilio();
    await tw.incomingPhoneNumbers(phoneSid).remove();
    console.warn(`[Ava provision-number] rolled back Twilio number ${phoneSid}`);
  } catch (err) {
    console.error(
      `[Ava provision-number] FAILED to roll back Twilio number ${phoneSid} (manual release needed):`,
      err instanceof Error ? err.message : String(err)
    );
  }
}

async function handler(req: NextRequest) {
  // Strict rate limit — this costs money
  const { limited, remaining } = checkRateLimit(req, { limit: 2, windowMs: 60_000 });
  if (limited) {
    return NextResponse.json(
      { error: "Too many requests. Number provisioning is rate-limited." },
      { status: 429, headers: { "X-RateLimit-Remaining": String(remaining) } }
    );
  }

  let clinicId: string | undefined;

  try {
    const user = await verifyApiRequest(req);
    requireRole(user, ["owner", "admin", "superadmin"]);
    clinicId = user.clinicId;

    if (!clinicId) {
      return NextResponse.json({ error: "No clinic associated with user" }, { status: 400 });
    }

    // Parse optional locality hint from body
    let locality: string | undefined;
    try {
      const body = await req.json();
      locality = body.locality || undefined;
    } catch {
      // No body or invalid JSON — proceed without locality
    }

    // Fetch clinic doc
    const clinicDoc = await db.collection("clinics").doc(clinicId).get();
    if (!clinicDoc.exists) {
      return NextResponse.json({ error: "Clinic not found" }, { status: 404 });
    }

    const clinicData = clinicDoc.data()!;

    // Guard: don't provision if an Ava number is already assigned
    const existingAvaPhone = clinicData.ava?.config?.phone;
    if (existingAvaPhone) {
      return NextResponse.json(
        { error: "This clinic already has a provisioned number", phone: existingAvaPhone },
        { status: 409 }
      );
    }

    // Transaction prevents concurrent purchases. The lock auto-expires after
    // PROVISION_LOCK_TTL_MS so a crashed request can't permanently block retries.
    const PROVISION_LOCK_TTL_MS = 2 * 60 * 1000;
    const lockResult = await db.runTransaction(async (txn) => {
      const freshDoc = await txn.get(db.collection("clinics").doc(clinicId!));
      const freshData = freshDoc.data();

      if (freshData?.ava?.config?.phone) {
        return { blocked: true as const, reason: "already_provisioned" as const };
      }

      const lockAtRaw = freshData?.ava?.provisioningLockAt;
      const lockAt = typeof lockAtRaw === "string" ? new Date(lockAtRaw).getTime() : 0;
      const lockAge = Date.now() - lockAt;
      if (freshData?.ava?.provisioningInProgress && lockAge < PROVISION_LOCK_TTL_MS) {
        return { blocked: true as const, reason: "in_progress" as const };
      }

      txn.update(db.collection("clinics").doc(clinicId!), {
        "ava.provisioningInProgress": true,
        "ava.provisioningLockAt": new Date().toISOString(),
      });
      return { blocked: false as const };
    });

    if (lockResult.blocked) {
      const msg = lockResult.reason === "in_progress"
        ? "A provisioning request is already in progress. Please wait a moment and try again."
        : "This clinic already has a provisioned number";
      return NextResponse.json({ error: msg }, { status: 409 });
    }

    // 1. Ensure ElevenLabs agent exists
    let agentId = clinicData.ava?.agent_id as string | undefined;
    let toolIds = clinicData.ava?.toolIds as string[] | undefined;
    if (!agentId) {
      const { buildAvaCorePrompt } = await import("@/lib/ava/ava-core-prompt");
      const { compileKnowledgeDocument } = await import("@/lib/ava/ava-knowledge");

      const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
      if (!ELEVENLABS_API_KEY) {
        throw new Error("ELEVENLABS_API_KEY is not configured");
      }

      const appUrl = process.env.NEXT_PUBLIC_APP_URL;
      if (!appUrl) {
        throw new Error("NEXT_PUBLIC_APP_URL is not configured");
      }

      const corePrompt = buildAvaCorePrompt({
        clinic_name: clinicData.name || "Clinic",
        clinic_email: clinicData.email || "info@clinic.com",
        clinic_phone: clinicData.receptionPhone || "",
      });

      const knowledgeEntries = clinicData.ava?.knowledge || [];
      const knowledgeDoc = compileKnowledgeDocument(knowledgeEntries);
      const systemPrompt = knowledgeDoc
        ? `${corePrompt}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nCLINIC KNOWLEDGE BASE\n\n${knowledgeDoc}`
        : corePrompt;

      toolIds = await createAvaTools(appUrl, ELEVENLABS_API_KEY);
      agentId = await createAvaAgent(
        {
          clinicName: clinicData.name || "Clinic",
          systemPrompt,
          voiceId: process.env.ELEVENLABS_VOICE_ID ?? "OnKmvBo8ZskQurHsyps5",
          appUrl,
          apiKey: ELEVENLABS_API_KEY,
        },
        toolIds,
      );
    }

    // 2. Buy a UK number, wiring its voiceUrl to our inbound-call proxy so
    //    multi-tenant routing, the pause toggle, red-flag triggers, and
    //    LangGraph 2-tier routing all run before the call reaches ElevenLabs.
    const appUrlForWebhook = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrlForWebhook) {
      throw new Error("NEXT_PUBLIC_APP_URL is not configured");
    }
    const voiceUrl = `${appUrlForWebhook}/api/ava/inbound-call?clinicId=${clinicId}`;
    const { phoneNumber, phoneSid } = await purchaseUkNumber({ locality, voiceUrl });

    // 3. Persist the purchased SID IMMEDIATELY. The number is billed the moment
    //    it is bought; recording the SID before any further step means a crash
    //    here still leaves a paper trail to release or reuse it, and a retry
    //    can detect the half-finished provision instead of buying a second one.
    try {
      await db.collection("clinics").doc(clinicId).update({
        "ava.twilioPhoneSid": phoneSid,
        "ava.config.phone": phoneNumber,
      });
    } catch (persistErr) {
      // If we cannot even record the SID, roll the number back before bailing.
      await releaseTwilioNumber(phoneSid);
      throw persistErr;
    }

    // 4. Finalise. Any failure from here deletes the just-purchased Twilio
    //    number so a retry starts clean (no orphaned billed number).
    try {
      const now = new Date().toISOString();
      await db.collection("clinics").doc(clinicId).update({
        "ava.config.phone": phoneNumber,
        "ava.agent_id": agentId,
        "ava.toolIds": toolIds ?? [],
        "ava.provider": "elevenlabs",
        "ava.twilioPhoneSid": phoneSid,
        // Clinic starts PAUSED. The owner flips ava.enabled via /api/ava/toggle,
        // which is the single source of truth the inbound proxy reads.
        "ava.enabled": false,
        "ava.provisionedAt": now,
        "ava.provisioningInProgress": false,
        "ava.provisioningLockAt": null,
        updatedAt: now,
      });
    } catch (finaliseErr) {
      await releaseTwilioNumber(phoneSid);
      // Wipe the half-written number fields so a retry is not blocked by the
      // "already has a provisioned number" guard.
      await db.collection("clinics").doc(clinicId).update({
        "ava.config.phone": null,
        "ava.twilioPhoneSid": null,
      }).catch(() => { /* best-effort */ });
      throw finaliseErr;
    }

    return NextResponse.json({
      phone: phoneNumber,
      agent_id: agentId,
      message: "Number provisioned and configured successfully",
    });
  } catch (error) {
    // Clear provisioning lock so the user can retry
    if (clinicId) {
      db.collection("clinics").doc(clinicId).update({
        "ava.provisioningInProgress": false,
        "ava.provisioningLockAt": null,
      }).catch(() => { /* best-effort */ });
    }

    console.error("[Ava provision-number error]", error);

    // Auth errors have structured status codes — preserve them
    if (error instanceof ApiAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    // Surface the actual error message (not just "Internal server error")
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const POST = withRequestLog(handler);
