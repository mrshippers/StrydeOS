import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { runCSVImport } from "@/lib/csv-import/run-import";
import { withRequestLog } from "@/lib/request-logger";

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

async function handler(request: NextRequest): Promise<NextResponse> {
  if (!INBOUND_SECRET) {
    return NextResponse.json({ error: "Inbound import not configured" }, { status: 503 });
  }

  const secret = request.headers.get("x-inbound-secret")?.trim();
  if (secret !== INBOUND_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();

    let clinicId = (formData.get("clinicId") as string) ?? "";
    if (!clinicId) {
      const recipient = (formData.get("recipient") as string) ?? "";
      clinicId = extractClinicIdFromRecipient(recipient) ?? "";
    }
    if (!clinicId) {
      return NextResponse.json({ error: "Could not determine clinicId from recipient or form data" }, { status: 400 });
    }

    const db = getAdminDb();
    const clinicDoc = await db.collection("clinics").doc(clinicId).get();
    if (!clinicDoc.exists) {
      return NextResponse.json({ error: "Clinic not found" }, { status: 404 });
    }

    const clinicData = clinicDoc.data();
    if (clinicData?.status === "suspended" || clinicData?.status === "deleted") {
      return NextResponse.json({ error: "Clinic is not active" }, { status: 403 });
    }

    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No CSV attachment found" }, { status: 400 });
    }

    const csvText = await file.text();
    const fileType = ((formData.get("fileType") as string) ?? "appointments") as "appointments" | "patients";

    const result = await runCSVImport(db, {
      csvText,
      fileName: file.name || "email-import.csv",
      fileType,
      clinicId,
      importedBy: "inbound_email",
    });

    if (!result.ok && "error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export const POST = withRequestLog(handler);
