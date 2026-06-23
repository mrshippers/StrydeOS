import type { PMSAppointment, PMSClinician } from "@/types/pms";
import { CLINIKO_STATUS_MAP } from "@/types/pms";

/** Cliniko API response shapes */

export interface ClinikoPractitionerRow {
  id: string;
  first_name?: string;
  last_name?: string;
  display_name?: string;
  active?: boolean;
  designation?: string;
  title?: string;
  [key: string]: unknown;
}

export interface ClinikoAppointmentRow {
  id: string;
  starts_at?: string;
  ends_at?: string;
  did_not_arrive?: boolean;
  cancelled_at?: string | null;
  patient_arrived?: boolean;
  notes?: string;
  appointment_type?: {
    links?: {
      self?: string;
    };
    [key: string]: unknown;
  };
  practitioner?: {
    links?: {
      self?: string;
    };
    [key: string]: unknown;
  };
  patient?: {
    links?: {
      self?: string;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Extract ID from a Cliniko resource link URL.
 * Example: "https://api.au1.cliniko.com/v1/practitioners/123" → "123"
 */
function extractIdFromUrl(url?: string): string {
  if (!url) return "";
  const parts = url.split("/");
  return parts[parts.length - 1] || "";
}

/**
 * Derive canonical appointment status from Cliniko fields.
 * Cliniko uses boolean flags rather than a single status field:
 * - cancelled_at is set → "cancelled"
 * - patient_arrived is true → "completed"
 * - did_not_arrive is true → "dna"
 * - otherwise → "scheduled" (booked)
 */
function deriveClinikoStatus(row: ClinikoAppointmentRow): string {
  if (row.cancelled_at) return "cancelled";
  if (row.patient_arrived) return "completed";
  if (row.did_not_arrive) return "dna";
  return "scheduled"; // default to booked/scheduled
}

export interface ClinikoAppointmentTypeRow {
  id: string;
  name?: string;
  [key: string]: unknown;
}

/** Build an appointment-type id → name lookup from /appointment_types rows. */
export function buildAppointmentTypeNameMap(
  rows: ClinikoAppointmentTypeRow[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const r of rows) {
    if (r?.id != null && typeof r.name === "string") {
      map.set(String(r.id), r.name);
    }
  }
  return map;
}

/**
 * @param typeNames Optional id → name lookup (one /appointment_types fetch per
 *   poll run). When supplied, the appointment-type NAME is resolved so the
 *   insurance-intake gate can classify it; otherwise only the id is carried.
 */
export function mapClinikoAppointment(
  row: ClinikoAppointmentRow,
  typeNames?: Map<string, string>,
): PMSAppointment {
  const status = deriveClinikoStatus(row);
  const appointmentType = extractIdFromUrl(row.appointment_type?.links?.self);

  return {
    externalId: String(row.id),
    patientExternalId: extractIdFromUrl(row.patient?.links?.self),
    clinicianExternalId: extractIdFromUrl(row.practitioner?.links?.self),
    dateTime: row.starts_at ?? new Date().toISOString(),
    endTime: row.ends_at ?? new Date().toISOString(),
    status,
    appointmentType,
    appointmentTypeName: appointmentType ? typeNames?.get(appointmentType) : undefined,
    notes: row.notes as string | undefined,
    revenueAmountPence: undefined, // Cliniko stores revenue on invoices, not appointments
  };
}

export function mapClinikoClinician(row: ClinikoPractitionerRow): PMSClinician {
  const name =
    row.display_name ??
    ([row.first_name, row.last_name].filter(Boolean).join(" ") || "Unknown");
  
  return {
    externalId: String(row.id),
    name,
    role: row.designation ?? row.title,
    active: row.active !== false,
  };
}
