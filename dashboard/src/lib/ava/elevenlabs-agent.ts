/**
 * ElevenLabs Conversational AI agent management helpers.
 *
 * ElevenLabs v1 API format (current):
 *  - Tools are created separately via POST /v1/convai/tools
 *  - Agents reference tool IDs via conversation_config.agent.prompt.tool_ids
 *  - Agent creation: POST /v1/convai/agents
 *  - Agent update:   PATCH /v1/convai/agents/{agent_id}
 */

const ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1";

export interface AvaAgentConfig {
  clinicName: string;
  systemPrompt: string;
  voiceId: string;
  appUrl: string;
  apiKey: string;
}

// ─── Tool creation ────────────────────────────────────────────────────────────

/**
 * Creates the 4 Ava webhook tools in ElevenLabs and returns their IDs.
 * Tools are scoped to the ElevenLabs account — safe to call per-clinic.
 */
export async function createAvaTools(appUrl: string, apiKey: string): Promise<string[]> {
  const toolsUrl = `${appUrl}/api/ava/tools`;
  const transferUrl = `${appUrl}/api/ava/transfer`;

  const toolDefs = [
    {
      name: "check_availability",
      description: "Check clinician availability for a given day or week. Use this BEFORE booking to find open slots. Returns available times that you should read back to the caller.",
      api_schema: {
        url: toolsUrl,
        method: "POST" as const,
        request_headers: {
          Authorization: `Bearer ${process.env.ELEVENLABS_WEBHOOK_SECRET ?? ""}`,
        },
        request_body_schema: {
          type: "object",
          required: [],
          properties: {
            preferred_day: {
              type: "string",
              description: "The day or date to check, e.g. 'Monday', 'tomorrow', 'next Tuesday', or an ISO date like '2026-04-20'.",
            },
            clinician_name: {
              type: "string",
              description: "Name of the specific clinician to check availability for. Omit to check all clinicians.",
            },
          },
        },
      },
    },
    {
      name: "book_appointment",
      description: "Book an appointment for the patient. Only call this AFTER you have confirmed all details with the caller: their name, phone number, the date/time, and which clinician. Read back the full booking details and wait for the caller to confirm before triggering this tool.",
      api_schema: {
        url: toolsUrl,
        method: "POST" as const,
        request_headers: {
          Authorization: `Bearer ${process.env.ELEVENLABS_WEBHOOK_SECRET ?? ""}`,
        },
        request_body_schema: {
          type: "object",
          required: ["patient_first_name", "patient_last_name", "patient_phone", "slot_datetime"],
          properties: {
            patient_first_name: { type: "string", description: "Patient's first name." },
            patient_last_name: { type: "string", description: "Patient's last name." },
            patient_phone: { type: "string", description: "Patient's phone number." },
            patient_email: { type: "string", description: "Patient's email address (optional)." },
            slot_datetime: { type: "string", description: "Confirmed appointment date and time in ISO 8601 format, e.g. '2026-04-20T10:00:00'." },
            clinician_name: { type: "string", description: "Name of the clinician to book with (optional)." },
            appointment_type: { type: "string", description: "Type of appointment.", enum: ["initial_assessment", "follow_up"] },
          },
        },
      },
    },
    {
      name: "update_booking",
      description: "Cancel or reschedule an existing appointment. Ask the caller for their booking reference or look it up by their name.",
      api_schema: {
        url: toolsUrl,
        method: "POST" as const,
        request_headers: {
          Authorization: `Bearer ${process.env.ELEVENLABS_WEBHOOK_SECRET ?? ""}`,
        },
        request_body_schema: {
          type: "object",
          required: ["action", "booking_id"],
          properties: {
            action: { type: "string", description: "Whether to cancel or reschedule the appointment.", enum: ["cancel", "reschedule"] },
            booking_id: { type: "string", description: "The booking reference or appointment ID." },
            new_datetime: { type: "string", description: "New date and time in ISO 8601 format (required for reschedule)." },
          },
        },
      },
    },
    {
      name: "transfer_to_reception",
      description: "Transfer the caller to the clinic reception desk. Use when the caller has a complaint, wants to speak to a manager, or needs human assistance you cannot provide. Say 'Let me put you through to someone who can help right away' before triggering this tool.",
      api_schema: {
        url: transferUrl,
        method: "POST" as const,
        request_body_schema: {
          type: "object",
          required: [],
          properties: {
            reason: { type: "string", description: "Brief reason for the transfer (optional)." },
          },
        },
      },
    },
  ];

  const toolIds: string[] = [];

  for (const tool of toolDefs) {
    const res = await fetch(`${ELEVENLABS_API_URL}/convai/tools`, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: tool.name,
        description: tool.description,
        type: "webhook",
        tool_config: {
          type: "webhook",
          name: tool.name,
          description: tool.description,
          api_schema: tool.api_schema,
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`ElevenLabs tool creation failed for '${tool.name}' (${res.status}): ${body}`);
    }

    const data = await res.json();
    toolIds.push(data.id as string);
  }

  return toolIds;
}

