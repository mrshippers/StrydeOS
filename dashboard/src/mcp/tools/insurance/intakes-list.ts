import { z } from "zod";
import type { ToolContext, ToolResult } from "../../types";
import { OWNER_ADMIN_SUPERADMIN, hasRole } from "../../types";
import type {
  InsuranceRecord,
  InsuranceReviewStatus,
  InsuranceSource,
} from "@/lib/insurance/types";

const INTAKES = "insurance_intakes";

// Runaway-read guard. Insurance intakes are low-volume per clinic; this only
// caps how many docs we pull from the window before in-memory work. Well above
// any realistic 90-day window for a single clinic.
const MAX_SCAN = 500;

export const inputSchema = z
  .object({
    days_back: z
      .number()
      .int()
      .min(1)
      .max(90)
      .default(7)
      .describe("Window in days on capturedAt. Default 7, min 1, max 90."),
    status: z
      .enum(["pending", "writing", "approved", "rejected", "all"])
      .default("all")
      .describe("Filter by reviewStatus. 'all' (default) returns every status."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(25)
      .describe(
        "Max rows returned. Default 25, max 100. Summary counts cover the whole window, not just the returned page.",
      ),
  })
  .strict();

export type Input = z.infer<typeof inputSchema>;

/**
 * A single intake, projected to a non-PHI-leaking shape. The full policyNumber
 * is NEVER included — only policyLast4. There are no card image/photo fields on
 * InsuranceRecord, and this explicit whitelist guarantees none can leak.
 */
export interface IntakeRow {
  id: string;
  insurerName: string;
  scheme: string | null;
  reviewStatus: InsuranceReviewStatus;
  source: InsuranceSource;
  capturedAt: string;
  appointmentId: string | null;
  patientRef: string;
  policyLast4: string;
  hasAuthCode: boolean;
  incomplete: boolean;
  incompleteReason: string | null;
  insurerMismatch: boolean;
  claimedInsurer: string | null;
  needsAction: boolean;
}

interface Summary {
  total: number;
  byInsurer: Record<string, number>;
  needsActionCount: number;
  incompleteCount: number;
  mismatchCount: number;
}

interface Data {
  clinicId: string;
  summary: Summary;
  rows: IntakeRow[];
}

/** Last 4 characters only — the full policy number must never leave this module. */
function lastFour(policyNumber: string | undefined | null): string {
  return (policyNumber ?? "").trim().slice(-4);
}

function toRow(id: string, r: InsuranceRecord): IntakeRow {
  const incomplete = r.incomplete === true;
  const insurerMismatch = r.insurerMismatch === true;
  const needsAction = r.reviewStatus === "pending" || incomplete || insurerMismatch;
  return {
    id,
    insurerName: r.insurerName,
    scheme: r.scheme ?? null,
    reviewStatus: r.reviewStatus,
    source: r.source,
    capturedAt: r.capturedAt,
    appointmentId: r.appointmentId ?? null,
    patientRef: r.patientRef,
    policyLast4: lastFour(r.policyNumber),
    hasAuthCode:
      typeof r.authorisationCode === "string" && r.authorisationCode.trim().length > 0,
    incomplete,
    incompleteReason: incomplete ? r.incompleteReason ?? null : null,
    insurerMismatch,
    claimedInsurer: insurerMismatch ? r.claimedInsurer ?? null : null,
    needsAction,
  };
}

export async function run(ctx: ToolContext, input: Input): Promise<ToolResult<Data>> {
  // PHI gate — insurance intakes carry policy + patient data. Same
  // owner/admin/superadmin gate as ava_get_call_transcript, via the shared
  // hasRole helper. Defence-in-depth: the registry also enforces requiredRoles,
  // and this throws before any Firestore read so a non-privileged caller gets
  // zero rows.
  if (!hasRole(ctx.role, OWNER_ADMIN_SUPERADMIN)) {
    throw new Error(
      `insurance_intakes_list requires role in [${OWNER_ADMIN_SUPERADMIN.join(
        ", ",
      )}] — current role is '${ctx.role}'. Insurance intakes are PHI.`,
    );
  }

  const nowMs = Date.now();
  const cutoffMs = nowMs - input.days_back * 24 * 60 * 60 * 1000;
  const cutoffIso = new Date(cutoffMs).toISOString();

  // Coarse server-side window on capturedAt (single-field range + order — no
  // composite index needed). Tenant-scoped to the caller's clinicId. Precise
  // boundary + status/derived filtering happens in memory below, so mixed ISO
  // string precision can't skew the range query.
  const snap = await ctx.db
    .collection(`clinics/${ctx.clinicId}/${INTAKES}`)
    .where("capturedAt", ">=", cutoffIso)
    .orderBy("capturedAt", "desc")
    .limit(MAX_SCAN)
    .get();

  const inWindow: IntakeRow[] = [];
  for (const d of snap.docs) {
    const r = d.data() as InsuranceRecord;
    const t = Date.parse(r.capturedAt);
    if (Number.isNaN(t) || t < cutoffMs) continue;
    if (input.status !== "all" && r.reviewStatus !== input.status) continue;
    inWindow.push(toRow(d.id, r));
  }

  // Summary reflects the whole filtered window, not just the returned page.
  const byInsurer: Record<string, number> = {};
  let needsActionCount = 0;
  let incompleteCount = 0;
  let mismatchCount = 0;
  for (const row of inWindow) {
    byInsurer[row.insurerName] = (byInsurer[row.insurerName] ?? 0) + 1;
    if (row.needsAction) needsActionCount++;
    if (row.incomplete) incompleteCount++;
    if (row.insurerMismatch) mismatchCount++;
  }

  // Sort: needsAction first, then capturedAt desc.
  inWindow.sort((a, b) => {
    if (a.needsAction !== b.needsAction) return a.needsAction ? -1 : 1;
    if (a.capturedAt < b.capturedAt) return 1;
    if (a.capturedAt > b.capturedAt) return -1;
    return 0;
  });

  const rows = inWindow.slice(0, input.limit);
  const statusNote = input.status === "all" ? "" : ` (status: ${input.status})`;
  const summaryText =
    inWindow.length === 0
      ? `No insurance intakes in the last ${input.days_back} day(s)${statusNote}.`
      : `${inWindow.length} insurance intake(s) in the last ${input.days_back} day(s)${statusNote} — ${needsActionCount} need action, ${incompleteCount} incomplete, ${mismatchCount} insurer mismatch. Showing ${rows.length}.`;

  return {
    data: {
      clinicId: ctx.clinicId,
      summary: { total: inWindow.length, byInsurer, needsActionCount, incompleteCount, mismatchCount },
      rows,
    },
    summary: summaryText,
  };
}
