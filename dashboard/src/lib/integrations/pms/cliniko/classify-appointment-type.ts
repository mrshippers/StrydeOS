import type { AppointmentType } from "@/types/appointment";

/**
 * Canonical classification of a Cliniko appointment-type NAME into the
 * StrydeOS Appointment enum + the isInitialAssessment flag.
 *
 * This is the single source of truth for the rules. Two write paths replicate
 * it because they live in isolated packages that cannot import from src/:
 *   - functions/src/cliniko-poll.ts (classifyAppointmentTypeName)
 *   - scripts/migrate-cliniko-appointments-to-canonical.ts
 * Keep all three in lock-step. Follow-up / review / discharge are checked
 * before initial so e.g. "Bupa Follow-up Review" never mis-classifies as
 * initial. The rules combine src/lib/pipeline DEFAULT_APPOINTMENT_TYPE_MAP with
 * the initial-vs-follow-up regex in src/lib/insurance/appointment-classifier.
 */
export function classifyClinikoAppointmentTypeName(
  typeName: string | null | undefined,
): { appointmentType: AppointmentType; isInitialAssessment: boolean } {
  const lower = (typeName ?? "").trim().toLowerCase();

  if (/discharge|final session/.test(lower)) {
    return { appointmentType: "discharge", isInitialAssessment: false };
  }
  if (/follow[\s-]?up|subsequent|treatment/.test(lower)) {
    return { appointmentType: "follow_up", isInitialAssessment: false };
  }
  if (/review|progress/.test(lower)) {
    return { appointmentType: "review", isInitialAssessment: false };
  }
  if (/initial|assessment|new patient|consultation/.test(lower)) {
    return { appointmentType: "initial_assessment", isInitialAssessment: true };
  }
  // Unknown name → conservative non-initial default (a repeat visit), matching
  // the pipeline's classifyAppointmentType fallback.
  return { appointmentType: "follow_up", isInitialAssessment: false };
}
