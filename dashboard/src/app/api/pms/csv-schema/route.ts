import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyApiRequest, handleApiError, requireRole } from "@/lib/auth-guard";
import type { CSVSchema, CanonicalField, CSVFileType, DateFormat } from "@/lib/csv-import/types";
import type { AppointmentStatus } from "@/types";

const VALID_CANONICAL_FIELDS: CanonicalField[] = [
  "date", "time", "endDate", "endTime",
  "patientId", "patientFirst", "patientLast",
  "patientEmail", "patientPhone", "patientDob",
  "practitioner", "practitionerId",
  "type", "status", "notes", "price", "duration",
];

const DEFAULT_STATUS_MAP: Record<string, AppointmentStatus> = {
  attended: "completed",
  completed: "completed",
  confirmed: "scheduled",
  booked: "scheduled",
  scheduled: "scheduled",
  cancelled: "cancelled",
  canceled: "cancelled",
  dna: "dna",
  "did not attend": "dna",
  "no show": "dna",
  no_show: "dna",
  "late cancellation": "late_cancel",
  "late cancel": "late_cancel",
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await verifyApiRequest(request);
    requireRole(user, ["owner", "admin", "superadmin"]);
    const clinicId = user.clinicId;
    if (!clinicId) return NextResponse.json({ error: "No clinic" }, { status: 400 });

    const body = await request.json();
    const { name, fileType, fieldMap, dateFormat, statusMap } = body as {
      name?: string;
      fileType?: string;
      fieldMap?: Record<string, string>;
      dateFormat?: string;
      statusMap?: Record<string, string>;
    };

    if (!fieldMap || typeof fieldMap !== "object" || Object.keys(fieldMap).length === 0) {
      return NextResponse.json({ error: "fieldMap is required and must be non-empty" }, { status: 400 });
    }

    const validFileType: CSVFileType = fileType === "patients" ? "patients" : "appointments";

    const validatedFieldMap: Record<string, CanonicalField> = {};
    for (const [header, canonical] of Object.entries(fieldMap)) {
      if (canonical === "ignore" || canonical === "") continue;
      if (!VALID_CANONICAL_FIELDS.includes(canonical as CanonicalField)) {
        return NextResponse.json({ error: `Invalid canonical field: ${canonical}` }, { status: 400 });
      }
      validatedFieldMap[header] = canonical as CanonicalField;
    }

    if (Object.keys(validatedFieldMap).length === 0) {
      return NextResponse.json({ error: "At least one field must be mapped" }, { status: 400 });
    }

    const validDateFormat: DateFormat = (["uk", "us", "iso"] as const).includes(dateFormat as DateFormat)
      ? (dateFormat as DateFormat)
      : "uk";

    const resolvedStatusMap: Record<string, AppointmentStatus> = statusMap
      ? Object.fromEntries(
          Object.entries(statusMap)
            .filter(([, v]) => ["scheduled", "completed", "dna", "cancelled", "late_cancel"].includes(v))
            .map(([k, v]) => [k.toLowerCase().trim(), v as AppointmentStatus])
        )
      : DEFAULT_STATUS_MAP;

    const requiredFields: CanonicalField[] = validFileType === "appointments"
      ? ["date", "practitioner", "status"]
      : ["patientFirst"];

    const timestamp = Date.now();
    const schemaId = `custom_${clinicId}_${timestamp}`;

    const schema: CSVSchema = {
      id: schemaId,
      provider: name?.trim() || "Custom",
      version: "2026-03",
      fileType: validFileType,
      fieldMap: validatedFieldMap,
      dateFormat: validDateFormat,
      statusMap: resolvedStatusMap,
      requiredFields,
      priority: 100,
    };

    const db = getAdminDb();
    await db
      .collection("clinics")
      .doc(clinicId)
      .collection("csv_schemas")
      .doc(schemaId)
      .set(schema);

    return NextResponse.json({ ok: true, schemaId, schema });
  } catch (e) {
    return handleApiError(e);
  }
}
