import { z } from "zod";
import type { ToolContext, ToolResult } from "../../types";

export const inputSchema = z.object({
  days: z.number().int().min(1).max(30).default(7)
    .describe("How many days back to look. Default 7."),
  limit: z.number().int().min(1).max(100).default(25)
    .describe("Maximum number of calls to return. Default 25."),
}).strict();

export type Input = z.infer<typeof inputSchema>;

interface CallRow {
  id: string;
  startTimestamp: number | null;
  callerPhone: string | null;
  durationSeconds: number | null;
  outcome: string | null;
  callSummary: string | null;
  reasonForCall: string | null;
}

interface Data {
  clinicId: string;
  days: number;
  count: number;
  breakdown: { booked: number; escalated: number; voicemail: number; other: number };
  calls: CallRow[];
}

export async function run(ctx: ToolContext, input: Input): Promise<ToolResult<Data>> {
  const cutoff = Date.now() - input.days * 86_400_000;

  const snap = await ctx.db
    .collection(`clinics/${ctx.clinicId}/call_log`)
    .where("startTimestamp", ">=", cutoff)
    .orderBy("startTimestamp", "desc")
    .limit(input.limit)
    .get();

  const calls: CallRow[] = snap.docs.map((d) => {
    const x = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      startTimestamp: (x.startTimestamp as number | undefined) ?? null,
      callerPhone: (x.callerPhone as string | undefined) ?? null,
      durationSeconds: (x.durationSeconds as number | undefined) ?? null,
      outcome: (x.outcome as string | undefined) ?? null,
      callSummary: (x.callSummary as string | undefined) ?? null,
      reasonForCall: (x.reasonForCall as string | undefined) ?? null,
    };
  });

  const breakdown = { booked: 0, escalated: 0, voicemail: 0, other: 0 };
  for (const c of calls) {
    if (c.outcome === "booked") breakdown.booked++;
    else if (c.outcome === "voicemail") breakdown.voicemail++;
    else if (c.outcome === "escalated" || c.outcome === "transferred") breakdown.escalated++;
    else breakdown.other++;
  }

  const summary =
    calls.length === 0
      ? `No Ava calls in the last ${input.days} day${input.days === 1 ? "" : "s"}.`
      : `${calls.length} call${calls.length === 1 ? "" : "s"} in last ${input.days}d — ${breakdown.booked} booked, ${breakdown.voicemail} voicemail, ${breakdown.escalated} escalated.`;

  return { data: { clinicId: ctx.clinicId, days: input.days, count: calls.length, breakdown, calls }, summary };
}