// ─── Agent creation ──────────────────────────────────────────────────────────

/**
 * Creates a new ElevenLabs Conversational AI agent.
 * Returns the new agent_id.
 */
export async function createAvaAgent(config: AvaAgentConfig, toolIds: string[]): Promise<string> {
  const res = await fetch(`${ELEVENLABS_API_URL}/convai/agents/create`, {
    method: "POST",
    headers: { "xi-api-key": config.apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(buildAgentPayload(config, toolIds)),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ElevenLabs agent creation failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  return data.agent_id as string;
}

/**
 * Updates an existing ElevenLabs Conversational AI agent.
 */
export async function updateAvaAgent(
  agentId: string,
  config: Partial<AvaAgentConfig> & Pick<AvaAgentConfig, "apiKey">,
  toolIds?: string[],
): Promise<void> {
  const payload: Record<string, unknown> = {};

  if (config.clinicName !== undefined || config.systemPrompt !== undefined || toolIds !== undefined) {
    const promptPatch: Record<string, unknown> = {};
    if (config.systemPrompt !== undefined) promptPatch.prompt = config.systemPrompt;
    if (toolIds !== undefined) promptPatch.tool_ids = toolIds;

    payload.conversation_config = {
      agent: {
        ...(config.clinicName !== undefined ? { first_message: null } : {}),
        prompt: promptPatch,
        language: "en",
      },
      ...(config.voiceId !== undefined
        ? { tts: { voice_id: config.voiceId } }
        : {}),
    };
  }

  if (config.clinicName !== undefined) {
    payload.name = `${config.clinicName} - Ava`;
  }

  const res = await fetch(`${ELEVENLABS_API_URL}/convai/agents/${agentId}`, {
    method: "PATCH",
    headers: { "xi-api-key": config.apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ElevenLabs agent update failed (${res.status}): ${body}`);
  }
}

// ─── Knowledge base ──────────────────────────────────────────────────────────

export interface KnowledgeBaseLocator {
  type: "file" | "url" | "text" | "folder";
  name: string;
  id: string;
  usage_mode?: "auto" | "prompt";
}

/**
 * Upload a single text document to the ElevenLabs Knowledge Base.
 * Returns the new document's id, which can be attached to one or more agents.
 */
export async function uploadKnowledgeBaseText(
  apiKey: string,
  name: string,
  text: string,
): Promise<string> {
  const res = await fetch(`${ELEVENLABS_API_URL}/convai/knowledge-base/text`, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ name, text }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ElevenLabs KB text upload failed for "${name}" (${res.status}): ${body}`);
  }

  const data = await res.json();
  if (!data.id) {
    throw new Error(`ElevenLabs KB text upload returned no id for "${name}"`);
  }
  return data.id as string;
}

/**
 * Delete a single Knowledge Base document by id. Failures are swallowed and
 * surfaced as a boolean, since stale/missing IDs are an expected condition
 * during cleanup before a re-sync.
 */
export async function deleteKnowledgeBaseDoc(apiKey: string, docId: string): Promise<boolean> {
  try {
    const res = await fetch(`${ELEVENLABS_API_URL}/convai/knowledge-base/${docId}`, {
      method: "DELETE",
      headers: { "xi-api-key": apiKey },
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Attach an array of KB document IDs to an agent's prompt.knowledge_base.
 * This REPLACES the existing list (not append) — caller is responsible for
 * deleting orphaned docs first if doing a re-sync.
 */
export async function setAgentKnowledgeBase(
  apiKey: string,
  agentId: string,
  knowledgeBase: KnowledgeBaseLocator[],
): Promise<void> {
  const res = await fetch(`${ELEVENLABS_API_URL}/convai/agents/${agentId}`, {
    method: "PATCH",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      conversation_config: {
        agent: {
          prompt: { knowledge_base: knowledgeBase },
        },
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ElevenLabs agent knowledge_base update failed (${res.status}): ${body}`);
  }
}

/**
 * Fetch the current agent config — used after a sync to verify the
 * knowledge_base field is populated as expected.
 */
export async function getAgent(apiKey: string, agentId: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${ELEVENLABS_API_URL}/convai/agents/${agentId}`, {
    method: "GET",
    headers: { "xi-api-key": apiKey },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ElevenLabs agent fetch failed (${res.status}): ${body}`);
  }

  return res.json();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildAgentPayload(config: AvaAgentConfig, toolIds: string[]) {
  return {
    name: `${config.clinicName} - Ava`,
    conversation_config: {
      agent: {
        prompt: {
          prompt: config.systemPrompt,
          llm: "gemini-2.5-flash-lite",
          tool_ids: toolIds,
        },
        language: "en",
      },
      tts: {
        voice_id: config.voiceId,
      },
    },
  };
}
