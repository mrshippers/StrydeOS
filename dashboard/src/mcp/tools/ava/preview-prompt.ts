import { z } from "zod";
import type { ToolContext, ToolResult } from "../../types";
import { buildAvaCorePrompt } from "@/lib/ava/ava-core-prompt";

export const inputSchema = z.object({}).strict();
export type Input = z.infer<typeof inputSchema>;

interface KnowledgeEntry {
  category?: string;
  title?: string;
  content?: string;
}

interface Data {
  clinicId: string;
  prompt: string;
  variables: {
    clinic_name: string;
    clinic_email: string;
    clinic_phone: string;
    hours: string;
    pms_name: string;
  };
  charCount: number;
  note: string;
}

function formatHours(hours?: { start?: string; end?: string; days?: string[] }): string {
  if (!hours) return "Contact clinic for hours";
  const labels: Record<string, string> = {
    mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
  };
  const days = (hours.days ?? ["mon", "tue", "wed", "thu", "fri"])
    .map((d) => labels[d] ?? d).join(", ");
  return `${days}: ${hours.start ?? "09:00"} - ${hours.end ?? "18:00"}`;
}

function joinCategory(entries: KnowledgeEntry[], cat: string): string {
  return entries
    .filter((e) => e.category === cat)
    .map((e) => `${e.title ?? ""}: ${e.content ?? ""}`)
    .join("\n");
}

export async function run(ctx: ToolContext, _input: Input): Promise<ToolResult<Data>> {
  const clinicDoc = await ctx.db.doc(`clinics/${ctx.clinicId}`).get();
  if (!clinicDoc.exists) {
    throw new Error(`Clinic ${ctx.clinicId} not found`);
  }

  const data = clinicDoc.data() as Record<string, unknown>;
  const ava = (data.ava as Record<string, unknown> | undefined) ?? {};
  const entries = (ava.knowledge as KnowledgeEntry[] | undefined) ?? [];
  const integrations = (data.integrations as Record<string, string> | undefined) ?? {};

  const vars = {
    clinic_name: (data.name as string | undefined) || "Clinic",
    clinic_email: (data.email as string | undefined) || "",
    clinic_phone:
      (data.receptionPhone as string | undefined) ||
      ((ava.config as Record<string, string> | undefined)?.phone) || "",
    hours: formatHours(ava.hours as { start?: string; end?: string; days?: string[] } | undefined),
    clinicians: joinCategory(entries, "team"),
    pricing_table: joinCategory(entries, "pricing"),
    services: joinCategory(entries, "services"),
    pms_name: integrations.pms || "WriteUpp",
  };

  const prompt = buildAvaCorePrompt(vars);

  return {
    data: {
      clinicId: ctx.clinicId,
      prompt,
      variables: {
        clinic_name: vars.clinic_name,
        clinic_email: vars.clinic_email,
        clinic_phone: vars.clinic_phone,
        hours: vars.hours,
        pms_name: vars.pms_name,
      },
      charCount: prompt.length,
      note: "Preview only. The live prompt is rendered server-side by syncClinicToAva and may include knowledge-base content not shown here.",
    },
    summary: `Preview prompt for ${vars.clinic_name}: ${prompt.length} chars, ${entries.length} knowledge entries.`,
  };
}
