import type { PMSAppointment, PMSClinician, PMSPatient } from "@/types/pms";
import { WRITEUPP_STATUS_MAP } from "@/types/pms";

/**
 * WriteUpp Open API v1 response shapes.
 *
 * The Open API references statuses and types by numeric id (status_id,
 * appointment_type_id) and exposes them on separate lookup endpoints, so the
 * adapter resolves those ids to names before mapping. Field names are kept
 * defensive (snake_case primary, camelCase fallback) because the published
 * spec summarises rather than enumerates every property.
 */
export interface WriteUppAppointmentRow {
  id: string | number;
  patient_id?: string | number;
  user_id?: string | number;
  practitioner_id?: string | number;
  clinician_id?: string | number;
  status_id?: string | number;
  status?: string;
  appointment_type_id?: string | number;
  appointment_type?: string;
  starts_at?: string;
  start_time?: string;
  start?: string;
  ends_at?: string;
  end_time?: string;
  end?: string;
  notes?: string;
  /** Open API returns appointment value as `cost`, a float in pounds. */
  cost?: number;
  price_pence?: number;
  [key: string]: unknown;
}

export interface WriteUppUserRow {
  id: string | number;
  name?: string;
  first_name?: string;
  last_name?: string;
  role?: string;
  job_title?: string;
  active?: boolean;
  is_active?: boolean;
  [key: string]: unknown;
}

export interface WriteUppPatientRow {
  id: string | number;
  first_name?: string;
  forename?: string;
  last_name?: string;
  surname?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  telephone?: string;
  date_of_birth?: string;
  dob?: string;
  insurer_name?: string;
  [key: string]: unknown;
}

/** Lookups resolved from /appointment-statuses and /appointment-types. */
export interface WriteUppLookups {
  statusById?: Map<string, string>;
  typeById?: Map<string, string>;
}

function firstString(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

export function mapWriteUppAppointment(
  row: WriteUppAppointmentRow,
  lookups: WriteUppLookups = {}
): PMSAppointment {
  const start = firstString(row.starts_at, row.start_time, row.start) ?? "";
  const end = firstString(row.ends_at, row.end_time, row.end) ?? "";

  // `cost` is a float in pounds; convert to integer pence for canonical revenue.
  const revenueAmountPence =
    typeof row.cost === "number"
      ? Math.round(row.cost * 100)
      : typeof row.price_pence === "number"
        ? row.price_pence
        : undefined;

  // Resolve status: prefer a numeric status_id via the lookup, else a string.
  const statusName =
    (row.status_id != null ? lookups.statusById?.get(String(row.status_id)) : undefined) ??
    firstString(row.status) ??
    "Confirmed";
  const canonicalStatus = WRITEUPP_STATUS_MAP[statusName] ?? "scheduled";

  const appointmentType =
    (row.appointment_type_id != null ? lookups.typeById?.get(String(row.appointment_type_id)) : undefined) ??
    firstString(row.appointment_type);

  return {
    externalId: String(row.id),
    patientExternalId: String(row.patient_id ?? ""),
    clinicianExternalId: String(row.user_id ?? row.practitioner_id ?? row.clinician_id ?? ""),
    dateTime: start,
    endTime: end,
    status: canonicalStatus,
    appointmentType,
    notes: typeof row.notes === "string" ? row.notes : undefined,
    revenueAmountPence,
  };
}

export function mapWriteUppClinician(row: WriteUppUserRow): PMSClinician {
  const name =
    firstString(row.name) ??
    ([row.first_name, row.last_name].filter(Boolean).join(" ") || "Unknown");
  return {
    externalId: String(row.id),
    name,
    role: firstString(row.role, row.job_title),
    active: row.active !== false && row.is_active !== false,
  };
}

export function mapWriteUppPatient(row: WriteUppPatientRow, fallbackId: string): PMSPatient {
  return {
    externalId: String(row?.id ?? fallbackId),
    firstName: firstString(row?.first_name, row?.forename) ?? "",
    lastName: firstString(row?.last_name, row?.surname) ?? "",
    email: firstString(row?.email),
    phone: firstString(row?.mobile, row?.phone, row?.telephone),
    dob: firstString(row?.date_of_birth, row?.dob),
    insurerName: firstString(row?.insurer_name),
  };
}
