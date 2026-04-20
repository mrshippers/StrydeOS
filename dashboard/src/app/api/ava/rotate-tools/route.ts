import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyApiRequest, requireRole, handleApiError } from "@/lib/auth-guard";
import { buildAvaCorePrompt } from "@/lib/ava/ava-core-prompt";
import { compileKnowledgeDocument, type KnowledgeEntry } from "@/lib/ava/ava-knowledge";
import { withRequestLog } from "@/lib/request-logger";
import {
  createAvaTools,
  deleteAvaTool,
  updateAvaAgent,
} from "@/lib/ava/elevenlabs-agent";

/**
 * POST /api/ava/rotate-tools
 *
 * Rotates the clinic's ElevenLabs tool definitions so they pick up the
 * current ELEVENLABS_WEBHOOK_SECRET Bearer token. ElevenLabs bakes request
 * headers into the tool definition at creation time — if the secret was
 * empty or different when the tools were originally created, every tool
 * call returns 401 against /api/ava/tools until the tools are rebuilt.
 *
 * Steps:
 *   1. Delete existing tool IDs from ElevenLabs (best-effort)
 *   2. Recreate the 4 Ava tools with the live env secret
 *   3. PATCH the agent with:
 *        - new tool_ids
 *        - canonical voice_id (resets end-call voice drift)
 *        - freshly built system prompt + knowledge
 *   4. Persist new tool IDs to Firestore
 *
 * Requires: owner / admin / superadmin role.
 */

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const DEFAULT_VOICE_ID = process.env.ELEVENLABS_VOICE_ID ?? "OnKmvBo8ZskQurHsyps5";

async function handler(req: NextRequest) {
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

    if (!ELEVENLABS_API_KEY) {
      return NextResponse.json({ error: "ELEVENLABS_API_KEY is not configured" }, { status: 500 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) {
      return NextResponse.json({ error: "NEXT_PUBLIC_APP_URL is not configured" }, { status: 500 });
    }

    if (!process.env.ELEVENLABS_WEBHOOK_SECRET) {
      return NextResponse.json(
        { error: "ELEVENLABS_WEBHOOK_SECRET is not configured — nothing to rotate into" },
        { status: 500 }
      );
    }

    const clinicDoc = await db.collection("clinics").doc(clinicId).get();
    if (!clinicDoc.exists) {
      return NextResponse.json({ error: "Clinic not found" }, { status: 404 });
    }
    const clinicData = clinicDoc.data();
    if (!clinicData) {
      return NextResponse.json({ error: "Clinic data is empty" }, { status: 400 });
    }

    const avaConfig = clinicData.ava;
    const agentId: string | undefined = avaConfig?.agent_id;
    if (!agentId) {
      return NextResponse.json(
        { error: "No ElevenLabs agent exists for this clinic — run provision-number first" },
        { status: 400 }
      );
    }

    const existingToolIds: string[] = Array.isArray(avaConfig?.toolIds) ? avaConfig.toolIds : [];

    // 1. Delete existing tools (best-effort — 404s are fine)
    const deletions = await Promise.all(
      existingToolIds.map(async (id) => ({ id, ok: await deleteAvaTool(ELEVENLABS_API_KEY!, id) })),
    );

    // 2. Recreate tools with the current env secret baked in
    const newToolIds = await createAvaTools(appUrl, ELEVENLABS_API_KEY!);

    // 3. Re-patch the agent with fresh prompt + voice + new tool_ids.
    //    Re-applying voice_id here also resets any drifted end-call voice config.
    const corePrompt = buildAvaCorePrompt({
      clinic_name: clinicData.name || "Clinic",
      clinic_email: clinicData.email || "info@clinic.com",
      clinic_phone: clinicData.receptionPhone || avaConfig?.config?.phone || "",
    });
    const knowledgeEntries: KnowledgeEntry[] = avaConfig?.knowledge || [];
    const knowledgeDoc = compileKnowledgeDocument(knowledgeEntries);
    const systemPrompt = knowledgeDoc
      ? `${corePrompt}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nCLINIC KNOWLEDGE BASE\n\n${knowledgeDoc}`
      : corePrompt;

    await updateAvaAgent(
      agentId,
      {
        clinicName: clinicData.name || "Clinic",
        systemPrompt,
        voiceId: DEFAULT_VOICE_ID,
        appUrl,
        apiKey: ELEVENLABS_API_KEY!,
      },
      newToolIds,
    );

    // 4. Persist new state
    await db.collection("clinics").doc(clinicId).update({
      "ava.toolIds": newToolIds,
      "ava.toolsRotatedAt": new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      agent_id: agentId,
      deleted: deletions,
      new_tool_ids: newToolIds,
      voice_id: DEFAULT_VOICE_ID,
      message: "Tools rotated and agent re-synced",
    });
  } catch (error) {
    console.error("[Ava rotate-tools error]", error);
    return handleApiError(error);
  }
}

export const POST = withRequestLog(handler);
