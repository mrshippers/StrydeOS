# stryde-ops MCP - notes

Working notes for the MCP server. Read by /v3-mcp-optimization when Phase C kicks off.

Design principle, post-Phase-A discussion:

> **show me what's running, let me change its state**

If a tool doesn't fit that frame, it probably duplicates the dashboard and should be cut.

---

## Phase C cut list (likely dead)

These three duplicate dashboard UI. Faster to click a tab than ask Claude.

- `appointments_list` - dashboard has this
- `weekly_summary` - dashboard has this (Intelligence tab)
- `ava_list_recent_calls` - dashboard has this (Ava tab)

Kept through Phase B as smoke tests. Cut in Phase C unless dogfood week proves otherwise.

---

## Phase C keep list (earn their keep)

- `integrations_health_snapshot` - "why is the data stale" in 2 seconds
- `ava_sync_clinic` - trigger Ava re-sync without leaving the editor
- `ava_preview_prompt` - render current prompt while iterating
- `ava_get_call_transcript` - post-mortem on a specific call
- `pulse_reengagement_queue` - audit what Pulse is actually sending
- `reviews_list` - draft thank-yous + flag bad ones

---

## Phase C add list (missing pieces)

All in the monitoring/status-change frame.

- `ava_sync_state` - read `clinics/{id}.ava.syncState` without triggering a sync. Answers "did the last sync work" without firing another one. Strict read.
- `pulse_sequence_toggle` - flip `sequence_definitions.active` true/false for a named sequence. Write. Owner/admin only.
- `pipeline_status` - one tile across all data pipelines (Cliniko, Physitrack, Resend, etc). Cron schedule + last successful run + last error. Reads `integration_health` plus whatever the cron scheduler exposes.

Stretch:
- `ava_set_prompt_override` - temporarily inject a prompt addendum for testing without editing the full KB. Times out after N hours. Write.
- `pulse_review_action` - mark a review as actioned/responded in `reviews/{id}`. Write.
- `sar_status` - read pending SAR requests, mark actioned. Read+write.

---

## Phase B dogfood log

Add complaints, surprises, missing signatures here as they come up. Date them. Each entry should be one sentence describing the friction, not a full proposal.

- 2026-05-20: shipped HTTP transport ahead of schedule (route at `src/app/api/mcp/route.ts`) so the MCP can be used from claude.ai. Bearer-secret auth, scope hardcoded to Spires/superadmin. Dogfooding from claude.ai instead of Claude Code. Original Phase B + C plan collapsed into one pass.

## Phase D (deferred) - OAuth + per-clinic scoping

Required before exposing the HTTP transport to anyone other than the founder. Currently anyone with `MCP_BEARER_SECRET` has full Spires/superadmin access.

- Replace bearer-secret with Firebase ID token auth via existing `verifyApiRequest` from `@/lib/auth-guard`
- Or implement OAuth 2.1 flow if Anthropic's claude.ai integration requires it
- Derive `clinicId` + `role` from `VerifiedUser` instead of hardcoded constants in `route.ts`
- Rate limiting per token

---

## Open questions for Phase C

- HTTP transport auth: reuse `verifyApiRequest` from `@/lib/auth-guard`. Bearer token via Firebase ID token. Mount at `dashboard/src/app/api/mcp/route.ts`.
- Per-tool token budgets: probably set CHARACTER_LIMIT = 25000 globally for now, only override per tool if dogfood proves a tool needs it.
- Response shape: keep `{ data, summary }`. Consider adding `next_actions: string[]` for tools where the answer suggests an obvious follow-up (e.g. "stale Cliniko sync" -> "run pipeline_status with verbose=true").
- Pulse write safety: if `pulse_sequence_toggle` ships, it needs a confirmation token pattern (write the flip then read it back, error if drift). Pulse misfires cost real money in SMS.
