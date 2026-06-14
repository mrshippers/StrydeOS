/**
 * OAuth 2.0 authorization endpoint — handles the form POST from /authorize.
 *
 * Validates the MCP bearer token entered by the user, then generates a
 * stateless PKCE authorization code and redirects to the client redirect_uri.
 *
 * The code is a signed payload: base64url(JSON({cc,exp})).base64url(HMAC-SHA256)
 * No server-side storage needed — the code_challenge is embedded in the code
 * and verified at token exchange time.
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const form = await request.formData();

  const token = form.get("token") as string | null;
  const redirectUri = form.get("redirect_uri") as string | null;
  const codeChallenge = form.get("code_challenge") as string | null;
  const codeChallengeMethod = (form.get("code_challenge_method") as string | null) ?? "S256";
  const state = form.get("state") as string | null;
  const clientId = (form.get("client_id") as string | null) ?? "";

  if (!redirectUri || !codeChallenge || !state) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  // Validate redirect_uri is claude.ai
  let parsedRedirect: URL;
  try {
    parsedRedirect = new URL(redirectUri);
    // Exact host match — a bare endsWith("claude.ai") would accept evilclaude.ai.
    const host = parsedRedirect.hostname;
    if (parsedRedirect.protocol !== "https:") throw new Error();
    if (host !== "claude.ai" && !host.endsWith(".claude.ai")) throw new Error();
  } catch {
    return NextResponse.json({ error: "invalid_redirect_uri" }, { status: 400 });
  }

  // Validate token
  const expected = process.env.MCP_BEARER_SECRET?.trim();
  if (!expected) return NextResponse.json({ error: "server_error" }, { status: 500 });

  const isValid =
    token !== null &&
    token.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));

  if (!isValid) {
    // Redirect back to authorize form with error
    const authorizeUrl = new URL(
      `/authorize?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&code_challenge=${encodeURIComponent(codeChallenge)}&code_challenge_method=${encodeURIComponent(codeChallengeMethod)}&state=${encodeURIComponent(state)}&error=invalid_token`,
      request.url
    );
    return NextResponse.redirect(authorizeUrl.toString(), 302);
  }

  // Generate stateless authorization code
  const payload = Buffer.from(
    JSON.stringify({ cc: codeChallenge, exp: Math.floor(Date.now() / 1000) + 300 })
  ).toString("base64url");

  const sig = crypto.createHmac("sha256", expected).update(payload).digest("base64url");
  const code = `${payload}.${sig}`;

  // Redirect to client callback
  parsedRedirect.searchParams.set("code", code);
  parsedRedirect.searchParams.set("state", state);

  return NextResponse.redirect(parsedRedirect.toString(), 302);
}
