# StrydeOS MCP Server — Plan

## Context

You asked: build an MCP server for StrydeOS using `/mcp-builder`, then optimise with `/v3-mcp-optimization`. You want one for yourself (founder/dev/admin queries) and potentially one public (customers/partners). Surfaces: Ava control, appointments/patient flow, Pulse retention.

**Headline finding from exploration:** a Python MCP server already exists at [ava_graph/mcp_server.py](ava_graph/mcp_server.py). It is FastMCP, exposes 3 tools (`pms_check_availability`, `pms_book_appointment`, `sms_send_confirmation`), and serves a different purpose — it is the **outbound tool registry that Ava (the voice agent) calls during a live call** via LangGraph. Multi-tenant via per-call credentials. **Leave it alone.**

What you're describing is an **inbound** MCP server — Claude/Cursor (you) → StrydeOS data + ops. Different audience, different code path, different language stack. Reusing Python would force duplication of `firebase-admin.ts`, `auth-guard.ts`, `ava-core-prompt.ts`, `compute-kpis.ts`, `pulse/*` — all TypeScript today, all SYNC-LOCK-fragile.

**Recommendation: one TypeScript MCP server, two transports (stdio for you, HTTP for customers later).** Same code, same tools, transport differs. Build stdio first — biggest ROI, ships in 1-2 days, no auth surface. Add HTTP after a week of dogfooding.

## Architecture

Single codebase, two entrypoints. Tool implementations are transport-agnostic — they receive a `ToolContext` containing `{ clinicId, role, db, env }`. Transport layers resolve that context differently.

```
dashboard/src/mcp/
├── server.ts              entry — picks transport from env
├── transports/
│   ├── stdio.ts           local: admin SDK direct, CLINIC_ID from env (defaults Spires)
│   └── http.ts            public: mounted via dashboard/src/app/api/mcp/route.ts
├── context.ts             ToolContext type + resolveContext(transport, request)
├── tools/
│   ├── ava/               sync_clinic, push_prompt_preview, list_recent_calls, get_call_transcript
│   ├── appointments/      list_appointments, follow_up_drop_off, weekly_summary
│   └── pulse/             list_reengagement_queue, send_reengagement, cohort_summary
└── registry.ts            tool registration + role gating
```

**Why `dashboard/src/mcp/` and not a sibling/top-level dir:** it must import from `dashboard/src/lib/ava/*`, `dashboard/src/lib/intelligence/*`, `dashboard/src/lib/pulse/*`, `dashboard/src/lib/firebase-admin.ts`, `dashboard/src/lib/auth-guard.ts`. Co-locating shares tsconfig paths (`@/lib/...`) and node_modules. The module-boundary script ([dashboard/scripts/check-module-boundaries.sh](dashboard/scripts/check-module-boundaries.sh)) only watches `src/lib/intelligence`, `src/lib/pulse`, `src/components/pulse`, `src/app/api/n8n`, `src/app/api/comms` and specific hook files — `src/mcp/` is not in either watchlist, so the MCP server can read from both Intelligence and Pulse without tripping boundaries. This is intentional: the MCP server is an **aggregator/orchestrator**, sitting above the modules, not inside them.

## Reuse map (do not rewrite)

| Need | Reuse from |
|---|---|
| Firestore admin client | [dashboard/src/lib/firebase-admin.ts](dashboard/src/lib/firebase-admin.ts) — `getAdminDb()` / `getAdminAuth()` |
| Bearer-token auth (HTTP transport only) | [dashboard/src/lib/auth-guard.ts](dashboard/src/lib/auth-guard.ts) — `verifyApiRequest()`, `requireRole()`, `requireClinic()` |
| Ava sync (push prompt + KB to ElevenLabs) | Call the existing `syncClinicToAva` callable in [dashboard/functions/src/sync-clinic-to-ava.ts](dashboard/functions/src/sync-clinic-to-ava.ts) via the Functions SDK — do not duplicate the prompt/KB logic |
| Ava prompt template (preview only) | [dashboard/src/lib/ava/ava-core-prompt.ts](dashboard/src/lib/ava/ava-core-prompt.ts) (SYNC-LOCK with functions/) |
| ElevenLabs agent helpers (read calls/transcripts) | [dashboard/src/lib/ava/elevenlabs-agent.ts](dashboard/src/lib/ava/elevenlabs-agent.ts) |
| Voice interactions (Firestore call log) | [dashboard/src/lib/firebase/voiceInteractions.ts](dashboard/src/lib/firebase/voiceInteractions.ts) |
| KPI computation | [dashboard/src/lib/intelligence/compute-kpis.ts](dashboard/src/lib/intelligence/compute-kpis.ts) |
| Pulse cohort + re-engagement | [dashboard/src/lib/pulse/cohort-summary.ts](dashboard/src/lib/pulse/cohort-summary.ts), [dashboard/src/lib/pulse/track-reengagement.ts](dashboard/src/lib/pulse/track-reengagement.ts) |
| Firestore pagination | [dashboard/src/lib/firestore-pagination.ts](dashboard/src/lib/firestore-pagination.ts) |
| Shared query patterns | [dashboard/src/lib/queries.ts](dashboard/src/lib/queries.ts) |

