#!/usr/bin/env node
/**
 * stryde-ops MCP server (stdio).
 *
 * Founder-local inbound MCP server exposing read-only StrydeOS clinic data
 * plus a single auth-gated write (ava_sync_clinic). HTTP transport is Phase C.
 *
 * Run via: npm run mcp:stdio
 * Register at ~/.claude.json under mcpServers with env CLINIC_ID and MCP_ROLE.
 */

import { config as loadEnv } from "dotenv";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { resolveStdioContext } from "./context";
import { registerAll, TOOLS } from "./registry";

// Load env from the dashboard's .env.local before resolving Firebase admin creds.
// Imports above don't read process.env at module load — env access happens lazily
// inside main() via getAdminDb(), so this runs early enough.
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" }); // fallback, won't overwrite already-loaded keys

async function main(): Promise<void> {
  // Stdio MCP servers must NOT log to stdout — stdout is the protocol channel.
  // Always use console.error for logs.
  const ctx = resolveStdioContext();

  const server = new McpServer({
    name: "stryde-ops",
    version: "0.1.0",
  });

  registerAll(server, ctx);

  console.error(
    `[stryde-ops] starting stdio transport — clinic=${ctx.clinicId} role=${ctx.role} tools=${TOOLS.length}`
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("[stryde-ops] fatal:", err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
