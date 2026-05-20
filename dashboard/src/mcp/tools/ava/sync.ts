import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import type { ToolContext, ToolResult } from "../../types";

export const inputSchema = z.object({}).strict();
export type Input = z.infer<typeof inputSchema>;

interface Data {
  clinicId: string;
  triggeredAt: string;
  mechanism: "onClinicWrite-trigger";
  expectedSyncWithinSeconds: number;
  note: string;
}

export async function run(ctx: ToolContext, _input: Input): Promise<ToolResult<Data>> {
  const ref = ctx.db.doc(`clinics/${ctx.clinicId}`);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new Error(`Clinic ${ctx.clinicId} not found`);
  }
  const ava = (snap.data()?.ava as Record<string, unknown> | undefined) ?? {};
  if (!ava.agent_id) {
    throw new Error(`Clinic ${ctx.clinicId} has no ElevenLabs agent configured (ava.agent_id missing). Create the agent first.`);
  }

  const triggeredAt = new Date().toISOString();
  await ref.update({
    "ava.lastManualSyncRequest": triggeredAt,
    updatedAt: triggeredAt,
    _mcpSyncTrigger: FieldValue.serverTimestamp(),
  });

  return {
    data: {
      clinicId: ctx.clinicId,
      triggeredAt,
      mechanism: "onClinicWrite-trigger",
      expectedSyncWithinSeconds: 10,
      note: "Bumped the clinic doc to trigger onClinicWrite (5s debounce + sync). Watch ava.syncState in Firestore for status. The syncClinicToAva callable was not invoked directly — the trigger handles it server-side with the proper ELEVENLABS_API_KEY secret.",
    },
    summary: `Ava sync triggered for ${ctx.clinicId}. Result lands in ava.syncState within ~10s.`,
  };
}
