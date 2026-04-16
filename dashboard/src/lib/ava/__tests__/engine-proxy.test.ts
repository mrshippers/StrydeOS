/**
 * Tests for the Ava Python engine proxy.
 *
 * proxyToEngine() tries the Python service first.
 * Returns the result on success, null on timeout / error / non-200 (triggers fallback).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { proxyToEngine } from "@/lib/ava/engine-proxy";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ENGINE_URL = "http://localhost:8000";

const BASE_PAYLOAD = {
  tool_name: "check_availability",
  tool_input: { start_date: "2026-04-21", duration_minutes: 60 },
  clinic_id: "clinic_001",
  pms_type: "writeupp",
  api_key: "test_key",
  base_url: "",
};

function makeOkResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(body),
  };
}

function makeErrorResponse(status: number) {
  return {
    ok: false,
    status,
    json: vi.fn().mockResolvedValue({ detail: "error" }),
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("proxyToEngine — success path", () => {
  it("returns the engine result when Python service responds 200", async () => {
    mockFetch.mockResolvedValue(makeOkResponse({
      result: "Available: Monday 21 Apr at 2:00 PM",
      slots: ["2026-04-21T14:00:00"],
    }));

    const result = await proxyToEngine(ENGINE_URL, BASE_PAYLOAD);

    expect(result).not.toBeNull();
    expect(result!.result).toBe("Available: Monday 21 Apr at 2:00 PM");
    expect(result!.slots).toEqual(["2026-04-21T14:00:00"]);
  });

  it("returns booking_id for book_appointment calls", async () => {
    mockFetch.mockResolvedValue(makeOkResponse({
      result: "Booked John Doe in for Monday 21 Apr at 2:00 PM. Booking ID: apt_123",
      booking_id: "apt_123",
    }));

    const result = await proxyToEngine(ENGINE_URL, {
      ...BASE_PAYLOAD,
      tool_name: "book_appointment",
      tool_input: { patient_name: "John Doe", slot: "2026-04-21T14:00:00" },
    });

    expect(result!.booking_id).toBe("apt_123");
    expect(result!.result).toContain("John Doe");
  });

  it("POSTs to /api/tools/execute on the engine URL", async () => {
    mockFetch.mockResolvedValue(makeOkResponse({ result: "ok", slots: [] }));

    await proxyToEngine(ENGINE_URL, BASE_PAYLOAD);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("http://localhost:8000/api/tools/execute");
  });

  it("sends the full payload as JSON", async () => {
    mockFetch.mockResolvedValue(makeOkResponse({ result: "ok", slots: [] }));

    await proxyToEngine(ENGINE_URL, BASE_PAYLOAD);

    const [, options] = mockFetch.mock.calls[0];
    expect(options.method).toBe("POST");
    const body = JSON.parse(options.body as string);
    expect(body.tool_name).toBe("check_availability");
    expect(body.clinic_id).toBe("clinic_001");
    expect(body.api_key).toBe("test_key");
    expect(body.pms_type).toBe("writeupp");
  });

  it("sets Content-Type: application/json header", async () => {
    mockFetch.mockResolvedValue(makeOkResponse({ result: "ok", slots: [] }));

    await proxyToEngine(ENGINE_URL, BASE_PAYLOAD);

    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers?.["Content-Type"]).toBe("application/json");
  });
});

describe("proxyToEngine — fallback path", () => {
  it("returns null when engine returns non-200", async () => {
    mockFetch.mockResolvedValue(makeErrorResponse(500));

    const result = await proxyToEngine(ENGINE_URL, BASE_PAYLOAD);

    expect(result).toBeNull();
  });

  it("returns null when engine returns 422 (validation error)", async () => {
    mockFetch.mockResolvedValue(makeErrorResponse(422));

    const result = await proxyToEngine(ENGINE_URL, BASE_PAYLOAD);

    expect(result).toBeNull();
  });

  it("returns null when fetch throws (network error / engine down)", async () => {
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await proxyToEngine(ENGINE_URL, BASE_PAYLOAD);

    expect(result).toBeNull();
  });

  it("returns null when fetch aborts (timeout)", async () => {
    mockFetch.mockRejectedValue(new DOMException("The operation was aborted", "AbortError"));

    const result = await proxyToEngine(ENGINE_URL, BASE_PAYLOAD);

    expect(result).toBeNull();
  });
});

describe("proxyToEngine — timeout behaviour", () => {
  it("uses 3000ms default timeout via AbortSignal (live phone-call budget)", async () => {
    mockFetch.mockResolvedValue(makeOkResponse({ result: "ok", slots: [] }));

    vi.stubGlobal("AbortSignal", {
      timeout: vi.fn().mockReturnValue("mock-signal"),
    });

    await proxyToEngine(ENGINE_URL, BASE_PAYLOAD);

    expect(AbortSignal.timeout).toHaveBeenCalledWith(3000);
    const [, options] = mockFetch.mock.calls[0];
    expect(options.signal).toBe("mock-signal");
  });

  it("accepts a custom timeout override", async () => {
    mockFetch.mockResolvedValue(makeOkResponse({ result: "ok", slots: [] }));

    vi.stubGlobal("AbortSignal", {
      timeout: vi.fn().mockReturnValue("mock-signal"),
    });

    await proxyToEngine(ENGINE_URL, BASE_PAYLOAD, 3000);

    expect(AbortSignal.timeout).toHaveBeenCalledWith(3000);
  });
});
