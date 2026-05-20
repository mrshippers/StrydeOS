# stryde-ops MCP server

Founder-local TypeScript MCP server exposing read + control tools over StrydeOS clinic data and Ava. Phase A: stdio transport only, 11 tools.

See [MCP_PHASE_A_PLAN.md](../../docs/MCP_PHASE_A_PLAN.md) for the architecture decision and Phase B/C roadmap. See [NOTES.md](./NOTES.md) for the in-flight cut/keep/add list.

## Run locally

```bash
cd dashboard
npm run mcp:stdio
```

The server reads `dashboard/.env.local` for Firebase admin credentials and resolves clinic + role from env vars:

| Env var | Default | Purpose |
|---|---|---|
| `CLINIC_ID` | `spires` | Which clinic the tools scope to |
| `MCP_ROLE` | `superadmin` | Role gate (clinician / admin / owner / superadmin) |
| `ELEVENLABS_API_KEY` | unset | Required for any Ava transcript / agent fetch tool |

## Register with Claude Code

Add this to `~/.claude.json` under `mcpServers`:

```json
"stryde-ops": {
  "type": "stdio",
  "command": "npm",
  "args": ["run", "--silent", "mcp:stdio"],
  "cwd": "/Users/joa/Desktop/StrydeOS/dashboard",
  "env": {
    "CLINIC_ID": "spires",
    "MCP_ROLE": "superadmin"
  }
}
```

Restart Claude Code / the VS Code extension to pick it up.

## Smoke asks

After restart, these three should work end-to-end:

- "show me the last 5 Ava calls" -> `ava_list_recent_calls`
- "Spires weekly summary" -> `weekly_summary`
- "preview the Ava prompt for Spires" -> `ava_preview_prompt`

If they 401/500, the issue is Firebase admin creds in `dashboard/.env.local`, not the MCP code.

## Tool surface (Phase A)

| Tool | Role | Type |
|---|---|---|
| `ava_list_recent_calls` | clinic member | read |
| `ava_preview_prompt` | owner+ | read |
| `ava_get_call_transcript` | owner+ | read (PHI) |
| `ava_sync_clinic` | owner+ | write (triggers `onClinicWrite`) |
| `appointments_list` | clinic member | read |
| `appointments_follow_up_drop_off` | owner+ | read |
| `weekly_summary` | clinic member | read |
| `pulse_cohort_summary` | owner+ | read |
| `pulse_reengagement_queue` | owner+ | read |
| `integrations_health_snapshot` | owner+ | read |
| `reviews_list` | owner+ | read |

## Layout

```
dashboard/src/mcp/
├── server.ts              entry point, stdio transport
├── context.ts             ToolContext resolver
├── registry.ts            tool registration + role gating
├── types.ts               shared types
├── tools/                 one file per tool
│   ├── ava/
│   ├── appointments/
│   ├── pulse/
│   └── ops/
├── __tests__/             registry smoke test
├── NOTES.md               working notes (Phase B dogfood log + Phase C plan)
└── README.md              this file
```

## Three-server landscape

There are three MCP servers in the StrydeOS orbit. Do not confuse them.

1. **stryde-ops** (this server, TypeScript) — inbound, founder-local. You query clinic data + control Ava from Claude/Cursor.
2. **ava-pms-tools** (`ava_graph/mcp_server.py`, Python FastMCP) — outbound. Ava's PMS booking tools during live calls (LangGraph orchestrates).
3. **strydeOS** (`scripts/strydeOS_mcp.py`, Python FastMCP) — reference. Pricing matrix + pilot metrics for marketing/sales drafting.

Different audiences, different code paths, no overlap.
