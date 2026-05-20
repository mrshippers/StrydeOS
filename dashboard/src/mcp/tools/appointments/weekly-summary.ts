import { z } from "zod";
import type { ToolContext, ToolResult } from "../../types";
import type { KpiDoc, KpiId, KpiStatus } from "@/types/kpi";

export const inputSchema = z.object({}).strict();
export type Input = z.infer<typeof inputSchema>;

interface KpiRow {
  kpiId: KpiId;
  value: number;
  target: number;
  status: KpiStatus;
  weekOverWeek: number | null;
  trend: number[];
}

interface Data {
  clinicId: string;
  weekStart: string | null;
  computedAt: string | null;
  kpis: KpiRow[];
}

export async function run(ctx: ToolContext, _input: Input): Promise<ToolResult<Data>> {
  const kpiSnap = await ctx.db.collection(`clinics/${ctx.clinicId}/kpis`).get();

  if (kpiSnap.empty) {
    return {
      data: { clinicId: ctx.clinicId, weekStart: null, computedAt: null, kpis: [] },
      summary: `No KPI projections found for clinic ${ctx.clinicId}. Run the KPI computation job first.`,
    };
  }

  let weekStart: string | null = null;
  let computedAt: string | null = null;

  const kpis: KpiRow[] = kpiSnap.docs.map((d) => {
    const doc = d.data() as KpiDoc;
    if (!weekStart && doc.window?.type === "weekly") weekStart = doc.window.weekStart;
    if (!computedAt) computedAt = doc.computedAt;

    const trend = doc.trend ?? [];
    const prior = trend[0];
    const weekOverWeek =
      typeof prior === "number" && prior !== 0 && Number.isFinite(doc.value)
        ? (doc.value - prior) / Math.abs(prior)
        : null;

    return {
      kpiId: doc.kpiId,
      value: doc.value,
      target: doc.target,
      status: doc.status,
      weekOverWeek,
      trend,
    };
  });

  const counts = { ok: 0, warn: 0, danger: 0 };
  for (const k of kpis) counts[k.status]++;
  const summary = `Week ${weekStart ?? "?"}: ${counts.ok} ok / ${counts.warn} warn / ${counts.danger} danger across ${kpis.length} KPIs.`;

  return { data: { clinicId: ctx.clinicId, weekStart, computedAt, kpis }, summary };
}
