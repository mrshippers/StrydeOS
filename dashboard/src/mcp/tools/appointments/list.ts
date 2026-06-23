import { z } from "zod";
import type { ToolContext, ToolResult } from "../../types";

export const inputSchema = z.object({
  days_back: z.number().int().min(1).max(90).default(7)
    .describe("How many days back from today to include. Default 7."),
  limit: z.number().int().min(1).max(100).default(25)
    .describe("Max number of appointments to return. Default 25."),
  cursor: z.string().nullish()
    .describe("Pagination cursor from a previous response's nextCursor."),
}).strict();

export type Input = z.infer<typeof inputSchema>;

interface ApptRow {
  id: string;
  dateTime: string | null;
  clinicianId: string | null;
  patientId: string | null;
  appointmentType: string | null;
  status: string | null;
  durationMinutes: number | null;
}

interface Data {
  clinicId: string;
  days_back: number;
  count: number;
  hasMore: boolean;
  nextCursor: string | null;
  breakdown: { initial: number; follow_up: number; other: number };
  appointments: ApptRow[];
}

export async function run(ctx: ToolContext, input: Input): Promise<ToolResult<Data>> {
  const cutoffISO = new Date(Date.now() - input.days_back * 86_400_000).toISOString();
  let query = ctx.db
    .collection(`clinics/${ctx.clinicId}/appointments`)
    .where("dateTime", ">=", cutoffISO)
    .orderBy("dateTime", "desc")
    .limit(input.limit + 1);

  if (input.cursor) {
    try {
      const docPath = Buffer.from(input.cursor, "base64url").toString("utf-8");
      const snap = await ctx.db.doc(docPath).get();
      if (snap.exists) query = query.startAfter(snap);
    } catch {
      // ignore invalid cursor
    }
  }

  const snap = await query.get();
  const hasMore = snap.docs.length > input.limit;
  const docs = snap.docs.slice(0, input.limit);

  const appointments: ApptRow[] = docs.map((d) => {
    const x = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      dateTime: (x.dateTime as string | undefined) ?? null,
      clinicianId: (x.clinicianId as string | undefined) ?? null,
      patientId: (x.patientId as string | undefined) ?? null,
      appointmentType: (x.appointmentType as string | undefined) ?? null,
      status: (x.status as string | undefined) ?? null,
      durationMinutes: (x.durationMinutes as number | undefined) ?? null,
    };
  });

  const lastDoc = docs[docs.length - 1];
  const nextCursor = hasMore && lastDoc
    ? Buffer.from(lastDoc.ref.path, "utf-8").toString("base64url")
    : null;

  const breakdown = { initial: 0, follow_up: 0, other: 0 };
  for (const a of appointments) {
    if (a.appointmentType === "initial_assessment") breakdown.initial++;
    else if (a.appointmentType === "follow_up") breakdown.follow_up++;
    else breakdown.other++;
  }

  const summary =
    appointments.length === 0
      ? `No appointments in last ${input.days_back} day${input.days_back === 1 ? "" : "s"}.`
      : `${appointments.length} appt${appointments.length === 1 ? "" : "s"} in last ${input.days_back}d — ${breakdown.initial} initial, ${breakdown.follow_up} follow-up.`;

  return {
    data: { clinicId: ctx.clinicId, days_back: input.days_back, count: appointments.length, hasMore, nextCursor, breakdown, appointments },
    summary,
  };
}
