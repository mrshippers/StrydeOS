import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * OAuth 2.0 Authorization Server Metadata (RFC 8414).
 * Required so claude.ai custom connectors can discover the token endpoint
 * and authorization endpoint before initiating the OAuth flow.
 */
export async function GET() {
  const base = (process.env.APP_URL?.trim() || "https://portal.strydeos.com").replace(/\/$/, "");
  return NextResponse.json({
    issuer: base,
    authorization_endpoint: `${base}/authorize`,
    token_endpoint: `${base}/api/mcp/token`,
    token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic"],
    grant_types_supported: ["client_credentials", "authorization_code"],
    code_challenge_methods_supported: ["S256"],
    response_types_supported: ["code", "token"],
    scopes_supported: [],
    // Canonical StrydeOS monolith mark, for clients that render a logo on the
    // OAuth consent screen. Same PNG the portal serves at /icon.
    logo_uri: `${base}/icon`,
  });
}
