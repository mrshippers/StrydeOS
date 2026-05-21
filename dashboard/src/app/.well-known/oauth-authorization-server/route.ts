import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * OAuth 2.0 Authorization Server Metadata (RFC 8414).
 * Required so claude.ai custom connectors can discover the token endpoint
 * before initiating client_credentials flow.
 */
export async function GET() {
  const base = process.env.APP_URL?.trim() || "https://portal.strydeos.com";
  return NextResponse.json({
    issuer: base,
    token_endpoint: `${base}/api/mcp/token`,
    token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic"],
    grant_types_supported: ["client_credentials"],
    scopes_supported: [],
    response_types_supported: ["token"],
  });
}
