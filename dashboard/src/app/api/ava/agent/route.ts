import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyApiRequest, requireRole, handleApiError } from "@/lib/auth-guard";
import { buildAvaCorePrompt } from "@/lib/ava/ava-core-prompt";
import { compileKnowledgeDocument, type KnowledgeEntry } from "@/lib/ava/ava-knowledge";
import { withRequestLog } from "@/lib/request-logger";
import { createAvaTools, createAvaAgent, updateAvaAgent } from "@/lib/ava/elevenlabs-agent";

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

const DEFAULT_VOICE_ID = process.env.ELEVENLABS_VOICE_ID ?? "OnKmvBo8ZskQurHsyps5";

async function handler(req: NextRequest) {
  // Rate limit: 5 requests per IP per 60 seconds
  const { limited, remaining } = checkRateLimit(req, { limit: 5, windowMs: 60_000 });
  if (limited) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
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

    // Fetch clinic config
    const clinicDoc = await db.collection("clinics").doc(clinicId).get();
    if (!clinicDoc.exists) {
      return NextResponse.json({ error: "Clinic not found" }, { status: 404 });
    }

    const clinicData = clinicDoc.data();
    if (!clinicData) {
      return NextResponse.json({ error: "Clinic data is empty" }, { status: 400 });
    }

    if (!ELEVENLABS_API_KEY) {
      return NextResponse.json({ error: "ELEVENLABS_API_KEY is not configured" }, { status: 500 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) {
      return NextResponse.json({ error: "NEXT_PUBLIC_APP_URL is not configured" }, { status: 500 });
    }

    const avaConfig = clinicData.ava;

    if (!avaConfig?.config) {
      return NextResponse.json({ error: "Ava config not set up" }, { status: 400 });
    }

    // Build behavioral-only system prompt (clinic knowledge is in the KB)
    const corePrompt = buildAvaCorePrompt({
      clinic_name: clinicData.name || "Clinic",
      clinic_email: clinicData.email || "info@clinic.com",
      clinic_phone: clinicData.receptionPhone || avaConfig.config?.phone || "",
    });

    // If knowledge entries exist, compile and append as fallback context
    // (primary path is ElevenLabs KB via /api/ava/knowledge, but we include
    // a baseline in the system prompt so Ava always has access to key facts)
    const knowledgeEntries: KnowledgeEntry[] = avaConfig.knowledge || [];
    const knowledgeDoc = compileKnowledgeDocument(knowledgeEntries);
    const systemPrompt = knowledgeDoc
      ? `${corePrompt}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nCLINIC KNOWLEDGE BASE\n\n${knowledgeDoc}`
      : corePrompt;

    const agentConfig = {
      clinicName: clinicData.name || "Clinic",
      systemPrompt,
      voiceId: DEFAULT_VOICE_ID,
      appUrl,
      apiKey: ELEVENLABS_API_KEY,
    };

    let agentId = avaConfig.agent_id;
    let toolIds: string[] = avaConfig.toolIds ?? [];

    // Create or update agent
    if (!agentId) {
      toolIds = await createAvaTools(appUrl, ELEVENLABS_API_KEY);
      agentId = await createAvaAgent(agentConfig, toolIds);
    } else {
      // For updates: reuse existing tool IDs, just update the system prompt
      await updateAvaAgent(agentId, agentConfig, toolIds.length ? toolIds : undefined);
    }

    // Store agent ID and tool IDs in Firestore
    await db.collection("clinics").doc(clinicId).update({
      "ava.agent_id": agentId,
      "ava.toolIds": toolIds,
      "ava.provider": "elevenlabs",
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json(
      { agent_id: agentId, message: "Agent created/updated successfully" },
      { status: 200 }
    );
  } catch (error) {
    console.error("[Ava agent creation error]", error);
    return handleApiError(error);
  }
}

export const POST = withRequestLog(handler);
