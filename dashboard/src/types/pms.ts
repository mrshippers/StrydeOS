import type { AppointmentStatus, PmsProvider } from "./index";
import type {
  InsuranceRecord,
  InsuranceFieldMap,
  InsuranceWriteResult,
} from "@/lib/insurance/types";

// ─── Canonical PMS Types (provider-agnostic) ─────────────────────────────────

export interface PMSAppointment {
  externalId: string;
  patientExternalId: string;
  clinicianExternalId: string;
  dateTime: string;
  endTime: string;
  status: string;
  /** Provider appointment-type id (Cliniko: extracted from the type link). */
  appointmentType?: string;
  /**
   * Human-readable appointment-type name (e.g. "Bupa Initial Appointment").
   * Resolved per poll-run from the provider's appointment-type list; drives the
   * insurance-intake gate + insurer derivation. May be undefined when the
   * provider does not expose / could not resolve the name.
   */
  appointmentTypeName?: string;
  notes?: string;
  revenueAmountPence?: number;
}

export interface PMSPatient {
  externalId: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  dob?: string;
  insurerName?: string;
}

export interface PMSClinician {
  externalId: string;
  name: string;
  role?: string;
  active: boolean;
}

export interface InsuranceInfo {
  hasInsurance: boolean;
  insurerName?: string;
  policyNumber?: string;
}

export interface CreateAppointmentParams {
  patientExternalId: string;
  clinicianExternalId: string;
  dateTime: string;
  endTime: string;
  appointmentType?: string;
  notes?: string;
}

export interface CreatePatientParams {
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  dob?: string;
}

// ─── PMS Adapter Interface ───────────────────────────────────────────────────

export interface PMSAdapter {
  provider: PmsProvider;

  testConnection(): Promise<{ ok: boolean; error?: string }>;

  getAppointments(params: {
    clinicianExternalId?: string;
    dateFrom: string;
    dateTo: string;
  }): Promise<PMSAppointment[]>;

  getPatient(externalId: string): Promise<PMSPatient>;

  createAppointment(
    params: CreateAppointmentParams
  ): Promise<{ externalId: string }>;

  updateAppointmentStatus(
    externalId: string,
    status: AppointmentStatus
  ): Promise<void>;

  getClinicians(): Promise<PMSClinician[]>;

  getInsuranceInfo(patientExternalId: string): Promise<InsuranceInfo | null>;

  /** Optional: create a new patient record in the PMS. Not all providers support this. */
  createPatient?(params: CreatePatientParams): Promise<{ externalId: string }>;

  /** Optional: find a patient in the PMS by phone number. Returns externalId or null. */
  findPatientByPhone?(phone: string): Promise<string | null>;

  /**
   * Optional: discover the tenant's insurance custom fields (Insurance Intake).
   * Returns the per-tenant field tokens + insurer dropdown options, or a map
   * flagged for invoice-extra-info fallback when those fields are absent.
   */
  discoverInsuranceFields?(): Promise<InsuranceFieldMap>;

  /**
   * Optional: write a captured insurance record into the PMS as custom patient
   * fields + billing info. Falls back to invoice extra info per the field map.
   */
  writeInsurance?(
    record: InsuranceRecord,
    fieldMap: InsuranceFieldMap,
  ): Promise<InsuranceWriteResult>;
}

// ─── PMS Integration Config (server-side only) ──────────────────────────────

export interface PMSIntegrationConfig {
  provider: PmsProvider;
  apiKey: string;
  baseUrl?: string;
  lastSyncAt?: string;
  lastSyncStatus?: "success" | "error";
  syncErrors?: string[];
}

// ─── Status Mapping ──────────────────────────────────────────────────────────

export type PMSStatusMap = Record<string, AppointmentStatus>;

// Keys are WriteUpp Open API appointment-status names (GET /v1/appointment-statuses).
// "Booked"/"Cancelled"/"Complete"/"Did not attend" are WriteUpp defaults; the
// rest are clinic-side blocks that are not delivered patient sessions, so they
// bucket to "cancelled" to keep them out of completed/DNA KPIs. Unknown custom
// names fall back to "scheduled" in the mapper.
export const WRITEUPP_STATUS_MAP: PMSStatusMap = {
  Booked: "scheduled",
  Complete: "completed",
  "Did not attend": "dna",
  Cancelled: "cancelled",
  "Therapist Unwell": "cancelled",
  Unavailable: "cancelled",
};

export const CLINIKO_STATUS_MAP: PMSStatusMap = {
  booked: "scheduled",
  arrived: "completed",
  did_not_arrive: "dna",
  cancelled: "cancelled",
};

export const HALAXY_STATUS_MAP: PMSStatusMap = {
  booked: "scheduled",
  fulfilled: "completed",
  noshow: "dna",
  cancelled: "cancelled",
  "entered-in-error": "cancelled",
};

export const ZANDA_STATUS_MAP: PMSStatusMap = {
  confirmed: "scheduled",
  arrived: "completed",
  dna: "dna",
  "did not attend": "dna",
  cancelled: "cancelled",
  "late cancellation": "late_cancel",
  "no show": "dna",
};

/**
 * PPS (Private Practice Software / Rushcliff) status map.
 *
 * PPS API docs are gated (docs.pps-api.com, requires PPS Express login).
 * These mappings are inferred from PPS's UK physio conventions and may need
 * refinement once API access is obtained. PPS uses standard UK appointment
 * terminology consistent with Physio First guidelines.
 */
export const PPS_STATUS_MAP: PMSStatusMap = {
  booked: "scheduled",
  confirmed: "scheduled",
  attended: "completed",
  completed: "completed",
  dna: "dna",
  "did not attend": "dna",
  "no show": "dna",
  cancelled: "cancelled",
  "late cancellation": "late_cancel",
  "late cancel": "late_cancel",
};
