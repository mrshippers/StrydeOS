/**
 * Tests for the request logger wrapper.
 *
 * Run: npx tsx --test src/lib/__tests__/request-logger.test.ts
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
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

// Restore after all tests (best-effort)
process.on("exit", () => {
  console.log = originalLog;
});

describe("withRequestLog", () => {
  it("logs successful requests with method, path, status, and duration", async () => {
    const handler = async () =>
      NextResponse.json({ ok: true }, { status: 200 });

    const wrapped = withRequestLog(handler);
    const req = new NextRequest("http://localhost:3000/api/test", {
      method: "POST",
    });

    const res = await wrapped(req);

    assert.equal(res.status, 200);
    assert.equal(logOutput.length, 1);

    const entry: RequestLogEntry = JSON.parse(logOutput[0]);
    assert.equal(entry.method, "POST");
    assert.equal(entry.path, "/api/test");
    assert.equal(entry.status, 200);
    assert.ok(entry.durationMs >= 0);
    assert.ok(entry.timestamp);
    assert.equal(entry.error, undefined);
  });

  it("logs errors when handler throws", async () => {
    const handler = async () => {
      throw new Error("Database connection failed");
    };

    const wrapped = withRequestLog(handler);
    const req = new NextRequest("http://localhost:3000/api/broken", {
      method: "GET",
    });

    await assert.rejects(() => wrapped(req), {
      message: "Database connection failed",
    });

    assert.equal(logOutput.length, 1);
    const entry: RequestLogEntry = JSON.parse(logOutput[0]);
    assert.equal(entry.method, "GET");
    assert.equal(entry.path, "/api/broken");
    assert.equal(entry.status, 500); // default when handler throws
    assert.equal(entry.error, "Database connection failed");
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

    assert.ok(receivedParams);
  });

  it("captures clinic ID from x-clinic-id header", async () => {
    const handler = async () => NextResponse.json({ ok: true });

    const wrapped = withRequestLog(handler);
    const req = new NextRequest("http://localhost:3000/api/test", {
      headers: { "x-clinic-id": "clinic-abc" },
    });

    await wrapped(req);

    const entry: RequestLogEntry = JSON.parse(logOutput[0]);
    assert.equal(entry.clinicId, "clinic-abc");
  });
});
