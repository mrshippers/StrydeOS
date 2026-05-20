import { z } from "zod";
import type { ToolContext, ToolResult } from "../../types";

export const inputSchema = z.object({
  days_back: z.number().int().min(1).max(90).default(14)
    .describe("How many days of comms_log to scan. Default 14."),
  limit: z.number().int().min(1).max(200).default(50)
    .describe("Max comms_log entries to return. Default 50."),
}).strict();

export type Input = z.infer<typeof inputSchema>;

interface CommsRow {
  id: string;
  patientId: string | null;
  sequenceId: string | null;
  channel: string | null;
  status: string | null;
  sentAt: string | null;
}

interface SequenceRow {
  id: string;
  name: string | null;
  active: boolean | null;
}

interface Data {
  clinicId: string;
  windowDays: number;
  sequences: SequenceRow[];
  commsLog: CommsRow[];
  statusBreakdown: Record<string, number>;
}

export async function run(ctx: ToolContext, input: Input): Promise<ToolResult<Data>> {
  const cutoffISO = new Date(Date.now() - input.days_back * 86_400_000).toISOString();

  const [seqSnap, logSnap] = await Promise.all([
    ctx.db.collection(`clinics/${ctx.clinicId}/sequence_definitions`).get(),
    ctx.db
      .collection(`clinics/${ctx.clinicId}/comms_log`)
      .where("sentAt", ">=", cutoffISO)
      .orderBy("sentAt", "desc")
      .limit(input.limit)
      .get(),
  ]);

  const sequences: SequenceRow[] = seqSnap.docs.map((d) => {
    const x = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      name: (x.name as string | undefined) ?? null,
      active: (x.active as boolean | undefined) ?? null,
    };
  });

  const commsLog: CommsRow[] = logSnap.docs.map((d) => {
    const x = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      patientId: (x.patientId as string | undefined) ?? null,
      sequenceId: (x.sequenceId as string | undefined) ?? null,
      channel: (x.channel as string | undefined) ?? null,
      status: (x.status as string | undefined) ?? null,
      sentAt: (x.sentAt as string | undefined) ?? null,
    };
  });

  const statusBreakdown: Record<string, number> = {};
  for (const row of commsLog) {
    const k = row.status ?? "unknown";
    statusBreakdown[k] = (statusBreakdown[k] ?? 0) + 1;
  }

  const activeSeq = sequences.filter((s) => s.active).length;
  const summary = `${commsLog.length} comms in last ${input.days_back}d, ${activeSeq}/${sequences.length} sequences active.`;

  return { data: { clinicId: ctx.clinicId, windowDays: input.days_back, sequences, commsLog, statusBreakdown }, summary };
}
