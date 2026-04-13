import type { AppointmentStatus, PmsProvider } from "./index";

// ─── Canonical PMS Types (provider-agnostic) ─────────────────────────────────

export interface PMSAppointment {
  externalId: string;
  patientExternalId: string;
  clinicianExternalId: string;
  dateTime: string;
  endTime: string;
  status: string;
  appointmentType?: string;
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

export const WRITEUPP_STATUS_MAP: PMSStatusMap = {
  Confirmed: "scheduled",
  Attended: "completed",
  "Did Not Attend": "dna",
  Cancelled: "cancelled",
  "Late Cancellation": "late_cancel",
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
