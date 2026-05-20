import { z } from "zod";
import type { ToolContext, ToolResult } from "../../types";

export const inputSchema = z.object({
  weeks_back: z.number().int().min(4).max(26).default(8)
    .describe("How many weeks of initial assessments to evaluate. Default 8."),
  follow_up_window_weeks: z.number().int().min(2).max(12).default(6)
    .describe("Window after an initial in which a follow-up must be booked. Default 6 weeks."),
}).strict();

export type Input = z.infer<typeof inputSchema>;

interface ClinicianRow {
  clinicianId: string;
  initials: number;
  withFollowUp: number;
  withoutFollowUp: number;
  dropOffRate: number;
}

interface Data {
  clinicId: string;
  windowStart: string;
  followUpWindowWeeks: number;
  totals: { initials: number; withFollowUp: number; withoutFollowUp: number; dropOffRate: number };
  byClinician: ClinicianRow[];
}

export async function run(ctx: ToolContext, input: Input): Promise<ToolResult<Data>> {
  const windowStart = new Date(Date.now() - input.weeks_back * 7 * 86_400_000).toISOString();
  const followUpMs = input.follow_up_window_weeks * 7 * 86_400_000;

  const apptSnap = await ctx.db
    .collection(`clinics/${ctx.clinicId}/appointments`)
    .where("startTime", ">=", windowStart)
    .orderBy("startTime", "asc")
    .get();

  type Appt = { id: string; startTime: string; clinicianId?: string; patientId?: string; appointmentType?: string };
  const appts: Appt[] = apptSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Appt, "id">) }));

  // Group follow-ups by patientId for fast lookup.
  const followUpsByPatient = new Map<string, number[]>();
  for (const a of appts) {
    if (a.appointmentType === "follow_up" && a.patientId && a.startTime) {
      const t = Date.parse(a.startTime);
      if (!Number.isFinite(t)) continue;
      const arr = followUpsByPatient.get(a.patientId) ?? [];
      arr.push(t);
      followUpsByPatient.set(a.patientId, arr);
    }
  }

  const initials = appts.filter((a) => a.appointmentType === "initial_assessment");

  const perClinician = new Map<string, { initials: number; withFollowUp: number }>();
  let totalInitials = 0;
  let totalWithFollowUp = 0;

  for (const init of initials) {
    if (!init.patientId || !init.startTime) continue;
    const t0 = Date.parse(init.startTime);
    if (!Number.isFinite(t0)) continue;
    totalInitials++;

    const cid = init.clinicianId ?? "unknown";
    const bucket = perClinician.get(cid) ?? { initials: 0, withFollowUp: 0 };
    bucket.initials++;

    const followUps = followUpsByPatient.get(init.patientId) ?? [];
    const hasFollowUp = followUps.some((t) => t > t0 && t - t0 <= followUpMs);
    if (hasFollowUp) {
      bucket.withFollowUp++;
      totalWithFollowUp++;
    }
    perClinician.set(cid, bucket);
  }

  const byClinician: ClinicianRow[] = [...perClinician.entries()]
    .map(([clinicianId, b]) => ({
      clinicianId,
      initials: b.initials,
      withFollowUp: b.withFollowUp,
      withoutFollowUp: b.initials - b.withFollowUp,
      dropOffRate: b.initials > 0 ? (b.initials - b.withFollowUp) / b.initials : 0,
    }))
    .sort((a, b) => b.dropOffRate - a.dropOffRate);

  const dropOffRate = totalInitials > 0 ? (totalInitials - totalWithFollowUp) / totalInitials : 0;

  const summary =
    totalInitials === 0
      ? `No initial assessments in the last ${input.weeks_back} weeks.`
      : `Drop-off ${Math.round(dropOffRate * 100)}% over ${input.weeks_back}w (${totalInitials - totalWithFollowUp}/${totalInitials} initials with no follow-up within ${input.follow_up_window_weeks}w).`;

  return {
    data: {
      clinicId: ctx.clinicId,
      windowStart,
      followUpWindowWeeks: input.follow_up_window_weeks,
      totals: {
        initials: totalInitials,
        withFollowUp: totalWithFollowUp,
        withoutFollowUp: totalInitials - totalWithFollowUp,
        dropOffRate,
      },
      byClinician,
    },
    summary,
  };
}
