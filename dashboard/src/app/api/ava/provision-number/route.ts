import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyApiRequest, requireRole, handleApiError } from "@/lib/auth-guard";
import { purchaseUkNumber, getPhoneNumberSid, configureSipTrunk } from "@/lib/twilio";
import { withRequestLog } from "@/lib/request-logger";

/**
 * POST /api/ava/provision-number
 *
 * Provisions a dedicated Twilio phone number for the clinic's Ava instance:
 * 1. Buys a UK number (near clinic locality if possible)
 * 2. Creates ElevenLabs agent if one doesn't exist yet
 * 3. Configures SIP trunk to route inbound calls to ElevenLabs
 * 4. Stores the number + trunk SID in Firestore
 * 5. Returns the provisioned number
 *
 * Requires: owner / admin / superadmin role.
 */
async function handler(req: NextRequest) {
  // Strict rate limit — this costs money
  const { limited, remaining } = checkRateLimit(req, { limit: 2, windowMs: 60_000 });
  if (limited) {
    return NextResponse.json(
      { error: "Too many requests. Number provisioning is rate-limited." },
      { status: 429, headers: { "X-RateLimit-Remaining": String(remaining) } }
    );
  }

  try {
    const db = getAdminDb();
    const user = await verifyApiRequest(req);
    requireRole(user, ["owner", "admin", "superadmin"]);
    const clinicId = user.clinicId;

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

    // Guard: don't provision if a number is already assigned
    // Use a Firestore transaction to prevent race conditions (double-purchase)
    const existingPhone = clinicData.phone || clinicData.ava?.config?.phone;
    const existingTrunk = clinicData.ava?.twilioTrunkSid;
    if (existingPhone && existingTrunk) {
      return NextResponse.json(
        { error: "This clinic already has a provisioned number", phone: existingPhone },
        { status: 409 }
      );
    }

    // Double-check via transaction to prevent TOCTOU race
    const alreadyProvisioned = await db.runTransaction(async (txn) => {
      const freshDoc = await txn.get(db.collection("clinics").doc(clinicId));
      const freshData = freshDoc.data();
      if (freshData?.ava?.twilioTrunkSid) return true;
      // Set a provisioning lock so concurrent requests see it
      txn.update(db.collection("clinics").doc(clinicId), {
        "ava.provisioningInProgress": true,
      });
      return false;
    });

    if (alreadyProvisioned) {
      return NextResponse.json(
        { error: "This clinic already has a provisioned number" },
        { status: 409 }
      );
    }

    // 1. Purchase UK number
    const phoneNumber = await purchaseUkNumber({ locality });

    // 2. Get the phone number SID (needed for SIP trunk association)
    const phoneSid = await getPhoneNumberSid(phoneNumber);

    // 3. Ensure ElevenLabs agent exists
    let agentId = clinicData.ava?.agent_id;
    if (!agentId) {
      // Create the agent via internal call to the agent route
      // We'll do it inline to avoid an extra HTTP round-trip
      const { buildAvaCorePrompt } = await import("@/lib/ava/ava-core-prompt");
      const { compileKnowledgeDocument } = await import("@/lib/ava/ava-knowledge");
      const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
      if (!ELEVENLABS_API_KEY) {
        return NextResponse.json({ error: "ELEVENLABS_API_KEY is not configured" }, { status: 500 });
      }
      const ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1";

      const corePrompt = buildAvaCorePrompt({
        clinic_name: clinicData.name || "Clinic",
        clinic_email: clinicData.email || "info@clinic.com",
        clinic_phone: clinicData.receptionPhone || phoneNumber,
      });

      const knowledgeEntries = clinicData.ava?.knowledge || [];
      const knowledgeDoc = compileKnowledgeDocument(knowledgeEntries);
      const systemPrompt = knowledgeDoc
        ? `${corePrompt}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nCLINIC KNOWLEDGE BASE\n\n${knowledgeDoc}`
        : corePrompt;

      const appUrl = process.env.NEXT_PUBLIC_APP_URL;
      const webhookUrl = `${appUrl}/api/webhooks/elevenlabs`;
      const toolsUrl = `${appUrl}/api/ava/tools`;
      const transferUrl = `${appUrl}/api/ava/transfer`;

      const agentResponse = await fetch(`${ELEVENLABS_API_URL}/convai/agents`, {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY || "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: `${clinicData.name || "Clinic"} - Ava`,
          system_prompt: systemPrompt,
          voice_id: process.env.ELEVENLABS_VOICE_ID ?? "OnKmvBo8ZskQurHsyps5",
          webhook_url: webhookUrl,
          language: "en",
          tools: [
            { name: "check_availability", description: "Check clinician availability for a given day or week. Use this BEFORE booking to find open slots.", webhook_url: toolsUrl },
            { name: "book_appointment", description: "Book an appointment for the patient. Only call this AFTER confirming all details with the caller.", webhook_url: toolsUrl },
            { name: "update_booking", description: "Cancel or reschedule an existing appointment.", webhook_url: toolsUrl },
            { name: "transfer_to_reception", description: "Transfer the caller to the clinic reception desk. Use when the caller has a complaint, wants to speak to a manager, or needs human assistance.", webhook_url: transferUrl },
          ],
        }),
      });

      if (!agentResponse.ok) {
        const error = await agentResponse.json();
        throw new Error(`ElevenLabs agent creation failed: ${JSON.stringify(error)}`);
      }

      const agentData = await agentResponse.json();
      agentId = agentData.agent_id;
    }

    // 4. Configure SIP trunk (Twilio → ElevenLabs)
    const trunkSid = await configureSipTrunk({
      phoneNumber,
      phoneSid,
      agentId: agentId as string,
      clinicName: clinicData.name || "Clinic",
    });

    // 5. Write everything to Firestore atomically
    const now = new Date().toISOString();
    await db.collection("clinics").doc(clinicId).update({
      phone: phoneNumber,
      "ava.config.phone": phoneNumber,
      "ava.agent_id": agentId,
      "ava.provider": "elevenlabs",
      "ava.twilioPhoneSid": phoneSid,
      "ava.twilioTrunkSid": trunkSid,
      "ava.provisionedAt": now,
      updatedAt: now,
    });

    return NextResponse.json({
      phone: phoneNumber,
      agent_id: agentId,
      trunk_sid: trunkSid,
      message: "Number provisioned and SIP trunk configured successfully",
    });
  } catch (error) {
    console.error("[Ava provision-number error]", error);
    return handleApiError(error);
  }
}

export const POST = withRequestLog(handler);
