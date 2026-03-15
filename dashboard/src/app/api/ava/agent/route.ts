import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { initializeApp, getApps } from "firebase-admin/app";
import { buildAvaPrompt } from "@/lib/retell/ava-prompt";

// Ensure Firebase Admin is initialized
if (!getApps().length) {
  initializeApp();
}

const db = getFirestore();
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1";

// Voice ID for ElevenLabs (can be customizable per clinic)
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // English (US) - Professional

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

export async function POST(req: NextRequest) {
  try {
    // Extract clinicId from Authorization header (Firebase token)
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.slice(7);
    const decodedToken = await getAuth().verifyIdToken(token);
    const clinicId = decodedToken.custom_claims?.clinicId;

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

    const avaConfig = clinicData.ava;

    if (!avaConfig?.config) {
      return NextResponse.json({ error: "Ava config not set up" }, { status: 400 });
    }

    // Build system prompt with clinic-specific variables
    const systemPrompt = buildAvaPrompt({
      clinic_name: clinicData.name || "Clinic",
      clinic_address: avaConfig.config.address || "",
      nearest_station: avaConfig.config.nearest_station || "",
      parking_info: avaConfig.config.parking_info || "",
      ia_price: avaConfig.config.ia_price || "85",
      fu_price: avaConfig.config.fu_price || "65",
      clinic_email: clinicData.email || "info@clinic.com",
      clinic_phone: avaConfig.config.phone || "",
      clinician_availability: clinicData.availability || "",
    });

    const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://localhost:3000"}/api/webhooks/elevenlabs`;

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
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to create/update agent",
      },
      { status: 500 }
    );
  }
}
