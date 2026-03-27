import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyApiRequest, handleApiError } from "@/lib/auth-guard";
import { buildAvaCorePrompt } from "@/lib/ava/ava-core-prompt";
import {
  compileKnowledgeDocument,
  compileKnowledgeChunks,
  type KnowledgeEntry,
} from "@/lib/ava/ava-knowledge";
import { withRequestLog } from "@/lib/request-logger";

const db = getAdminDb();
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1";

/**
 * Sync clinic knowledge base to ElevenLabs agent.
 *
 * Primary path: Upload knowledge chunks to ElevenLabs KB API for semantic retrieval.
 * Fallback: Append compiled knowledge to the system prompt if KB API fails.
 */
async function handler(req: NextRequest) {
  try {
    const user = await verifyApiRequest(req);
    const clinicId = user.clinicId;

    if (!clinicId) {
      return NextResponse.json(
        { error: "No clinic associated with user" },
        { status: 400 },
      );
    }

    // Fetch clinic data
    const clinicDoc = await db.collection("clinics").doc(clinicId).get();
    if (!clinicDoc.exists) {
      return NextResponse.json({ error: "Clinic not found" }, { status: 404 });
    }

    const clinicData = clinicDoc.data();
    if (!clinicData) {
      return NextResponse.json(
        { error: "Clinic data is empty" },
        { status: 400 },
      );
    }

    const avaConfig = clinicData.ava;
    if (!avaConfig?.agent_id) {
      return NextResponse.json(
        { error: "Ava agent not set up — create agent first" },
        { status: 400 },
      );
    }

    const entries: KnowledgeEntry[] = avaConfig.knowledge || [];
    const agentId = avaConfig.agent_id;
    const now = new Date().toISOString();

    let syncMethod: "knowledge_base" | "system_prompt_fallback" =
      "knowledge_base";

    // Try ElevenLabs Knowledge Base API first
    try {
      const chunks = compileKnowledgeChunks(entries);

      // Clear existing KB documents if we have stored IDs
      const existingDocIds: string[] = avaConfig.elevenLabsKbDocIds || [];
      for (const docId of existingDocIds) {
        try {
          await fetch(
            `${ELEVENLABS_API_URL}/convai/agents/${agentId}/knowledge-base/${docId}`,
            {
              method: "DELETE",
              headers: { "xi-api-key": ELEVENLABS_API_KEY || "" },
            },
          );
        } catch {
          // Ignore delete failures — document may already be gone
        }
      }

      // Upload each category as a separate KB document
      const newDocIds: string[] = [];

      for (const chunk of chunks) {
        const response = await fetch(
          `${ELEVENLABS_API_URL}/convai/agents/${agentId}/add-to-knowledge-base`,
          {
            method: "POST",
            headers: {
              "xi-api-key": ELEVENLABS_API_KEY || "",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              text: chunk.content,
              name: chunk.name,
            }),
          },
        );

        if (!response.ok) {
          const errBody = await response.text();
          throw new Error(
            `ElevenLabs KB upload failed for "${chunk.name}": ${errBody}`,
          );
        }

        const data = await response.json();
        if (data.id) {
          newDocIds.push(data.id);
        }
      }

      // Store KB document IDs for future cleanup
      await db.collection("clinics").doc(clinicId).update({
        "ava.elevenLabsKbDocIds": newDocIds,
        "ava.knowledgeLastSyncedAt": now,
        updatedAt: now,
      });
    } catch (kbError) {
      console.error(
        "[Ava KB sync] ElevenLabs KB API failed, falling back to system prompt",
        kbError,
      );
      syncMethod = "system_prompt_fallback";

      // Fallback: compile knowledge into system prompt
      const corePrompt = buildAvaCorePrompt({
        clinic_name: clinicData.name || "Clinic",
        clinic_email: clinicData.email || "info@clinic.com",
        clinic_phone: avaConfig.config?.phone || "",
      });

      const knowledgeDoc = compileKnowledgeDocument(entries);
      const fullPrompt = knowledgeDoc
        ? `${corePrompt}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nCLINIC KNOWLEDGE BASE\n\n${knowledgeDoc}`
        : corePrompt;

      // Update agent system prompt with knowledge appended
      const response = await fetch(
        `${ELEVENLABS_API_URL}/convai/agents/${agentId}`,
        {
          method: "PATCH",
          headers: {
            "xi-api-key": ELEVENLABS_API_KEY || "",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ system_prompt: fullPrompt }),
        },
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          `ElevenLabs agent update failed: ${JSON.stringify(error)}`,
        );
      }

      await db.collection("clinics").doc(clinicId).update({
        "ava.knowledgeLastSyncedAt": now,
        updatedAt: now,
      });
    }

    return NextResponse.json({
      message: "Knowledge base synced successfully",
      syncMethod,
      syncedAt: now,
      entriesCount: entries.length,
    });
  } catch (error) {
    console.error("[Ava knowledge sync error]", error);
    return handleApiError(error);
  }
}

export const POST = withRequestLog(handler);
