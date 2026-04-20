/**
 * Unit tests for POST /api/pms/import-csv/inbound
 *
 * Covers: happy-path CSV import via inbound email webhook, corrupt/missing
 * attachment handling, and sender allowlist enforcement against
 * `clinicProfile.allowedInboundSenders`.
 *
 * Run: npx vitest run src/app/api/pms/import-csv/inbound/__tests__/route.test.ts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Mocks (must be hoisted before route import) ────────────────────────────

vi.mock("@/lib/request-logger", () => ({
  withRequestLog: <H extends (...args: unknown[]) => unknown>(handler: H) => handler,
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimitAsync: vi.fn(),
}));

vi.mock("@/lib/csv-import/run-import", () => ({
  runCSVImport: vi.fn(),
}));

// Firestore mock: clinic doc + csv_import_history subcollection capture
type ClinicData = Record<string, unknown> | null;

const clinicState: { data: ClinicData; exists: boolean } = {
  data: null,
  exists: true,
};

const historyAdds: Array<Record<string, unknown>> = [];

const historyAddMock = vi.fn((doc: Record<string, unknown>) => {
  historyAdds.push(doc);
  return Promise.resolve({ id: `history-${historyAdds.length}` });
});

const clinicDocMock = {
  get: vi.fn(() =>
    Promise.resolve({
      exists: clinicState.exists,
      data: () => clinicState.data,
    })
  ),
  collection: vi.fn((name: string) => {
    if (name === "csv_import_history") {
      return { add: historyAddMock };
    }
    return { add: vi.fn() };
  }),
};

const mockDb = {
  collection: vi.fn((name: string) => {
    if (name === "clinics") {
      return {
        doc: vi.fn(() => clinicDocMock),
      };
    }
    return { doc: vi.fn() };
  }),
};

vi.mock("@/lib/firebase-admin", () => ({
  getAdminDb: () => mockDb,
}));

import { checkRateLimitAsync } from "@/lib/rate-limit";
import { runCSVImport } from "@/lib/csv-import/run-import";

// ─── Helpers ────────────────────────────────────────────────────────────────

const TEST_SECRET = "test-secret";

interface InboundFormFields {
  recipient?: string;
  from?: string;
  clinicId?: string;
  fileType?: string;
  file?: { name: string; content: string } | null;
}

function buildInboundRequest(
  fields: InboundFormFields,
  headers: Record<string, string> = { "x-inbound-secret": TEST_SECRET }
): NextRequest {
  const form = new FormData();
  if (fields.recipient !== undefined) form.set("recipient", fields.recipient);
  if (fields.from !== undefined) form.set("from", fields.from);
  if (fields.clinicId !== undefined) form.set("clinicId", fields.clinicId);
  if (fields.fileType !== undefined) form.set("fileType", fields.fileType);
  if (fields.file) {
    const blob = new Blob([fields.file.content], { type: "text/csv" });
    form.set("file", blob, fields.file.name);
  }

  return new NextRequest("http://localhost:3000/api/pms/import-csv/inbound", {
    method: "POST",
    headers,
    body: form,
  });
}

// ─── Setup ──────────────────────────────────────────────────────────────────

let POST: (req: NextRequest) => Promise<Response>;

beforeEach(async () => {
  vi.clearAllMocks();
  historyAdds.length = 0;

  // Default: rate limit allows through
  vi.mocked(checkRateLimitAsync).mockResolvedValue({
    limited: false,
    remaining: 119,
  });

  // Default: runCSVImport reports a clean happy-path result
  vi.mocked(runCSVImport).mockResolvedValue({
    ok: true,
    written: 42,
    skipped: 3,
    metricsWritten: 13,
    errors: [],
    schemaUsed: "writeupp_activity_by_date",
    warnings: [],
    message: "Imported 42 appointments records",
  });

  // Default clinic: live, no allowlist configured → back-compat (allow-all)
  clinicState.exists = true;
  clinicState.data = { status: "live", name: "Spires Physiotherapy" };

  // Env: stub the shared secret the route reads at module load
  vi.stubEnv("CSV_INBOUND_SECRET", TEST_SECRET);

  // Reset module registry so INBOUND_SECRET top-level const is re-read
  vi.resetModules();

  // Re-apply mocks after resetModules (module-scoped mocks are cleared)
  vi.doMock("@/lib/request-logger", () => ({
    withRequestLog: <H extends (...args: unknown[]) => unknown>(handler: H) => handler,
  }));
  vi.doMock("@/lib/rate-limit", () => ({
    checkRateLimitAsync,
  }));
  vi.doMock("@/lib/csv-import/run-import", () => ({
    runCSVImport,
  }));
  vi.doMock("@/lib/firebase-admin", () => ({
    getAdminDb: () => mockDb,
  }));

  const mod = await import("../route");
  POST = mod.POST as (req: NextRequest) => Promise<Response>;
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("POST /api/pms/import-csv/inbound", () => {
  // ── Happy path ─────────────────────────────────────────────────────────────
  it("runs the CSV import when auth + recipient + attachment are valid", async () => {
    const csv = "Date,Time,Practitioner,Patient ID\n2026-04-01,09:00,Andrew,P1\n";
    const request = buildInboundRequest({
      recipient: "import-clinic-spires@ingest.strydeos.com",
      from: "reports@spiresphysiotherapy.com",
      file: { name: "activity.csv", content: csv },
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.written).toBe(42);
    expect(json.skipped).toBe(3);

    expect(vi.mocked(runCSVImport)).toHaveBeenCalledTimes(1);
    const [, input] = vi.mocked(runCSVImport).mock.calls[0];
    expect(input.clinicId).toBe("clinic-spires");
    expect(input.csvText).toBe(csv);
    expect(input.importedBy).toBe("inbound_email");
  });

  // ── Corrupt / missing attachment ───────────────────────────────────────────
  it("returns 400 and logs a failure when the email has no attachment", async () => {
    const request = buildInboundRequest({
      recipient: "import-clinic-spires@ingest.strydeos.com",
      from: "reports@spiresphysiotherapy.com",
      file: null,
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe("No CSV attachment found");
    expect(vi.mocked(runCSVImport)).not.toHaveBeenCalled();

    // A failure record should be written to csv_import_history
    expect(historyAddMock).toHaveBeenCalledTimes(1);
    const [record] = historyAddMock.mock.calls[0] as [Record<string, unknown>];
    expect(record.source).toBe("inbound_email");
    expect(record.status).toBe("failed");
    expect(record.errorReason).toBe("no_attachment");
  });

  // ── Sender allowlist mismatch ─────────────────────────────────────────────
  it("returns 403 when sender is not on the clinic's allowedInboundSenders list", async () => {
    clinicState.data = {
      status: "live",
      name: "Spires Physiotherapy",
      allowedInboundSenders: ["reports@spiresphysiotherapy.com"],
    };

    const csv = "Date,Time,Practitioner,Patient ID\n2026-04-01,09:00,Andrew,P1\n";
    const request = buildInboundRequest({
      recipient: "import-clinic-spires@ingest.strydeos.com",
      from: "attacker@evil.example",
      file: { name: "activity.csv", content: csv },
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toBe("Sender not authorised for this clinic");
    expect(vi.mocked(runCSVImport)).not.toHaveBeenCalled();
  });

  it("allows the request when allowedInboundSenders is undefined (back-compat)", async () => {
    // clinicState.data has no allowedInboundSenders by default
    const csv = "Date,Time,Practitioner,Patient ID\n2026-04-01,09:00,Andrew,P1\n";
    const request = buildInboundRequest({
      recipient: "import-clinic-spires@ingest.strydeos.com",
      from: "anyone@anywhere.example",
      file: { name: "activity.csv", content: csv },
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(vi.mocked(runCSVImport)).toHaveBeenCalledTimes(1);
  });

  // ── Failure-snapshot capture ───────────────────────────────────────────────
  it("captures a headers+sample-rows snapshot when detection fails (needsMapping)", async () => {
    vi.mocked(runCSVImport).mockResolvedValueOnce({
      ok: false,
      needsMapping: true,
      headers: ["foo", "bar", "baz"],
      sampleRows: [],
      message: "Could not auto-detect CSV format",
    });

    const csv = "foo,bar,baz\n1,2,3\n4,5,6\n";
    const request = buildInboundRequest({
      recipient: "import-clinic-spires@ingest.strydeos.com",
      from: "reports@spiresphysiotherapy.com",
      file: { name: "random.csv", content: csv },
    });

    const response = await POST(request);
    expect(response.status).toBe(400); // needsMapping surfaces as 400
    expect(historyAddMock).toHaveBeenCalledTimes(1);
    const [record] = historyAddMock.mock.calls[0] as [Record<string, unknown>];
    expect(record.status).toBe("failed");
    expect(record.errorReason).toBe("needs_mapping");
    expect(record.snapshot).toBeDefined();
    const snap = record.snapshot as Record<string, unknown>;
    expect(snap.headers).toEqual(["foo", "bar", "baz"]);
    expect(snap.rows).toEqual([
      ["1", "2", "3"],
      ["4", "5", "6"],
    ]);
    const cols = snap.columns as Array<{ mapped: boolean }>;
    expect(cols.every((c) => c.mapped === false)).toBe(true);
  });

  it("captures detection + validation errors when validation fails", async () => {
    vi.mocked(runCSVImport).mockResolvedValueOnce({
      ok: false,
      validationErrors: [
        { type: "date_parse_failure_threshold", message: "30% dates unparseable" },
      ],
      warnings: [],
      stats: {
        totalRows: 3,
        validRows: 2,
        skippedRows: 1,
        dateParseFailures: 1,
        unknownStatuses: [],
        duplicateHash: null,
      },
      schemaUsed: "writeupp",
      message: "Validation failed",
    });

    const csv = [
      "Date,Time,Patient,Clinician,Status,Type",
      "bad-date,09:00,P1,Andrew,Attended,Physio",
    ].join("\n");

    const request = buildInboundRequest({
      recipient: "import-clinic-spires@ingest.strydeos.com",
      from: "reports@spiresphysiotherapy.com",
      file: { name: "writeupp.csv", content: csv },
    });

    const response = await POST(request);
    expect(response.status).toBe(400); // validation failure surfaces as 400
    expect(historyAddMock).toHaveBeenCalledTimes(1);
    const [record] = historyAddMock.mock.calls[0] as [Record<string, unknown>];
    expect(record.status).toBe("failed");
    expect(record.errorReason).toBe("validation_failed");
    const snap = record.snapshot as Record<string, unknown>;
    expect(snap.errors).toHaveLength(1);
    expect((snap.errors as Array<{ type: string }>)[0].type).toBe(
      "date_parse_failure_threshold",
    );
    // Columns should be mapped because detection re-ran from the schemaUsed
    const cols = snap.columns as Array<{ header: string; mapped: boolean }>;
    const mappedHeaders = cols.filter((c) => c.mapped).map((c) => c.header);
    expect(mappedHeaders).toContain("Date");
    expect(mappedHeaders).toContain("Clinician");
  });

  it("matches senders inside display-name wrappers (e.g. 'Name <addr@x>')", async () => {
    clinicState.data = {
      status: "live",
      name: "Spires Physiotherapy",
      allowedInboundSenders: ["jamal@spiresphysiotherapy.com"],
    };

    const csv = "Date,Time,Practitioner,Patient ID\n2026-04-01,09:00,Andrew,P1\n";
    const request = buildInboundRequest({
      recipient: "import-clinic-spires@ingest.strydeos.com",
      from: "Jamal Ofori <jamal@spiresphysiotherapy.com>",
      file: { name: "activity.csv", content: csv },
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(vi.mocked(runCSVImport)).toHaveBeenCalledTimes(1);
  });

  // ── Auth: missing secret header ────────────────────────────────────────────
  it("returns 401 and never invokes the import when the secret header is missing", async () => {
    const csv = "Date,Time,Practitioner,Patient ID\n2026-04-01,09:00,Andrew,P1\n";
    const request = buildInboundRequest(
      {
        recipient: "import-clinic-spires@ingest.strydeos.com",
        from: "reports@spiresphysiotherapy.com",
        file: { name: "activity.csv", content: csv },
      },
      {} // no x-inbound-secret header
    );

    const response = await POST(request);
    expect(response.status).toBe(401);
    expect(vi.mocked(runCSVImport)).not.toHaveBeenCalled();
    // Pre-auth failures cannot be tied to a clinic — no failure record is written.
    expect(historyAddMock).not.toHaveBeenCalled();
  });

  // ── Auth: wrong secret (timing-safe comparison) ───────────────────────────
  it("returns 401 when the secret header is provided but wrong", async () => {
    // Equal length to the configured secret to exercise timingSafeEqual without throwing
    const wrongButSameLength = "x".repeat(TEST_SECRET.length);

    const csv = "Date,Time,Practitioner,Patient ID\n2026-04-01,09:00,Andrew,P1\n";
    const request = buildInboundRequest(
      {
        recipient: "import-clinic-spires@ingest.strydeos.com",
        from: "reports@spiresphysiotherapy.com",
        file: { name: "activity.csv", content: csv },
      },
      { "x-inbound-secret": wrongButSameLength }
    );

    const response = await POST(request);
    expect(response.status).toBe(401);
    expect(vi.mocked(runCSVImport)).not.toHaveBeenCalled();
    expect(historyAddMock).not.toHaveBeenCalled();
  });

  // ── Rate limit ────────────────────────────────────────────────────────────
  it("returns 429 with X-RateLimit-Remaining when the rate limiter trips", async () => {
    vi.mocked(checkRateLimitAsync).mockResolvedValueOnce({
      limited: true,
      remaining: 0,
    });

    const csv = "Date,Time,Practitioner,Patient ID\n2026-04-01,09:00,Andrew,P1\n";
    const request = buildInboundRequest({
      recipient: "import-clinic-spires@ingest.strydeos.com",
      from: "reports@spiresphysiotherapy.com",
      file: { name: "activity.csv", content: csv },
    });

    const response = await POST(request);
    expect(response.status).toBe(429);
    expect(response.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(vi.mocked(runCSVImport)).not.toHaveBeenCalled();
    // Rate-limit noise is not useful in import history.
    expect(historyAddMock).not.toHaveBeenCalled();
  });

  // ── Clinic not found ──────────────────────────────────────────────────────
  it("returns 404 when the recipient resolves to a non-existent clinic", async () => {
    clinicState.exists = false;
    clinicState.data = null;

    const csv = "Date,Time,Practitioner,Patient ID\n2026-04-01,09:00,Andrew,P1\n";
    const request = buildInboundRequest({
      recipient: "import-unknown-clinic@ingest.strydeos.com",
      from: "reports@unknown.example",
      file: { name: "activity.csv", content: csv },
    });

    const response = await POST(request);
    expect(response.status).toBe(404);
    expect(vi.mocked(runCSVImport)).not.toHaveBeenCalled();
    // Cannot write to a nonexistent clinic's subcollection.
    expect(historyAddMock).not.toHaveBeenCalled();
  });

  // ── Clinic suspended ──────────────────────────────────────────────────────
  it("returns 403 when the clinic exists but is suspended", async () => {
    clinicState.data = {
      status: "suspended",
      name: "Spires Physiotherapy",
    };

    const csv = "Date,Time,Practitioner,Patient ID\n2026-04-01,09:00,Andrew,P1\n";
    const request = buildInboundRequest({
      recipient: "import-clinic-spires@ingest.strydeos.com",
      from: "reports@spiresphysiotherapy.com",
      file: { name: "activity.csv", content: csv },
    });

    const response = await POST(request);
    expect(response.status).toBe(403);
    expect(vi.mocked(runCSVImport)).not.toHaveBeenCalled();
    // We don't service suspended clinics — no failure record.
    expect(historyAddMock).not.toHaveBeenCalled();
  });

  // ── Empty CSV / validation failure ────────────────────────────────────────
  it("returns 400 and logs validation_failed when the CSV has no data rows", async () => {
    vi.mocked(runCSVImport).mockResolvedValueOnce({
      ok: false,
      validationErrors: [
        { type: "empty_file", message: "The CSV file contains no data rows." },
      ],
      warnings: [],
      stats: {
        totalRows: 0,
        validRows: 0,
        skippedRows: 0,
        dateParseFailures: 0,
        unknownStatuses: [],
        duplicateHash: null,
      },
      schemaUsed: "writeupp_activity_by_date",
      message: "Validation failed: The CSV file contains no data rows.",
    });

    const csv = "Date,Time,Practitioner,Patient ID\n"; // header only, no data rows
    const request = buildInboundRequest({
      recipient: "import-clinic-spires@ingest.strydeos.com",
      from: "reports@spiresphysiotherapy.com",
      file: { name: "empty.csv", content: csv },
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(vi.mocked(runCSVImport)).toHaveBeenCalledTimes(1);

    expect(historyAddMock).toHaveBeenCalledTimes(1);
    const [record] = historyAddMock.mock.calls[0] as [Record<string, unknown>];
    expect(record.source).toBe("inbound_email");
    expect(record.status).toBe("failed");
    expect(record.errorReason).toBe("validation_failed");
    expect(record.validationErrors).toEqual([
      { type: "empty_file", message: "The CSV file contains no data rows." },
    ]);

    // Response should carry the validation errors back to the caller (via spread/passthrough)
    expect(json.validationErrors).toBeDefined();
  });

  // ── runCSVImport throws unexpectedly ──────────────────────────────────────
  it("returns 500 with a generic message and logs internal_error when runCSVImport throws", async () => {
    vi.mocked(runCSVImport).mockRejectedValueOnce(new Error("Firestore quota exceeded"));

    const csv = "Date,Time,Practitioner,Patient ID\n2026-04-01,09:00,Andrew,P1\n";
    const request = buildInboundRequest({
      recipient: "import-clinic-spires@ingest.strydeos.com",
      from: "reports@spiresphysiotherapy.com",
      file: { name: "activity.csv", content: csv },
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(500);
    // MUST NOT leak the internal error message to the response body
    expect(json.error).toBe("Internal server error");
    expect(JSON.stringify(json)).not.toContain("Firestore quota exceeded");

    // A failure record IS written so we can debug after the fact
    expect(historyAddMock).toHaveBeenCalledTimes(1);
    const [record] = historyAddMock.mock.calls[0] as [Record<string, unknown>];
    expect(record.errorReason).toBe("internal_error");
    // The internal error message stored privately in the failure record (not the response)
    expect(record.errorMessage).toBe("Firestore quota exceeded");
  });

  // ── Idempotency: duplicate file hash ──────────────────────────────────────
  it("returns 200 with duplicate=true and writes no failure record on duplicate uploads", async () => {
    vi.mocked(runCSVImport).mockResolvedValueOnce({
      ok: true,
      written: 0,
      skipped: 0,
      metricsWritten: 0,
      errors: [],
      schemaUsed: "writeupp_activity_by_date",
      warnings: [],
      message: "Duplicate file — already imported",
      duplicate: true,
      fileHash: "sha256:abc",
    });

    const csv = "Date,Time,Practitioner,Patient ID\n2026-04-01,09:00,Andrew,P1\n";
    const request = buildInboundRequest({
      recipient: "import-clinic-spires@ingest.strydeos.com",
      from: "reports@spiresphysiotherapy.com",
      file: { name: "activity.csv", content: csv },
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.duplicate).toBe(true);
    expect(json.fileHash).toBe("sha256:abc");

    // Duplicate is a successful no-op, not a failure — don't pollute history
    expect(historyAddMock).not.toHaveBeenCalled();
  });
});
