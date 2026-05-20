import { z } from "zod";
import type { ToolContext, ToolResult } from "../../types";

export const inputSchema = z.object({
  limit: z.number().int().min(1).max(200).default(50)
    .describe("Max integration_health entries to return. Default 50."),
}).strict();

export type Input = z.infer<typeof inputSchema>;

interface HealthRow {
  id: string;
  integration: string | null;
  status: string | null;
  lastSuccess: string | null;
  lastError: string | null;
  message: string | null;
  recordedAt: string | null;
}

interface Data {
  clinicId: string;
  count: number;
  statusBreakdown: Record<string, number>;
  entries: HealthRow[];
}

export async function run(ctx: ToolContext, input: Input): Promise<ToolResult<Data>> {
  const snap = await ctx.db
    .collection(`clinics/${ctx.clinicId}/integration_health`)
    .orderBy("recordedAt", "desc")
    .limit(input.limit)
    .get();

  const entries: HealthRow[] = snap.docs.map((d) => {
    const x = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      integration: (x.integration as string | undefined) ?? null,
      status: (x.status as string | undefined) ?? null,
      lastSuccess: (x.lastSuccess as string | undefined) ?? null,
      lastError: (x.lastError as string | undefined) ?? null,
      message: (x.message as string | undefined) ?? null,
      recordedAt: (x.recordedAt as string | undefined) ?? null,
    };
  });

  const statusBreakdown: Record<string, number> = {};
  for (const row of entries) {
    const k = row.status ?? "unknown";
    statusBreakdown[k] = (statusBreakdown[k] ?? 0) + 1;
  }

  const errored = entries.filter((e) => e.status && e.status !== "ok" && e.status !== "healthy").length;
  const summary =
    entries.length === 0
      ? "No integration_health entries found. Pipeline may not be writing health records yet."
      : `${entries.length} health entries, ${errored} non-OK.`;

  return { data: { clinicId: ctx.clinicId, count: entries.length, statusBreakdown, entries }, summary };
}