## Firestore surface

All clinic data is under `clinics/{clinicId}/*` subcollections (per [dashboard/firestore.rules](dashboard/firestore.rules)). Path-partitioned, not field-partitioned. The MCP server resolves `clinicId` once at the transport layer and passes it through `ToolContext` — tools never accept `clinicId` as an input arg (it is implicit in the auth scope). Single source of truth for what each role can read is the rules file; admin SDK bypasses rules, so tools enforce role at the `registry.ts` gate.

## Tool surface — v1 (11 tools, read-only except `ava_sync_clinic`)

### Ava control
- `ava_sync_clinic` — wraps `syncClinicToAva` callable. Only true write; existing callable already enforces auth. Role: owner/admin/superadmin.
- `ava_preview_prompt` — read-only render of the current system prompt for this clinic. Role: owner/admin/superadmin.
- `ava_list_recent_calls` — last N entries from `clinics/{clinicId}/call_log`. Role: clinic member.
- `ava_get_call_transcript` — full transcript by callId from `voiceInteractions` / ElevenLabs. Role: owner/admin (PHI gate).

### Appointments + patient flow
- `appointments_list` — paginated `clinics/{clinicId}/appointments` with date-range filter. Role: clinic member (clinician sees only own).
- `appointments_follow_up_drop_off` — derives drop-off rate: initial assessments without a follow-up booked within X weeks. Reuses `metrics_weekly` where possible. Role: owner/admin.
- `weekly_summary` — single tile pull: 6 canonical KPIs + week-over-week delta. Reads `metrics_weekly`. Role: clinic member.

### Pulse
- `pulse_reengagement_queue` — patients flagged for re-engagement, status + last touch. Reads Pulse-owned collections (`comms_log`, `sequence_definitions`). Role: owner/admin.
- `pulse_cohort_summary` — cohort retention numbers (uses `cohort-summary.ts`). Role: owner/admin.

### Ops + reputation
- `integrations_health_snapshot` — pipeline state for WriteUpp/Cliniko/Physitrack/Resend etc. from `clinics/{clinicId}/integration_health`. Server-only collection (rules block client reads); MCP uses admin SDK. Role: owner/admin.
- `reviews_list` — recent entries from `clinics/{clinicId}/reviews` with sentiment + Pulse follow-up status. NPS is already aggregated in `weekly_summary`; this exposes individual reviews for triage. Role: owner/admin.

All read tools return both a `data` field (structured) and a `summary` field (one-line human-readable) — matches the pattern in the existing Python MCP server.

## Auth model

| Transport | Auth | clinicId source | Role |
|---|---|---|---|
| stdio (founder-local) | None — process-level trust | `CLINIC_ID` env var (defaults to Spires) | `MCP_ROLE` env var, default `superadmin` |
| HTTP (`/api/mcp`) | Bearer token via `verifyApiRequest()` | `user.clinicId` from Firestore | `user.role` from Firestore |

HTTP transport mounts at `dashboard/src/app/api/mcp/route.ts` (Next.js App Router POST handler). The route handler decodes the JSON-RPC envelope, calls `verifyApiRequest()` to resolve `VerifiedUser`, builds `ToolContext`, dispatches to `registry.ts`. **Defer this until Phase B** — get stdio working and validate the tool surface first.

## Phasing

### Phase A — `/mcp-builder` (founder-local stdio, ~1-2 days)

