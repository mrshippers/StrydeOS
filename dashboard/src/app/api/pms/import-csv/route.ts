import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyApiRequest, handleApiError, requireRole } from "@/lib/auth-guard";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { runCSVImport } from "@/lib/csv-import/run-import";
import type { CSVFileType } from "@/lib/csv-import/types";
import { withRequestLog } from "@/lib/request-logger";

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

    const result = await runCSVImport(db, {
      csvText,
      fileName: file.name,
      fileType,
      clinicId,
      importedBy: user.uid,
      schemaId,
    });

    if (!result.ok && "error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (e) {
    return handleApiError(e);
  }
}

export const POST = withRequestLog(handler);
