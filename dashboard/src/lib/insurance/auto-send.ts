/**
 * Auto-send selection logic (Pulse delivery layer).
 *
 * Pure: given upcoming PMS appointments and the set of appointment ids that
 * already have an intake link, decide which patients to send a fresh link to.
 * Windowed (only appointments starting soon), idempotent (skip already-linked),
 * and deduped to one link per patient per run. `nowMs` is injected for testability.
 *
 * Gating rule (founder-confirmed): the intake is ONLY sent when the booked
 * appointment is an INSURANCE appointment type. The insurer is derived from the
 * appointment-type NAME (see appointment-classifier). Self-pay / generic types
 * get no intake, and the derived insurer is carried forward onto the candidate.
 */

import { classifyAppointmentType } from "./appointment-classifier";

export interface IntakeAppointment {
  externalId: string;
  patientExternalId: string;
  dateTime: string;
  status?: string;
  /** Human-readable appointment-type name; gates intake + derives the insurer. */
  appointmentTypeName?: string;
  /** PMS practitioner id for the booked clinician; used for per-clinician scoping. */
  clinicianExternalId?: string;
}

export interface IntakeCandidate {
  appointmentId: string;
  patientRef: string;
  dateTime: string;
  /** Insurer derived from the appointment type — pre-filled (locked) on the form. */
  insurer: string;
}

const SKIP_STATUSES = new Set(["cancelled", "dna", "late_cancel"]);

export function selectAppointmentsForIntake(
  appointments: IntakeAppointment[],
  alreadyLinkedApptIds: Set<string>,
  opts: { nowMs: number; windowDays: number; allowedPractitionerIds?: string[] },
): IntakeCandidate[] {
  const horizon = opts.nowMs + opts.windowDays * 24 * 60 * 60 * 1000;
  // Per-clinician scope. When non-empty, ONLY these practitioners' appointments
  // get an intake (used to pilot the auto-send on a single clinician before
  // rolling it out clinic-wide). Empty/absent = every practitioner (unchanged).
  const scopedPractitioners = new Set((opts.allowedPractitionerIds ?? []).filter(Boolean));
  const seenPatients = new Set<string>();
  const out: IntakeCandidate[] = [];

  for (const a of appointments) {
    if (!a.externalId || !a.patientExternalId || !a.dateTime) continue;
    if (a.status && SKIP_STATUSES.has(a.status)) continue;
    if (alreadyLinkedApptIds.has(a.externalId)) continue;

    // Scope gate: fail safe — an appointment with no practitioner id is skipped
    // when a scope is set, never sent to the whole clinic by default.
    if (scopedPractitioners.size > 0 && !(a.clinicianExternalId && scopedPractitioners.has(a.clinicianExternalId))) {
      continue;
    }

    // Gate: only insurance appointment types get an intake. Derive the insurer
    // from the type name; non-insurance / unknown types are skipped entirely.
    const { insurer, isInsurance } = classifyAppointmentType(a.appointmentTypeName);
    if (!isInsurance || !insurer) continue;

    const t = Date.parse(a.dateTime);
    if (Number.isNaN(t) || t < opts.nowMs || t > horizon) continue;

    if (seenPatients.has(a.patientExternalId)) continue;
    seenPatients.add(a.patientExternalId);

    out.push({ appointmentId: a.externalId, patientRef: a.patientExternalId, dateTime: a.dateTime, insurer });
  }
  return out;
}
