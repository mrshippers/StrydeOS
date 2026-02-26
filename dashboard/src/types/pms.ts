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
