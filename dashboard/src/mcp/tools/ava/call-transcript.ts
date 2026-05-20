import { z } from "zod";
import type { ToolContext, ToolResult } from "../../types";

export const inputSchema = z.object({
  callId: z.string().min(1).describe("The call ID — matches the doc ID in call_log or voiceInteractions."),
}).strict();

export type Input = z.infer<typeof inputSchema>;

interface Data {
  clinicId: string;
  callId: string;
  source: "voiceInteractions" | "call_log";
  startTimestamp: number | null;
  durationSeconds: number | null;
  callerPhone: string | null;
  outcome: string | null;
  callSummary: string | null;
  transcript: string | null;
}

export async function run(ctx: ToolContext, input: Input): Promise<ToolResult<Data>> {
  const candidates = ["voiceInteractions", "call_log"] as const;

  for (const col of candidates) {
    const ref = ctx.db.doc(`clinics/${ctx.clinicId}/${col}/${input.callId}`);
    const snap = await ref.get();
    if (!snap.exists) continue;
    const x = snap.data() as Record<string, unknown>;
    const data: Data = {
      clinicId: ctx.clinicId,
      callId: input.callId,
      source: col,
      startTimestamp: (x.startTimestamp as number | undefined) ?? null,
      durationSeconds: (x.durationSeconds as number | undefined) ?? null,
      callerPhone: (x.callerPhone as string | undefined) ?? null,
      outcome: (x.outcome as string | undefined) ?? null,
      callSummary: (x.callSummary as string | undefined) ?? null,
      transcript: (x.transcript as string | undefined) ?? null,
    };
    const summary = data.transcript
      ? `Call ${input.callId} (${col}): ${data.outcome ?? "no outcome"}, ${data.durationSeconds ?? "?"}s, transcript ${data.transcript.length} chars.`
      : `Call ${input.callId} (${col}): ${data.outcome ?? "no outcome"}, no transcript on this record.`;
    return { data, summary };
  }

  throw new Error(`Call ${input.callId} not found in voiceInteractions or call_log for clinic ${ctx.clinicId}`);
}
