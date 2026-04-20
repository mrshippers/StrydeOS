import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { runCSVImport } from "@/lib/csv-import/run-import";
import { withRequestLog } from "@/lib/request-logger";
import { buildFailureSnapshot, type FailureSnapshot } from "@/lib/csv-import/failure-snapshot";
import { detectSchema } from "@/lib/csv-import/detect";
import { BUILTIN_SCHEMAS, getSchemaById } from "@/lib/csv-import/schemas";
import type { CSVFileType } from "@/lib/csv-import/types";

/**
 * Inbound email → CSV import endpoint.
 *
 * Called by Mailgun/SendGrid inbound webhook or n8n flow.
 * Auth: shared secret in X-Inbound-Secret header (env: CSV_INBOUND_SECRET).
 * ClinicId: derived from recipient email (import-{clinicId}@ingest.strydeos.com)
 * or passed explicitly in form field "clinicId".
 *
 * Env vars required:
 *   CSV_INBOUND_SECRET — shared secret for inbound webhook auth
 *   INGEST_EMAIL_DOMAIN — e.g. "ingest.strydeos.com" (for display; parsing uses clinicId field)
 */

const INBOUND_SECRET = process.env.CSV_INBOUND_SECRET?.trim() ?? "";

function extractClinicIdFromRecipient(recipient: string): string | null {
  const match = recipient.match(/^import-([a-zA-Z0-9_-]+)@/);
  return match ? match[1] : null;
}

/**
 * Mailgun often sends `from` as `"Display Name" <addr@host>`. Extract the
 * bare email address if wrapped, otherwise return the trimmed input.
 */
function extractEmailAddress(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return (match ? match[1] : from).trim().toLowerCase();
}

function isSenderAllowed(allowlist: string[] | undefined, from: string): boolean {
  // No allowlist configured → back-compat: allow (caller should log a warning).
  if (!allowlist || allowlist.length === 0) return true;
  const sender = extractEmailAddress(from);
  if (!sender) return false;
  return allowlist.some((entry) => sender === entry.trim().toLowerCase());
}

interface FailureRecordInput {
  clinicId: string;
  errorReason: string;
  fileName: string | null;
  sender: string;
  recipient: string;
  /** Optional structured validation errors from runCSVImport. */
  validationErrors?: { type: string; message: string; details?: Record<string, unknown> }[];
  /** Internal-only: full error message for 500s. NEVER returned to the response body. */
  errorMessage?: string;
  /** Rainbow-CSV-style preview snapshot for the Settings page debug view. */
  snapshot?: FailureSnapshot;
}

async function writeFailureRecord(
  db: ReturnType<typeof getAdminDb>,
  input: FailureRecordInput
): Promise<void> {
  try {
    const now = new Date().toISOString();
    const doc: Record<string, unknown> = {
      source: "inbound_email",
      status: "failed",
      errorReason: input.errorReason,
      fileName: input.fileName,
      sender: input.sender,
      recipient: input.recipient,
      createdAt: now,
      // Also set importedAt so the history listing (ordered by importedAt desc)
      // surfaces failures alongside successes. Without this, failure records
      // are invisible to clinic owners.
      importedAt: now,
    };
    if (input.validationErrors) doc.validationErrors = input.validationErrors;
    if (input.errorMessage) doc.errorMessage = input.errorMessage;
    if (input.snapshot) doc.snapshot = input.snapshot;

    await db
      .collection("clinics")
      .doc(input.clinicId)
      .collection("csv_import_history")
      .add(doc);
  } catch (err) {
    console.error("[pms/import-csv/inbound] failed to write failure record", err);
  }
}

/**
 * Re-detect schema from CSV headers so the failure snapshot can display
 * which columns mapped. runCSVImport returns only the schemaId on validation
 * failure, so we reconstruct a DetectionResult here by running detectSchema
 * against the same header row the pipeline saw.
 */
function rehydrateDetection(
  csvText: string,
  fileType: CSVFileType,
  schemaId: string,
) {
  const firstLine = csvText.replace(/\r\n/g, "\n").split("\n")[0] ?? "";
  // Use the pipeline's CSV header parser semantics via a split + quote-strip.
  // Good enough for detection rehydration (detectSchema is already trim-forgiving).
  const headers = firstLine
    .split(",")
    .map((h) => h.replace(/^\s*"|"\s*$/g, "").trim());

  const schema = getSchemaById(schemaId);
  if (!schema) return undefined;
  return detectSchema(headers, [schema, ...BUILTIN_SCHEMAS], fileType) ?? undefined;
}

