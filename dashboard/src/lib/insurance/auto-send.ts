/**
 * Auto-send selection logic (Pulse delivery layer).
 *
 * Pure: given upcoming PMS appointments and the set of appointment ids that
 * already have an intake link, decide which patients to send a fresh link to.
 * Windowed (only appointments starting soon), idempotent (skip already-linked),
 * and deduped to one link per patient per run. `nowMs` is injected for testability.
 */

export interface IntakeAppointment {
  externalId: string;
  patientExternalId: string;
  dateTime: string;
  status?: string;
}

export interface IntakeCandidate {
  appointmentId: string;
  patientRef: string;
  dateTime: string;
}

const SKIP_STATUSES = new Set(["cancelled", "dna", "late_cancel"]);

export function selectAppointmentsForIntake(
  appointments: IntakeAppointment[],
  alreadyLinkedApptIds: Set<string>,
  opts: { nowMs: number; windowDays: number },
): IntakeCandidate[] {
  const horizon = opts.nowMs + opts.windowDays * 24 * 60 * 60 * 1000;
  const seenPatients = new Set<string>();
  const out: IntakeCandidate[] = [];

  for (const a of appointments) {
    if (!a.externalId || !a.patientExternalId || !a.dateTime) continue;
    if (a.status && SKIP_STATUSES.has(a.status)) continue;
    if (alreadyLinkedApptIds.has(a.externalId)) continue;

    const t = Date.parse(a.dateTime);
    if (Number.isNaN(t) || t < opts.nowMs || t > horizon) continue;

    if (seenPatients.has(a.patientExternalId)) continue;
    seenPatients.add(a.patientExternalId);

    out.push({ appointmentId: a.externalId, patientRef: a.patientExternalId, dateTime: a.dateTime });
  }
  return out;
}
