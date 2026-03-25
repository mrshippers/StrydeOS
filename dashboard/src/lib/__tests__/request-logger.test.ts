/**
 * Tests for the request logger wrapper.
 */

import { describe, it, beforeEach, expect, afterAll, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { withRequestLog, type RequestLogEntry } from "../request-logger";

// Capture console.log output for assertions
let logOutput: string[] = [];
const originalLog = console.log;

beforeEach(() => {
  logOutput = [];
  console.log = (...args: unknown[]) => {
    logOutput.push(args.map(String).join(" "));
  };
});

afterAll(() => {
  console.log = originalLog;
});

describe("withRequestLog", () => {
  it("logs successful requests with method, path, status, and duration", async () => {
    const handler = async (_req: NextRequest) =>
      NextResponse.json({ ok: true }, { status: 200 });

    const wrapped = withRequestLog(handler);
    const req = new NextRequest("http://localhost:3000/api/test", {
      method: "POST",
    });

    const res = await wrapped(req);

    expect(res.status).toBe(200);
    expect(logOutput.length).toBe(1);

    const entry: RequestLogEntry = JSON.parse(logOutput[0]);
    expect(entry.method).toBe("POST");
    expect(entry.path).toBe("/api/test");
    expect(entry.status).toBe(200);
    expect(entry.durationMs).toBeGreaterThanOrEqual(0);
    expect(entry.timestamp).toBeTruthy();
    expect(entry.error).toBeUndefined();
  });

  it("logs errors when handler throws", async () => {
    const handler = async (_req: NextRequest): Promise<NextResponse> => {
      throw new Error("Database connection failed");
    };

    const wrapped = withRequestLog(handler);
    const req = new NextRequest("http://localhost:3000/api/broken", {
      method: "GET",
    });

    await expect(wrapped(req)).rejects.toThrow("Database connection failed");

    expect(logOutput.length).toBe(1);
    const entry: RequestLogEntry = JSON.parse(logOutput[0]);
    expect(entry.method).toBe("GET");
    expect(entry.path).toBe("/api/broken");
    expect(entry.status).toBe(500); // default when handler throws
    expect(entry.error).toBe("Database connection failed");
  });

  it("passes through context to handler", async () => {
    let receivedParams: unknown = null;
    const handler = async (_req: NextRequest, ctx: any) => {
      receivedParams = ctx?.params;
      return NextResponse.json({ ok: true });
    };

    const wrapped = withRequestLog(handler);
    const req = new NextRequest("http://localhost:3000/api/test/123");
    const ctx = { params: Promise.resolve({ id: "123" }) };

    await wrapped(req, ctx);

    expect(receivedParams).toBeTruthy();
  });

  it("captures clinic ID from x-clinic-id header", async () => {
    const handler = async (_req: NextRequest) => NextResponse.json({ ok: true });

    const wrapped = withRequestLog(handler);
    const req = new NextRequest("http://localhost:3000/api/test", {
      headers: { "x-clinic-id": "clinic-abc" },
    });

    await wrapped(req);

    const entry: RequestLogEntry = JSON.parse(logOutput[0]);
    expect(entry.clinicId).toBe("clinic-abc");
  });
});