async function handler(request: NextRequest): Promise<NextResponse> {
  // Rate limit: 120 requests per 60 seconds (external email-to-CSV inbound webhook)
  const { limited, remaining } = await checkRateLimitAsync(request, { limit: 120, windowMs: 60_000 });
  if (limited) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "X-RateLimit-Remaining": String(remaining) } }
    );
  }

  if (!INBOUND_SECRET) {
    return NextResponse.json({ error: "Inbound import not configured" }, { status: 503 });
  }

  const secret = request.headers.get("x-inbound-secret")?.trim() ?? "";
  if (
    !secret ||
    secret.length !== INBOUND_SECRET.length ||
    !crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(INBOUND_SECRET))
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Context captured incrementally so the outer catch can log a failure
  // record with as much detail as we have, and so a 500 path can still
  // observe what was being processed when it blew up.
  const db = getAdminDb();
  let clinicId = "";
  let recipient = "";
  let from = "";
  let fileName: string | null = null;

  try {
    const formData = await request.formData();

    // Accept both Mailgun ("recipient") and SendGrid/Twilio ("to") field names.
    recipient = ((formData.get("recipient") ?? formData.get("to")) as string) ?? "";
    from = ((formData.get("from") as string) ?? "").trim();

    clinicId = (formData.get("clinicId") as string) ?? "";
    if (!clinicId) {
      clinicId = extractClinicIdFromRecipient(recipient) ?? "";
    }
    if (!clinicId) {
      return NextResponse.json({ error: "Could not determine clinicId from recipient or form data" }, { status: 400 });
    }

    const clinicDoc = await db.collection("clinics").doc(clinicId).get();
    if (!clinicDoc.exists) {
      // Cannot write to a nonexistent clinic's subcollection — accept the loss of observability.
      return NextResponse.json({ error: "Clinic not found" }, { status: 404 });
    }

    const clinicData = clinicDoc.data() as
      | { status?: string; allowedInboundSenders?: string[] }
      | undefined;
    if (clinicData?.status === "suspended" || clinicData?.status === "deleted") {
      // We don't service suspended clinics — no failure record.
      return NextResponse.json({ error: "Clinic is not active" }, { status: 403 });
    }

    // Accept Mailgun ("file") and SendGrid/Twilio ("attachment1") field names.
    const file = (formData.get("file") ?? formData.get("attachment1")) as File | null;
    fileName = file?.name ?? null;

    // Sender allowlist enforcement — only when the clinic has configured one.
    // Back-compat: clinics without allowedInboundSenders get the previous behaviour.
    const allowlist = clinicData?.allowedInboundSenders;
    if (!allowlist || allowlist.length === 0) {
      console.warn(
        `[pms/import-csv/inbound] clinic ${clinicId} has no allowedInboundSenders configured — allowing all senders`
      );
    } else if (!isSenderAllowed(allowlist, from)) {
      await writeFailureRecord(db, {
        clinicId,
        errorReason: "sender_not_authorised",
        fileName,
        sender: from,
        recipient,
      });
      return NextResponse.json(
        { error: "Sender not authorised for this clinic" },
        { status: 403 }
      );
    }

    if (!file) {
      await writeFailureRecord(db, {
        clinicId,
        errorReason: "no_attachment",
        fileName: null,
        sender: from,
        recipient,
      });
      return NextResponse.json({ error: "No CSV attachment found" }, { status: 400 });
    }

    const csvText = await file.text();
    const fileType = ((formData.get("fileType") as string) ?? "appointments") as "appointments" | "patients";
    const resolvedFileName = file.name || "email-import.csv";
    fileName = resolvedFileName;

    const result = await runCSVImport(db, {
      csvText,
      fileName: resolvedFileName,
      fileType,
      clinicId,
      importedBy: "inbound_email",
    });

    // ── Hard error from runCSVImport (e.g. unparseable CSV, unknown schema) ──
    if (!result.ok && "error" in result) {
      await writeFailureRecord(db, {
        clinicId,
        errorReason: result.error,
        fileName: resolvedFileName,
        sender: from,
        recipient,
      });
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // ── Validation failure (empty file, missing columns, bad dates, etc.) ────
    if (!result.ok && "validationErrors" in result) {
      const detection = rehydrateDetection(csvText, fileType, result.schemaUsed);
      const snapshot = buildFailureSnapshot({
        csvText,
        fileName: resolvedFileName,
        fileType,
        errorReason: "validation_failed",
        message: result.message,
        detection,
        validation: {
          valid: false,
          errors: result.validationErrors.map((e) => ({
            type: e.type as FailureSnapshot["errors"][number]["type"],
            message: e.message,
            details: e.details,
          })),
          warnings: result.warnings,
          stats: result.stats as unknown as FailureSnapshot["stats"] & object,
        },
      });
      await writeFailureRecord(db, {
        clinicId,
        errorReason: "validation_failed",
        fileName: resolvedFileName,
        sender: from,
        recipient,
        validationErrors: result.validationErrors,
        snapshot,
      });
      // Pass the full result through so callers see validationErrors, warnings, stats etc.
      return NextResponse.json(result, { status: 400 });
    }

    // ── Needs-mapping (auto-detect failed) — surface to caller as 400 ────────
    if (!result.ok && "needsMapping" in result && result.needsMapping) {
      const snapshot = buildFailureSnapshot({
        csvText,
        fileName: resolvedFileName,
        fileType,
        errorReason: "needs_mapping",
        message: result.message,
      });
      await writeFailureRecord(db, {
        clinicId,
        errorReason: "needs_mapping",
        fileName: resolvedFileName,
        sender: from,
        recipient,
        snapshot,
      });
      return NextResponse.json(result, { status: 400 });
    }

    // Success (including duplicate=true no-op). Spread the full result so any
    // new fields added upstream (e.g. matchClinician unmatched/ambiguous lists)
    // propagate to the response automatically.
    return NextResponse.json(result);
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.error("[pms/import-csv/inbound]", e);

    // Best-effort observability: only log when we know which clinic this was for.
    // Pre-clinic-resolution failures (no clinicId yet) cannot be attributed.
    if (clinicId) {
      await writeFailureRecord(db, {
        clinicId,
        errorReason: "internal_error",
        fileName,
        sender: from,
        recipient,
        errorMessage,
      });
    }

    // NEVER leak internal error details to the response body.
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export const POST = withRequestLog(handler);
