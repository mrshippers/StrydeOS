/**
 * stryde-ops MCP HTTP transport.
 *
 * Phase C entry point. Same registry as the stdio transport — only the
 * transport layer differs. Personal-use bearer secret auth (one secret in
 * MCP_BEARER_SECRET env), hardcoded Spires/superadmin scope.
 *
 * Endpoint: POST /api/mcp
 *
 * Add to claude.ai as a custom MCP integration:
 *   URL:    https://portal.strydeos.com/api/mcp
 *   Header: Authorization: Bearer <MCP_BEARER_SECRET>
 *
 * Promote to full OAuth + per-clinic scoping before exposing to anyone other
 * than the founder.
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { zodToJsonSchema } from "zod-to-json-schema";
import { getAdminDb } from "@/lib/firebase-admin";
import { TOOLS } from "@/mcp/registry";
import { hasRole, type ToolContext } from "@/mcp/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROTOCOL_VERSION = "2024-11-05";
const MCP_CLINIC_ID = (process.env.CLINIC_ID || "clinic-spires").trim();
const HARDCODED_ROLE = "superadmin" as const;

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

function rpcResult(id: string | number | null, result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id, result });
}

function rpcError(id: string | number | null, code: number, message: string, status = 200) {
  return NextResponse.json(
    { jsonrpc: "2.0", id, error: { code, message } },
    { status }
  );
}

function verifyBearer(request: NextRequest): boolean {
  const expected = process.env.MCP_BEARER_SECRET?.trim();
  if (!expected) return false;
  const header = request.headers.get("authorization")?.trim() ?? "";
  if (!header.startsWith("Bearer ")) return false;
  const presented = header.slice(7);
  if (presented.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(presented), Buffer.from(expected));
}

function buildContext(): ToolContext {
  return {
    clinicId: MCP_CLINIC_ID,
    role: HARDCODED_ROLE,
    db: getAdminDb(),
    env: {
      elevenLabsApiKey: process.env.ELEVENLABS_API_KEY?.trim(),
      firebaseProjectId: (
        process.env.FIREBASE_PROJECT_ID ||
        process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
      )?.trim(),
      appUrl: process.env.APP_URL?.trim() || "https://portal.strydeos.com",
    },
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!verifyBearer(request)) {
    return rpcError(null, -32001, "Unauthorized", 401);
  }

  let body: JsonRpcRequest;
  try {
    body = (await request.json()) as JsonRpcRequest;
  } catch {
    return rpcError(null, -32700, "Parse error", 400);
  }

  const id = body.id ?? null;

  switch (body.method) {
    case "initialize":
      return rpcResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "stryde-ops", version: "0.1.0" },
      });

    case "notifications/initialized":
      return new NextResponse(null, { status: 204 });

    case "ping":
      return rpcResult(id, {});

    case "tools/list": {
      const tools = TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: zodToJsonSchema(t.module.inputSchema, {
          target: "openApi3",
          $refStrategy: "none",
        }),
        annotations: t.annotations,
      }));
      return rpcResult(id, { tools });
    }

    case "tools/call": {
      const params = body.params ?? {};
      const toolName = params.name as string | undefined;
      const toolInput = (params.arguments as Record<string, unknown> | undefined) ?? {};

      const tool = TOOLS.find((t) => t.name === toolName);
      if (!tool) {
        return rpcError(id, -32601, `Tool not found: ${toolName ?? "<unnamed>"}`);
      }

      const ctx = buildContext();

      if (!hasRole(ctx.role, tool.requiredRoles)) {
        return rpcResult(id, {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error: Tool '${tool.name}' requires role in [${tool.requiredRoles.join(", ")}], current is '${ctx.role}'.`,
            },
          ],
        });
      }

      try {
        const parsed = tool.module.inputSchema.parse(toolInput);
        const result = await tool.module.run(ctx, parsed);
        return rpcResult(id, {
          content: [{ type: "text", text: result.summary }],
          structuredContent: result.data as Record<string, unknown>,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return rpcResult(id, {
          isError: true,
          content: [{ type: "text", text: `Error: ${msg}` }],
        });
      }
    }

    default:
      return rpcError(id, -32601, `Method not found: ${body.method}`);
  }
}

// Reject everything other than POST cleanly. Helps debugging if someone curls GET.
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { error: "MCP endpoint accepts POST only" },
    { status: 405, headers: { Allow: "POST" } }
  );
}
