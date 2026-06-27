/**
 * Auth contract for POST /api/ava/transfer.
 *
 * This route receives the ElevenLabs `transfer_to_reception` TOOL call. Tool
 * webhooks authenticate with `Authorization: Bearer <ELEVENLABS_WEBHOOK_SECRET>`
 * (HMAC signatures are only sent on conversation-event webhooks). The route must
 * therefore verify Bearer, not HMAC — otherwise every warm transfer 401s.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/request-logger", () => ({
  withRequestLog: (fn: unknown) => fn,
}));

vi.mock("@/lib/firebase-admin", () => ({
  getAdminDb: vi.fn(),
}));

vi.mock("@/lib/ava/transfer-call", () => ({
  transferCallToReception: vi.fn(),
}));

import { POST } from "../route";
import { getAdminDb } from "@/lib/firebase-admin";
import { transferCallToReception } from "@/lib/ava/transfer-call";

const AGENT_ID = "agent_spires_001";
const CLINIC_ID = "clinic-spires";
const SECRET = "test_webhook_secret";

function makeDb() {
  const clinicSnap = { empty: false, docs: [{ id: CLINIC_ID }] };
  const clinicsColRef = {
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    get: vi.fn().mockResolvedValue(clinicSnap),
  };
  return { collection: vi.fn().mockReturnValue(clinicsColRef) };
}

function makeRequest(auth?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth !== undefined) headers.authorization = auth;
  return new NextRequest("http://localhost/api/ava/transfer", {
    method: "POST",
    body: JSON.stringify({ agent_id: AGENT_ID, conversation_id: "conv_001", reason: "complaint" }),
    headers,
  });
}

describe("POST /api/ava/transfer — Bearer auth", () => {
  beforeEach(() => {
    process.env.ELEVENLABS_WEBHOOK_SECRET = SECRET;
    vi.mocked(getAdminDb).mockReturnValue(makeDb() as never);
    vi.mocked(transferCallToReception).mockResolvedValue({ success: true } as never);
  });

  afterEach(() => {
    delete process.env.ELEVENLABS_WEBHOOK_SECRET;
    vi.clearAllMocks();
  });

  it("rejects a request with no Authorization header (401)", async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it("rejects a wrong Bearer token (401)", async () => {
    const res = await POST(makeRequest("Bearer not-the-secret"));
    expect(res.status).toBe(401);
  });

  it("accepts a valid Bearer token and performs the transfer", async () => {
    const res = await POST(makeRequest(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(vi.mocked(transferCallToReception)).toHaveBeenCalledOnce();
    const json = await res.json();
    expect(json.result).toMatch(/transferr/i);
  });
});
