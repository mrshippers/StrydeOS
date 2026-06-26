import { z } from "zod";
import type { ToolContext, ToolResult } from "../../types";

export const inputSchema = z.object({
  limit: z.number().int().min(1).max(200).default(50)
    .describe("Max integration_health entries to return. Default 50."),
}).strict();

export type Input = z.infer<typeof inputSchema>;

// Field names MUST match what health-logger.ts actually writes:
//   { provider, providerType, stage, ok, count, errors, durationMs, timestamp }
// The previous reader ordered by `recordedAt` and mapped `integration`/`status`
// — fields the writer never produces — so .orderBy() excluded every doc and the
// query always returned empty (the "ZERO entries for clinic-spires" symptom).
interface HealthRow {
  id: string;
  provider: string | null;
  providerType: string | null;
  stage: string | null;
  ok: boolean | null;
  count: number | null;
  errors: string[];
  durationMs: number | null;
  timestamp: string | null;
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
    .orderBy("timestamp", "desc")
    .limit(input.limit)
    .get();

  const entries: HealthRow[] = snap.docs.map((d) => {
    const x = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      provider: (x.provider as string | undefined) ?? null,
      providerType: (x.providerType as string | undefined) ?? null,
      stage: (x.stage as string | undefined) ?? null,
      ok: typeof x.ok === "boolean" ? x.ok : null,
      count: typeof x.count === "number" ? x.count : null,
      errors: Array.isArray(x.errors) ? (x.errors as string[]) : [],
      durationMs: typeof x.durationMs === "number" ? x.durationMs : null,
      timestamp: (x.timestamp as string | undefined) ?? null,
    };
  });

  const statusBreakdown: Record<string, number> = {};
  for (const row of entries) {
    const k = row.ok === true ? "ok" : row.ok === false ? "error" : "unknown";
    statusBreakdown[k] = (statusBreakdown[k] ?? 0) + 1;
  }

  const errored = entries.filter((e) => e.ok === false).length;
  const summary =
    entries.length === 0
      ? "No integration_health entries found. Pipeline may not be writing health records yet."
      : `${entries.length} health entries, ${errored} non-OK.`;

  return { data: { clinicId: ctx.clinicId, count: entries.length, statusBreakdown, entries }, summary };
}