1. Scaffold `dashboard/src/mcp/` with `@modelcontextprotocol/sdk` + TS bindings.
2. Implement `ToolContext` + `resolveContext` for stdio (env-driven).
3. Implement the 4 read-only tools first: `ava_list_recent_calls`, `appointments_list`, `weekly_summary`, `pulse_cohort_summary`. These exercise the full stack with zero write risk.
4. Add `npm run mcp:stdio` script in `dashboard/package.json`.
5. Register in `~/.claude.json` for local use.
6. Add the remaining 6 read tools: `ava_preview_prompt`, `ava_get_call_transcript`, `appointments_follow_up_drop_off`, `pulse_reengagement_queue`, `integrations_health_snapshot`, `reviews_list`.
7. Add `ava_sync_clinic` (only write — calls the existing callable, which already has its own auth check).

### Phase B — Manual usage (~1 week, no code)

Dogfood. Note which tool signatures are wrong, which response shapes are noisy, which tools are missing. Capture in a `dashboard/src/mcp/NOTES.md` while using it. This is the input to Phase C.

### Phase C — `/v3-mcp-optimization` (~1-2 days)

1. Apply learnings from NOTES.md: signature tweaks, response trimming, token-efficient summaries.
2. Add HTTP transport at `dashboard/src/app/api/mcp/route.ts`.
3. Add per-tool token budgets + response truncation.
4. Ship to one pilot clinic owner with their own Firebase token.

## Files to create

```
dashboard/src/mcp/server.ts
dashboard/src/mcp/context.ts
dashboard/src/mcp/registry.ts
dashboard/src/mcp/transports/stdio.ts
dashboard/src/mcp/transports/http.ts                  (Phase C)
dashboard/src/mcp/tools/ava/sync.ts
dashboard/src/mcp/tools/ava/preview-prompt.ts
dashboard/src/mcp/tools/ava/recent-calls.ts
dashboard/src/mcp/tools/ava/call-transcript.ts
dashboard/src/mcp/tools/appointments/list.ts
dashboard/src/mcp/tools/appointments/follow-up-drop-off.ts
dashboard/src/mcp/tools/appointments/weekly-summary.ts
dashboard/src/mcp/tools/pulse/reengagement-queue.ts
dashboard/src/mcp/tools/pulse/cohort-summary.ts
dashboard/src/mcp/tools/ops/integrations-health.ts
dashboard/src/mcp/tools/ops/reviews-list.ts
dashboard/src/mcp/__tests__/registry.test.ts
dashboard/src/app/api/mcp/route.ts                    (Phase C)
```

## Files to edit

- [dashboard/package.json](dashboard/package.json) — add `@modelcontextprotocol/sdk` dep, add `mcp:stdio` script. The existing `check:boundaries` script needs no change — `src/mcp/` is not in either watchlist.
- [dashboard/eslint.config.mjs](dashboard/eslint.config.mjs) — confirm `src/mcp/` is linted (it will be by default under `src/**`).

## Risks + mitigations

- **Admin SDK in stdio = full Firestore access.** Mitigation: hardcode `CLINIC_ID=spires` in `~/.claude.json` env. Treat as superadmin scope — same trust level as your own laptop.
- **Drift between `ava-core-prompt.ts` in `src/lib/ava/` and `dashboard/functions/src/sync-clinic-to-ava.ts`.** Already a known SYNC-LOCK risk in the codebase. MCP doesn't add risk if `ava_preview_prompt` reads only the `src/lib/ava/` copy and clearly labels it "preview — actual prompt synced server-side."
- **Two MCP servers (Python `ava-pms-tools` + new TS `stryde-ops`).** Different names, different audiences, both can be registered side-by-side. No conflict.
- **HTTP transport reuses `verifyApiRequest()` which already does session-version check + activity tracking** — no parallel auth path, no new attack surface.

## Verification

Phase A acceptance:
1. `cd dashboard && npm run build` — passes.
2. `cd dashboard && npm test` — passes (registry test + 1-2 tool tests).
3. `cd dashboard && npm run check:boundaries` — passes.
4. Add server to `~/.claude.json` with `CLINIC_ID=spires`. From a fresh Claude Code session: ask "what's Spires' weekly summary this week" → tool fires, returns the 6 KPIs from `metrics_weekly`.
5. Ask "show me the last 5 Ava calls" → returns call_log entries.
6. Ask "preview the Ava prompt" → returns rendered prompt with Spires variables interpolated.
7. Run `ava_sync_clinic` for Spires → confirm `clinics/spires.ava.syncState.lastSyncedAt` updates in Firestore console.

Phase C acceptance: same suite over HTTP with a real Firebase ID token (curl with `Authorization: Bearer <token>` POSTing JSON-RPC to `/api/mcp`).
