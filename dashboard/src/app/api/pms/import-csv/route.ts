import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyApiRequest, handleApiError, requireRole } from "@/lib/auth-guard";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { runCSVImport } from "@/lib/csv-import/run-import";
import type { CSVFileType } from "@/lib/csv-import/types";
import { withRequestLog } from "@/lib/request-logger";
import { logIntegrationHealth } from "@/lib/pipeline/health-logger";

async function handler(request: NextRequest): Promise<NextResponse> {
  // Rate limit: 10 requests per IP per 60 seconds (bulk data import)
  const { limited, remaining } = await checkRateLimitAsync(request, { limit: 10, windowMs: 60_000 });
  if (limited) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "X-RateLimit-Remaining": String(remaining) } }
    );
  }

  try {
    const user = await verifyApiRequest(request);
    requireRole(user, ["owner", "admin", "superadmin"]);
    const clinicId = user.clinicId;
    if (!clinicId) return NextResponse.json({ error: "No clinic" }, { status: 400 });

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const fileType = ((formData.get("fileType") as string) ?? "appointments") as CSVFileType;
    const schemaId = (formData.get("schemaId") as string) || undefined;

    if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

    const MAX_CSV_SIZE = 10 * 1024 * 1024; // 10 MB
    if (file.size > MAX_CSV_SIZE) {
      return NextResponse.json(
        { error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 10 MB.` },
        { status: 413 }
      );
    }
    if (!["appointments", "patients"].includes(fileType)) {
      return NextResponse.json({ error: "fileType must be 'appointments' or 'patients'" }, { status: 400 });
    }

    const csvText = await file.text();
    const db = getAdminDb();
    const importStartedAt = Date.now();

    const result = await runCSVImport(db, {
      csvText,
      fileName: file.name,
      fileType,
      clinicId,
      importedBy: user.uid,
      schemaId,
    });

    // Emit integration_health telemetry. The CSV-import pipeline is how WriteUpp
    // clinics (e.g. Spires) actually ingest, but unlike the API-sync stages it
    // wrote no health record — so a WriteUpp-on-CSV clinic was invisible to the
    // health snapshot. Label by the clinic's configured PMS so it shows under
    // the right provider. Best-effort: never block the import response on it.
    try {
      const clinicSnap = await db.collection("clinics").doc(clinicId).get();
      const provider = (clinicSnap.data()?.pmsType as string | undefined) ?? "csv";
      const ok = result.ok === true;
      const written = ok && "written" in result ? result.written : 0;
      const errs =
        "errors" in result && Array.isArray(result.errors)
          ? result.errors
          : !ok && "error" in result && result.error
            ? [result.error]
            : [];
      await logIntegrationHealth(db, clinicId, provider, "pms", {
        stage: `csv-import:${fileType}`,
        ok,
        count: written,
        errors: errs,
        durationMs: Date.now() - importStartedAt,
      });
    } catch (healthErr) {
      console.error("[pms/import-csv] health log failed", healthErr);
    }

    if (!result.ok && "error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (e) {
    return handleApiError(e);
  }
}

export const POST = withRequestLog(handler);
