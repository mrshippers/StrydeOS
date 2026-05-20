import { z } from "zod";
import type { ToolContext, ToolResult } from "../../types";
import { buildCohortSummary, type CohortSummary } from "@/lib/pulse/cohort-summary";
import type { Patient } from "@/types/patient";

export const inputSchema = z.object({
  limit: z.number().int().min(1).max(2000).default(500)
    .describe("Maximum patients to load for cohort grouping. Default 500."),
}).strict();

export type Input = z.infer<typeof inputSchema>;

interface Data {
  clinicId: string;
  patientsScanned: number;
  cohorts: CohortSummary[];
}

export async function run(ctx: ToolContext, input: Input): Promise<ToolResult<Data>> {
  const snap = await ctx.db
    .collection(`clinics/${ctx.clinicId}/patients`)
    .limit(input.limit)
    .get();

  const patients = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Patient, "id">) }));
  const cohorts = buildCohortSummary(patients as Patient[]);

  const top = cohorts
    .slice(0, 3)
    .map((c) => `${c.cohort}:${c.count}`)
    .join(", ");

  const summary =
    cohorts.length === 0
      ? `No patients with a lifecycleState found (scanned ${patients.length}).`
      : `${patients.length} patients across ${cohorts.length} cohort${cohorts.length === 1 ? "" : "s"} — ${top}.`;

  return { data: { clinicId: ctx.clinicId, patientsScanned: patients.length, cohorts }, summary };
}
