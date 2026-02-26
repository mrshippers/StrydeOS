import type { PMSAppointment, PMSClinician } from "@/types/pms";
import { WRITEUPP_STATUS_MAP } from "@/types/pms";

/** WriteUpp API response shapes (adjust field names to match actual API). */
export interface WriteUppAppointmentRow {
  id: string;
  patient_id?: string;
  practitioner_id?: string;
  start_time?: string;
  end_time?: string;
  status?: string;
  appointment_type?: string;
  notes?: string;
  price_pence?: number;
  [key: string]: unknown;
}

export interface WriteUppPractitionerRow {
  id: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  role?: string;
  active?: boolean;
  [key: string]: unknown;
}

export function mapWriteUppAppointment(row: WriteUppAppointmentRow): PMSAppointment {
  const start = row.start_time ?? row.start ?? row.date_time;
  const end = row.end_time ?? row.end ?? row.endTime;
  const rawStatus = row.status ?? "Confirmed";
  const canonicalStatus = WRITEUPP_STATUS_MAP[rawStatus] ?? "scheduled";
  return {
    externalId: String(row.id),
    patientExternalId: String(row.patient_id ?? row.patientId ?? ""),
    clinicianExternalId: String(row.practitioner_id ?? row.practitionerId ?? row.clinician_id ?? ""),
    dateTime: typeof start === "string" ? start : new Date(start as number).toISOString(),
    endTime: typeof end === "string" ? end : new Date(end as number).toISOString(),
    status: canonicalStatus,
    appointmentType: (row.appointment_type ?? row.appointmentType) as string | undefined,
    notes: row.notes as string | undefined,
    revenueAmountPence:
      typeof row.price_pence === "number"
        ? row.price_pence
        : typeof row.revenueAmountPence === "number"
          ? row.revenueAmountPence
          : undefined,
  };
}

export function mapWriteUppClinician(row: WriteUppPractitionerRow): PMSClinician {
  const name =
    row.name ??
    ([row.first_name, row.last_name].filter(Boolean).join(" ") || "Unknown");
  return {
    externalId: String(row.id),
    name,
    role: row.role,
    active: row.active !== false,
  };
}
