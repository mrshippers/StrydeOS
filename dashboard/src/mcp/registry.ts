import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolContext, Role, ToolResult } from "./types";
import { OWNER_ADMIN_SUPERADMIN, ALL_ROLES, hasRole } from "./types";

import * as recentCalls from "./tools/ava/recent-calls";
import * as previewPrompt from "./tools/ava/preview-prompt";
import * as callTranscript from "./tools/ava/call-transcript";
import * as avaSync from "./tools/ava/sync";
import * as appointmentsList from "./tools/appointments/list";
import * as followUpDropOff from "./tools/appointments/follow-up-drop-off";
import * as weeklySummary from "./tools/appointments/weekly-summary";
import * as cohortSummary from "./tools/pulse/cohort-summary";
import * as reengagementQueue from "./tools/pulse/reengagement-queue";
import * as integrationsHealth from "./tools/ops/integrations-health";
import * as reviewsList from "./tools/ops/reviews-list";

interface ToolModule<I = unknown, D = unknown> {
  inputSchema: z.ZodType<I>;
  run: (ctx: ToolContext, input: I) => Promise<ToolResult<D>>;
}

export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  module: ToolModule;
  requiredRoles: readonly Role[];
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
  };
}

export const TOOLS: readonly ToolDefinition[] = [
  // ── Ava ───────────────────────────────────────────────────────────────
  {
    name: "ava_list_recent_calls",
    title: "List recent Ava calls",
    description:
      "Returns the most recent Ava (voice agent) calls from call_log for the active clinic, with outcome and duration breakdown. Read-only.",
    module: recentCalls as unknown as ToolModule,
    requiredRoles: ALL_ROLES,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  {
    name: "ava_preview_prompt",
    title: "Preview Ava system prompt",
    description:
      "Renders the current Ava system prompt for this clinic using buildAvaCorePrompt. Preview only — the live prompt is rendered server-side by syncClinicToAva.",
    module: previewPrompt as unknown as ToolModule,
    requiredRoles: OWNER_ADMIN_SUPERADMIN,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "ava_get_call_transcript",
    title: "Get Ava call transcript",
    description:
      "Returns the full transcript and metadata for a single Ava call. Looks up voiceInteractions first, then call_log. PHI gate — owner/admin/superadmin only.",
    module: callTranscript as unknown as ToolModule,
    requiredRoles: OWNER_ADMIN_SUPERADMIN,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "ava_sync_clinic",
    title: "Trigger Ava clinic sync",
    description:
      "Triggers a re-sync of the clinic's Ava agent (prompt + knowledge base) by bumping the clinic doc, which fires the onClinicWrite trigger. The actual ElevenLabs upload happens server-side. Result lands in clinics/{id}.ava.syncState within ~10s.",
    module: avaSync as unknown as ToolModule,
    requiredRoles: OWNER_ADMIN_SUPERADMIN,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },

  // ── Appointments ──────────────────────────────────────────────────────
  {
    name: "appointments_list",
    title: "List recent appointments",
    description:
      "Returns appointments for the active clinic within a date range, with cursor-based pagination and breakdown of initial vs follow-up.",
    module: appointmentsList as unknown as ToolModule,
    requiredRoles: ALL_ROLES,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "appointments_follow_up_drop_off",
    title: "Follow-up drop-off rate",
    description:
      "Computes the rate of initial assessments that did NOT result in a follow-up booking within a configurable window. Returns clinic-wide totals plus per-clinician breakdown, sorted by drop-off rate.",
    module: followUpDropOff as unknown as ToolModule,
    requiredRoles: OWNER_ADMIN_SUPERADMIN,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "weekly_summary",
    title: "Weekly KPI summary",
    description:
      "Returns the most recent week's KPI snapshot from clinics/{id}/kpis: value, target, status (ok/warn/danger), and week-over-week delta for each of the 6+1 canonical KPIs.",
    module: weeklySummary as unknown as ToolModule,
    requiredRoles: ALL_ROLES,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },

  // ── Pulse ─────────────────────────────────────────────────────────────
  {
    name: "pulse_cohort_summary",
    title: "Pulse cohort summary",
    description:
      "Groups patients by lifecycleState (active, at_risk, dormant, etc.) and returns count + average risk score per cohort. Uses buildCohortSummary from lib/pulse.",
    module: cohortSummary as unknown as ToolModule,
    requiredRoles: OWNER_ADMIN_SUPERADMIN,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "pulse_reengagement_queue",
    title: "Pulse re-engagement queue",
    description:
      "Returns active comms sequences plus the recent comms_log entries (scheduled / sent / failed re-engagement messages) for the clinic.",
    module: reengagementQueue as unknown as ToolModule,
    requiredRoles: OWNER_ADMIN_SUPERADMIN,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },

  // ── Ops + reputation ──────────────────────────────────────────────────
  {
    name: "integrations_health_snapshot",
    title: "Integrations health snapshot",
    description:
      "Returns the most recent integration_health entries (WriteUpp, Cliniko, Physitrack, Resend, etc.) with status, last success, last error.",
    module: integrationsHealth as unknown as ToolModule,
    requiredRoles: OWNER_ADMIN_SUPERADMIN,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "reviews_list",
    title: "List recent reviews",
    description:
      "Returns the most recent reviews (Google, Trustpilot, NPS SMS) for the clinic with rating, platform breakdown, and average rating.",
    module: reviewsList as unknown as ToolModule,
    requiredRoles: OWNER_ADMIN_SUPERADMIN,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
];

function uniqueNamesCheck(): void {
  const seen = new Set<string>();
  for (const t of TOOLS) {
    if (seen.has(t.name)) throw new Error(`Duplicate MCP tool name: ${t.name}`);
    seen.add(t.name);
  }
}

export function registerAll(server: McpServer, ctx: ToolContext): void {
  uniqueNamesCheck();

  for (const tool of TOOLS) {
    const schema = tool.module.inputSchema as z.ZodObject<z.ZodRawShape>;
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: schema.shape,
        annotations: tool.annotations,
      },
      async (rawInput: unknown) => {
        try {
          if (!hasRole(ctx.role, tool.requiredRoles)) {
            return {
              isError: true,
              content: [
                {
                  type: "text",
                  text: `Error: Tool '${tool.name}' requires role in [${tool.requiredRoles.join(", ")}] — current role is '${ctx.role}'.`,
                },
              ],
            };
          }

          const parsed = tool.module.inputSchema.parse(rawInput);
          const result = await tool.module.run(ctx, parsed);

          return {
            content: [{ type: "text", text: result.summary }],
            structuredContent: result.data as Record<string, unknown>,
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return {
            isError: true,
            content: [{ type: "text", text: `Error: ${msg}` }],
          };
        }
      }
    );
  }
}
