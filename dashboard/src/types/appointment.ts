export type AppointmentStatus = "scheduled" | "completed" | "dna" | "cancelled" | "late_cancel";
export type AppointmentType = "initial_assessment" | "follow_up" | "review" | "discharge";
export type AppointmentSource = "pms_sync" | "strydeos_receptionist" | "manual";

export interface Appointment {
  id: string;
  patientId: string;
  clinicianId: string;
  dateTime: string;
  endTime: string;
  status: AppointmentStatus;
  appointmentType: AppointmentType;
  isInitialAssessment: boolean;
  hepAssigned: boolean;
  hepProgramId?: string;
  conditionTag?: string; // populated by PMS sync (e.g. "Low Back Pain")
  revenueAmountPence: number;
  followUpBooked: boolean;
  source: AppointmentSource;
  pmsExternalId?: string;
  createdAt: string;
  updatedAt: string;
}
