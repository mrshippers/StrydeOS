/**
 * Tests for the Heidi Health API client.
 *
 * All tests use fetch mocks — no real HTTP calls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const MOCK_JWT = "eyJhbGciOiJIUzI1NiJ9.mock.sig";
const MOCK_EXPIRY = new Date(Date.now() + 3_600_000).toISOString(); // 1hr from now

const BASE_CONFIG = {
  apiKey: "test-api-key-123",
  region: "uk" as const,
};

function mockFetch(responses: Array<{ ok: boolean; status?: number; body: unknown }>) {
  let call = 0;
  return vi.fn().mockImplementation(() => {
    const r = responses[call++] ?? responses[responses.length - 1];
    return Promise.resolve({
      ok: r.ok,
      status: r.status ?? (r.ok ? 200 : 500),
      statusText: r.ok ? "OK" : "Error",
      text: () => Promise.resolve(typeof r.body === "string" ? r.body : JSON.stringify(r.body)),
      json: () => Promise.resolve(r.body),
    });
  });
}

describe("getHeidiJwt", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exchanges API key for JWT", async () => {
    global.fetch = mockFetch([
      { ok: true, body: { token: MOCK_JWT, expiration_time: MOCK_EXPIRY } },
    ]);

    const { getHeidiJwt } = await import("../client");
    const token = await getHeidiJwt(BASE_CONFIG, "clinician@spires.co.uk");
    expect(token).toBe(MOCK_JWT);
    expect(global.fetch).toHaveBeenCalledOnce();
    const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain("/jwt");
    expect(url).toContain("email=clinician%40spires.co.uk");
  });

  it("passes third_party_internal_id when provided", async () => {
    global.fetch = mockFetch([
      { ok: true, body: { token: MOCK_JWT, expiration_time: MOCK_EXPIRY } },
    ]);

    const { getHeidiJwt } = await import("../client");
    await getHeidiJwt(BASE_CONFIG, "clinician@spires.co.uk", "clinician-id-abc");
    const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain("third_party_internal_id=clinician-id-abc");
  });

  it("throws when Heidi returns 401", async () => {
    global.fetch = mockFetch([{ ok: false, status: 401, body: "Unauthorized" }]);

    const { getHeidiJwt } = await import("../client");
    await expect(getHeidiJwt(BASE_CONFIG, "bad@example.com")).rejects.toThrow(
      /Heidi API 401/,
    );
  });

  it("throws when Heidi returns 503", async () => {
    global.fetch = mockFetch([{ ok: false, status: 503, body: "Service Unavailable" }]);

    const { getHeidiJwt } = await import("../client");
    await expect(getHeidiJwt(BASE_CONFIG, "clinician@spires.co.uk")).rejects.toThrow(
      /Heidi API 503/,
    );
  });
});

describe("validateApiKey", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns true when JWT exchange succeeds", async () => {
    global.fetch = mockFetch([
      { ok: true, body: { token: MOCK_JWT, expiration_time: MOCK_EXPIRY } },
    ]);

    const { validateApiKey } = await import("../client");
    const result = await validateApiKey(BASE_CONFIG, "clinician@spires.co.uk");
    expect(result).toBe(true);
  });

  it("returns false when JWT exchange fails", async () => {
    global.fetch = mockFetch([{ ok: false, status: 401, body: "Unauthorized" }]);

    const { validateApiKey } = await import("../client");
    const result = await validateApiKey(BASE_CONFIG, "bad@example.com");
    expect(result).toBe(false);
  });
});

describe("fetchSessions", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns sessions array", async () => {
    const sessions = [
      { id: "sess-1", status: "APPROVED", created_at: "2026-04-01T10:00:00Z", updated_at: "2026-04-01T11:00:00Z" },
    ];
    global.fetch = mockFetch([{ ok: true, body: sessions }]);

    const { fetchSessions } = await import("../client");
    const result = await fetchSessions(BASE_CONFIG, MOCK_JWT);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("sess-1");
  });

  it("passes since and status filters as query params", async () => {
    global.fetch = mockFetch([{ ok: true, body: [] }]);

    const { fetchSessions } = await import("../client");
    await fetchSessions(BASE_CONFIG, MOCK_JWT, { since: "2026-01-01T00:00:00Z", status: "APPROVED" });
    const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain("updated_after=2026-01-01");
    expect(url).toContain("status=APPROVED");
  });
});

describe("fetchSessionDocuments", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches documents for a session", async () => {
    const docs = [
      {
        id: "doc-1",
        session_id: "sess-1",
        name: "SOAP Note",
        content_type: "MARKDOWN",
        content: "# SOAP Note\n**S:** Pain 6/10",
        voice_style: "GOLDILOCKS",
      },
    ];
    global.fetch = mockFetch([{ ok: true, body: docs }]);

    const { fetchSessionDocuments } = await import("../client");
    const result = await fetchSessionDocuments(BASE_CONFIG, MOCK_JWT, "sess-1");
    expect(result[0].content).toContain("SOAP");
    const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain("/sessions/sess-1/documents");
  });
});

describe("fetchClinicalCodes", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches clinical codes for a session", async () => {
    const codes = [
      {
        primary_code: { code: "M54.5", code_system: "ICD-10", display: "Low back pain" },
        relevance_score: 0.95,
      },
    ];
    global.fetch = mockFetch([{ ok: true, body: codes }]);

    const { fetchClinicalCodes } = await import("../client");
    const result = await fetchClinicalCodes(BASE_CONFIG, MOCK_JWT, "sess-1");
    expect(result[0].primary_code.code).toBe("M54.5");
    const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain("/sessions/sess-1/clinical-codes");
  });
});

describe("askHeidi", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts question and returns answer", async () => {
    global.fetch = mockFetch([{ ok: true, body: { answer: "6" } }]);

    const { askHeidi } = await import("../client");
    const answer = await askHeidi(BASE_CONFIG, MOCK_JWT, "sess-1", "What is the pain score?");
    expect(answer).toBe("6");
    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toContain("/sessions/sess-1/ask-ai");
    expect(call[1].method).toBe("POST");
    const body = JSON.parse(call[1].body as string);
    expect(body.question).toBe("What is the pain score?");
  });
});
