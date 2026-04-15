/**
 * One-off: assign the existing +442045727044 Twilio number to clinic-spires
 * end-to-end. Idempotent — safe to re-run.
 *
 * Steps:
 *   1. Ensure ElevenLabs Ava agent exists for Spires (create if missing)
 *   2. Look up Twilio SID for +442045727044
 *   3. Set that number's voiceUrl to the inbound-call TwiML endpoint
 *   4. Write ava.config.phone / ava.agent_id / ava.twilioPhoneSid to Firestore
 *
 * Usage: npx tsx scripts/assign-spires-number.ts
 */

import * as admin from "firebase-admin";
import * as path from "path";
import * as fs from "fs";
import twilio from "twilio";
import { config as loadEnv } from "dotenv";
import { createAvaTools, createAvaAgent } from "../src/lib/ava/elevenlabs-agent";

loadEnv({ path: path.resolve(__dirname, "..", ".env.local") });

const CLINIC_ID = "clinic-spires";
const PHONE_NUMBER = "+442045727044";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.strydeos.com";
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID ?? "OnKmvBo8ZskQurHsyps5";
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;

if (!ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY not set");
if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) throw new Error("TWILIO_ACCOUNT_SID/AUTH_TOKEN not set");

// ─── Firebase Admin init ──────────────────────────────────────────
// Prefer env (matches production), fall back to serviceAccountKey.json, then ADC.
const saPath = path.resolve(__dirname, "serviceAccountKey.json");
if (!admin.apps.length) {
  if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: "clinical-tracker-spires",
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      }),
    });
  } else if (fs.existsSync(saPath)) {
    const sa = JSON.parse(fs.readFileSync(saPath, "utf-8"));
    admin.initializeApp({ credential: admin.credential.cert(sa) });
  } else {
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
  }
}
const db = admin.firestore();
const tw = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

async function ensureAgent(clinicData: FirebaseFirestore.DocumentData): Promise<{ agentId: string; toolIds: string[] }> {
  const existing = clinicData.ava?.agent_id as string | undefined;
  const existingToolIds = clinicData.ava?.toolIds as string[] | undefined;
  if (existing && existingToolIds?.length) {
    console.log(`✓ Reusing existing ElevenLabs agent: ${existing}`);
    return { agentId: existing, toolIds: existingToolIds };
  }

  console.log("Creating new ElevenLabs agent for Spires...");

  const { buildAvaCorePrompt } = await import("../src/lib/ava/ava-core-prompt");
  const { compileKnowledgeDocument } = await import("../src/lib/ava/ava-knowledge");

  const corePrompt = buildAvaCorePrompt({
    clinic_name: clinicData.name || "Spires Physiotherapy",
    clinic_email: clinicData.email || "info@spiresphysiotherapy.com",
    clinic_phone: clinicData.receptionPhone || PHONE_NUMBER,
  });

  const knowledgeEntries = clinicData.ava?.knowledge || [];
  const knowledgeDoc = compileKnowledgeDocument(knowledgeEntries);
  const systemPrompt = knowledgeDoc
    ? `${corePrompt}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nCLINIC KNOWLEDGE BASE\n\n${knowledgeDoc}`
    : corePrompt;

  const toolIds = await createAvaTools(APP_URL, ELEVENLABS_API_KEY!);
  console.log(`✓ Created ${toolIds.length} ElevenLabs tools`);

  const agentId = await createAvaAgent(
    {
      clinicName: clinicData.name || "Spires Physiotherapy",
      systemPrompt,
      voiceId: ELEVENLABS_VOICE_ID,
      appUrl: APP_URL,
      apiKey: ELEVENLABS_API_KEY!,
    },
    toolIds,
  );
  console.log(`✓ Created ElevenLabs agent: ${agentId}`);
  return { agentId, toolIds };
}

async function main() {
  console.log(`→ Assigning ${PHONE_NUMBER} to ${CLINIC_ID}\n`);

  const docRef = db.collection("clinics").doc(CLINIC_ID);
  const snap = await docRef.get();
  if (!snap.exists) throw new Error(`Clinic not found: ${CLINIC_ID}`);
  const clinicData = snap.data()!;

  // Refuse to overwrite a different already-provisioned number
  const existingPhone = clinicData.ava?.config?.phone;
  if (existingPhone && existingPhone !== PHONE_NUMBER) {
    throw new Error(
      `Clinic already has a different Ava number: ${existingPhone}. Release it first.`
    );
  }

  // 1. Ensure agent exists
  const { agentId, toolIds } = await ensureAgent(clinicData);

  // 2. Look up the Twilio SID for PHONE_NUMBER
  const twNumbers = await tw.incomingPhoneNumbers.list({ phoneNumber: PHONE_NUMBER, limit: 1 });
  if (!twNumbers.length) {
    throw new Error(`Twilio number ${PHONE_NUMBER} not found in this account`);
  }
  const phoneSid = twNumbers[0].sid;
  console.log(`✓ Found Twilio phone SID: ${phoneSid}`);

  // 3. Wire the voiceUrl to the inbound-call TwiML endpoint
  const voiceUrl = `${APP_URL}/api/ava/inbound-call?clinicId=${CLINIC_ID}`;
  await tw.incomingPhoneNumbers(phoneSid).update({
    voiceUrl,
    voiceMethod: "POST",
    friendlyName: `StrydeOS Ava — ${clinicData.name || "Spires"}`,
  });
  console.log(`✓ Set voiceUrl → ${voiceUrl}`);

  // 4. Write Firestore state
  const now = new Date().toISOString();
  await docRef.update({
    "ava.config.phone": PHONE_NUMBER,
    "ava.agent_id": agentId,
    "ava.toolIds": toolIds,
    "ava.provider": "elevenlabs",
    "ava.twilioPhoneSid": phoneSid,
    "ava.provisionedAt": now,
    "ava.provisioningInProgress": false,
    "ava.provisioningLockAt": null,
    updatedAt: now,
  });
  console.log(`✓ Firestore updated`);

  console.log(`\n✔ ${CLINIC_ID} is now wired to ${PHONE_NUMBER} → agent ${agentId}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("FAILED:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
