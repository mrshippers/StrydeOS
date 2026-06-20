import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

// ─── Env ─────────────────────────────────────────────────────────────────────

const TEST_SECRET = "test-webhook-secret";

// ─── Canonical handler mock ────────────────────────────────────────────────────
//
// /api/ava/post-call is now a THIN DELEGATE: it verifies the inbound signature,
// normalises the post_call_transcription shape, re-signs, and forwards to the
// canonical /api/webhooks/elevenlabs handler. These tests assert the delegate's
// own behaviour (verify / normalise / forward) and capture what it forwards —
// the canonical handler's write logic is covered by its own test.

const canonicalPost = vi.fn(async (req: NextRequest) => {
  // Echo back the forwarded body so the test can assert the normalisation.
  const forwardedBody = await req.text();
  return NextResponse.json({ ok: true, forwarded: JSON.parse(forwardedBody) }, { status: 200 });
});

vi.mock("@/app/api/webhooks/elevenlabs/route", () => ({
  POST: (req: NextRequest) => canonicalPost(req),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Fresh timestamp so the verifier's +/-5min replay window accepts the sig. */
function makeSignature(secret: string, rawBody: string): string {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const hmac = crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return `t=${timestamp},v0=${hmac}`;
}

function makeRequest(
  body: unknown,
  opts: { secret?: string; badSignature?: boolean; noSignature?: boolean } = {}
): NextRequest {
  const rawBody = JSON.stringify(body);
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (!opts.noSignature && (opts.secret || process.env.ELEVENLABS_WEBHOOK_SECRET)) {
    const secret = opts.secret ?? process.env.ELEVENLABS_WEBHOOK_SECRET ?? "";
    if (opts.badSignature) {
      headers["elevenlabs-signature"] = `t=${Math.floor(Date.now() / 1000)},v0=deadbeef`;
    } else {
      headers["elevenlabs-signature"] = makeSignature(secret, rawBody);
    }
  }

  return new NextRequest("http://localhost/api/ava/post-call", {
    method: "POST",
    headers,
    body: rawBody,
  });
}

function makePayload(overrides: Record<string, unknown> = {}) {
  return {
    type: "post_call_transcription",
    event_timestamp: 1700000000,
    data: {
      conversation_id: "conv_test123",
      agent_id: "agent_spires",
      status: "done",
      transcript: [
        { role: "agent", message: "Hello, Spires Physiotherapy." },
        { role: "user", message: "Hi, I need to book an appointment." },
      ],
      metadata: {
        start_time_unix_secs: 1700000000,
        call_duration_secs: 45,
        termination_reason: "user_hangup",
        phone_call: { caller_id: "+447700900001", callee_id: "+442045727044" },
      },
      analysis: {
        call_successful: "success",
        transcript_summary: "Caller requested appointment booking.",
      },
      ...overrides,
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/ava/post-call (delegate)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset modules so verify-signature re-captures the env below. Without this,
    // the config_missing test's resetModules leaves an empty-secret module
    // cached for later tests.
    vi.resetModules();
    process.env.ELEVENLABS_WEBHOOK_SECRET = TEST_SECRET;
  });

  // ── Forwarding / normalisation ─────────────────────────────────────────────

  it("forwards a post_call_transcription to the canonical handler as conversation.ended", async () => {
    const { POST } = await import("../route");
    const res = await POST(makeRequest(makePayload()));

    expect(res.status).toBe(200);
    expect(canonicalPost).toHaveBeenCalledTimes(1);

    // The delegate must forward a re-signed request with a valid fresh signature.
    const [forwardedReq] = canonicalPost.mock.calls[0] as [NextRequest];
    expect(forwardedReq.headers.get("elevenlabs-signature")).toMatch(/^t=\d+,v0=[0-9a-f]+$/);

    const json = await res.json();
    expect(json.forwarded.event).toBe("conversation.ended");
    expect(json.forwarded.conversation_id).toBe("conv_test123");
    expect(json.forwarded.agent_id).toBe("agent_spires");
    expect(json.forwarded.caller_phone).toBe("+447700900001");
    expect(json.forwarded.call_duration).toBe(45);
    expect(json.forwarded.summary).toBe("Caller requested appointment booking.");
    // Transcript turns are flattened into a single string.
    expect(String(json.forwarded.transcript)).toContain("Ava: Hello, Spires Physiotherapy.");
    expect(String(json.forwarded.transcript)).toContain("Caller: Hi, I need to book an appointment.");
  });

  it("does NOT write a divergent voiceInteractions collection (split-brain closed)", async () => {
    // The delegate imports no Firestore client of its own — it only forwards.
    // A successful forward + zero direct writes proves the split brain is gone.
    const { POST } = await import("../route");
    const res = await POST(makeRequest(makePayload()));
    expect(res.status).toBe(200);
    expect(canonicalPost).toHaveBeenCalledTimes(1);
  });

  // ── HMAC validation ────────────────────────────────────────────────────────

  it("rejects with 403 when HMAC signature is invalid (no forward)", async () => {
    const { POST } = await import("../route");
    const res = await POST(makeRequest(makePayload(), { badSignature: true }));

    expect(res.status).toBe(403);
    expect(canonicalPost).not.toHaveBeenCalled();
  });

  it("rejects with 403 when signature header is missing and secret is configured", async () => {
    const { POST } = await import("../route");
    const res = await POST(makeRequest(makePayload(), { noSignature: true }));

    expect(res.status).toBe(403);
    expect(canonicalPost).not.toHaveBeenCalled();
  });

  it("fails closed (config_missing, no forward) when ELEVENLABS_WEBHOOK_SECRET is not set", async () => {
    delete process.env.ELEVENLABS_WEBHOOK_SECRET;
    vi.resetModules();
    const { POST } = await import("../route");
    const res = await POST(makeRequest(makePayload(), { noSignature: true }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ error: "config_missing" });
    expect(canonicalPost).not.toHaveBeenCalled();
  });

  // ── Event type filter ──────────────────────────────────────────────────────

  it("skips non-post_call_transcription events without forwarding", async () => {
    const { POST } = await import("../route");
    const body = { type: "agent_response", data: { conversation_id: "conv_x", agent_id: "agent_x" } };
    const res = await POST(makeRequest(body));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.skipped).toBe(true);
    expect(canonicalPost).not.toHaveBeenCalled();
  });

  // ── Missing required fields ────────────────────────────────────────────────

  it("returns 400 when conversation_id is missing", async () => {
    const { POST } = await import("../route");
    const body = makePayload({ conversation_id: undefined });
    delete (body.data as Record<string, unknown>).conversation_id;
    const res = await POST(makeRequest(body));

    expect(res.status).toBe(400);
    expect(canonicalPost).not.toHaveBeenCalled();
  });

  it("returns 400 when body is not valid JSON", async () => {
    const { POST } = await import("../route");
    const res = await POST(
      new NextRequest("http://localhost/api/ava/post-call", {
        method: "POST",
        body: "not json",
        headers: { "elevenlabs-signature": makeSignature(TEST_SECRET, "not json") },
      })
    );
    expect(res.status).toBe(400);
    expect(canonicalPost).not.toHaveBeenCalled();
  });
});
