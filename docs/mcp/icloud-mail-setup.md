# Making the iCloud Mail MCP available in Claude Code on the web

## Why it isn't there already

When you ran the iCloud MCP in the VS Code terminal you almost certainly used
`claude mcp add`. That writes to your **local user config** (`~/.claude.json`),
which lives on your machine. **Claude Code on the web runs in an isolated cloud
container that does not read your local config** — it only sees what is committed
to the repo.

Per the [Claude Code on the web docs](https://code.claude.com/docs/en/claude-code-on-the-web),
the carry-over rule is:

| Config | Carries over to web? | Why |
|--------|----------------------|-----|
| Repo's `.mcp.json` (project scope) | ✅ Yes | Part of the clone |
| Servers added via `claude mcp add` | ❌ No | Written to local user config, not the repo |

## How to fix it

1. **Copy the template to a real config:**
   ```bash
   cp .mcp.json.example .mcp.json
   ```
2. **Fill in the server command.** Replace `REPLACE_WITH_YOUR_ICLOUD_MCP_PACKAGE`
   with the actual package/command you used locally. Find it with:
   ```bash
   claude mcp list           # shows the configured servers
   cat ~/.claude.json        # the icloud-mail entry: command + args
   ```
   Paste that `command` / `args` into `.mcp.json`.
3. **Commit `.mcp.json`** so web sessions pick it up.

## Three caveats specific to a cloud session

1. **stdio servers need their binary present.** If the server launches a local
   command, that command must exist in the container. Either invoke it via `npx`
   (as in the template) so it installs on demand, or install it in the
   environment's **setup script**. A binary you built only on your Mac will not
   be there.
2. **Credentials.** There is **no secrets store for web yet**. Supply the iCloud
   **app-specific password** as an environment variable in the environment
   configuration (Settings → your environment → environment variables). Note the
   docs' warning: those values are visible to anyone who can edit that
   environment. The template references it as `${ICLOUD_APP_PASSWORD}`.
3. **No interactive auth.** Browser/OAuth/SSO login cannot run headless in a
   cloud session. The server must authenticate with a token / app-password only.

## Notes

- A **remote (HTTP/SSE) MCP server** is the easiest option if available — no
  local binary to install.
- This repo already standardises secrets in **Doppler** (see root `CLAUDE.md`).
  Once a web secrets store exists, prefer wiring `ICLOUD_APP_PASSWORD` through
  Doppler rather than the environment-config env var.
- `.mcp.json` is intentionally **not committed** in this PR — only
  `.mcp.json.example` — because it needs your real package + credentials and a
  placeholder command would make every session try (and fail) to launch it.
