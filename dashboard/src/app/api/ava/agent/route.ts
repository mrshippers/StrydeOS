import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyApiRequest, requireRole, handleApiError } from "@/lib/auth-guard";
import { buildAvaCorePrompt } from "@/lib/ava/ava-core-prompt";
import { compileKnowledgeDocument, type KnowledgeEntry } from "@/lib/ava/ava-knowledge";
import { withRequestLog } from "@/lib/request-logger";

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1";

const DEFAULT_VOICE_ID = process.env.ELEVENLABS_VOICE_ID ?? "OnKmvBo8ZskQurHsyps5";

interface ElevenAgentsConfig {
  name: string;
  system_prompt: string;
  voice_id: string;
  webhook_url: string;
  tools: Array<{
    name: string;
    description: string;
    webhook_url: string;
  }>;
}

async function createAgent(config: ElevenAgentsConfig): Promise<string> {
  const response = await fetch(`${ELEVENLABS_API_URL}/convai/agents`, {
    method: "POST",
    headers: {
      "xi-api-key": ELEVENLABS_API_KEY || "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: config.name,
      system_prompt: config.system_prompt,
      voice_id: config.voice_id,
      webhook_url: config.webhook_url,
      tools: config.tools,
      language: "en",
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`ElevenLabs API error: ${JSON.stringify(error)}`);
  }

  const data = await response.json();
  return data.agent_id;
}

async function updateAgent(agentId: string, config: Partial<ElevenAgentsConfig>): Promise<void> {
  const response = await fetch(`${ELEVENLABS_API_URL}/convai/agents/${agentId}`, {
    method: "PATCH",
    headers: {
      "xi-api-key": ELEVENLABS_API_KEY || "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(config),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`ElevenLabs API error: ${JSON.stringify(error)}`);
  }
}

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

    const webhookUrl = `${appUrl}/api/webhooks/elevenlabs`;

    const agentConfig: ElevenAgentsConfig = {
      name: `${clinicData.name || "Clinic"} - Ava`,
      system_prompt: systemPrompt,
      voice_id: DEFAULT_VOICE_ID,
      webhook_url: webhookUrl,
      tools: [
        {
          name: "book_appointment",
          description: "Book an appointment for the patient",
          webhook_url: webhookUrl,
        },
        {
          name: "check_availability",
          description: "Check clinician availability",
          webhook_url: webhookUrl,
        },
        {
          name: "update_booking",
          description: "Reschedule or cancel an appointment",
          webhook_url: webhookUrl,
        },
        {
          name: "transfer_to_reception",
          description: "Transfer the caller to the clinic reception desk. Use when the caller has a complaint, wants to speak to a manager, or needs human assistance that you cannot provide. Say 'Let me put you through to someone who can help right away' before triggering this tool.",
          webhook_url: `${appUrl}/api/ava/transfer`,
        },
      ],
    };

    let agentId = avaConfig.agent_id;

    // Create or update agent
    if (!agentId) {
      // New agent
      agentId = await createAgent(agentConfig);
    } else {
      // Update existing agent
      await updateAgent(agentId, agentConfig);
    }

    // Store agent ID in Firestore
    await db.collection("clinics").doc(clinicId).update({
      "ava.agent_id": agentId,
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
