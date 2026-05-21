/**
 * OAuth 2.0 token endpoint for the stryde-ops MCP connector.
 *
 * Implements client_credentials grant only. The "client secret" is the same
 * value as MCP_BEARER_SECRET — the issued access token is the secret itself,
 * so the existing verifyBearer() in the MCP route continues to work unchanged.
 *
 * claude.ai custom connectors call this before the first MCP request to
 * exchange the configured OAuth Client Secret for an access token.
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function tokenError(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let grantType: string | null = null;
  let clientSecret: string | null = null;

  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const form = await request.formData();
    grantType = form.get("grant_type") as string | null;
    clientSecret = form.get("client_secret") as string | null;
    // Also accept client_secret_basic via Authorization header
    if (!clientSecret) {
      const basic = request.headers.get("authorization") ?? "";
      if (basic.startsWith("Basic ")) {
        const decoded = Buffer.from(basic.slice(6), "base64").toString("utf8");
        clientSecret = decoded.split(":")[1] ?? null;
      }
    }
  } else {
    try {
      const body = (await request.json()) as Record<string, string>;
      grantType = body.grant_type ?? null;
      clientSecret = body.client_secret ?? null;
    } catch {
      return tokenError("invalid_request", 400);
    }
  }

  if (grantType !== "client_credentials") {
    return tokenError("unsupported_grant_type");
  }

  const expected = process.env.MCP_BEARER_SECRET?.trim();
  if (!expected) return tokenError("server_error", 500);
  if (!clientSecret) return tokenError("invalid_client", 401);
  if (clientSecret.length !== expected.length) return tokenError("invalid_client", 401);

  const match = crypto.timingSafeEqual(Buffer.from(clientSecret), Buffer.from(expected));
  if (!match) return tokenError("invalid_client", 401);

  return NextResponse.json({
    access_token: expected,
    token_type: "Bearer",
    expires_in: 86400,
  });
}
