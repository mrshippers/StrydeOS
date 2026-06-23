/**
 * Appointment-type classifier (Insurance Intake gating).
 *
 * The intake form is only ever sent when a patient's booked appointment is an
 * INSURANCE appointment type, and the insurer is read directly from the Cliniko
 * appointment record (its appointment_type NAME) at booking — never picked by
 * the patient. Self-pay / generic appointments get no intake.
 *
 * Cliniko appointment-type IDs are clinic-specific, so this module derives the
 * insurer (and initial-vs-follow-up) from the type NAME at runtime. It is pure:
 * no I/O, no clock, no PMS knowledge beyond the type name string.
 *
 * Live Cliniko facts (Spires, uk3, June 2026): the insurance insurers are
 * AXA, Aviva, Bupa, Vitality and WPA (each with an Initial + a Follow-up type).
 * Non-insurance types are "1. Initial Appointment", "2. Follow up" and
 * "Video Consultation".
 */

/**
 * An insurer recognised on an appointment-type name. `canonical` is the value
 * stored on the record + pre-filled (and locked) on the intake form; `match`
 * patterns are lower-cased substrings tested against the type name.
 */
export interface InsurerSpec {
  canonical: string;
  match: string[];
}

/**
 * Canonical insurer list, in match-priority order. Patterns are matched
 * case-insensitively as substrings of the appointment-type name. More specific
 * brands are listed before looser ones so e.g. "AXA Health" still maps to AXA.
 */
export const INSURER_SPECS: InsurerSpec[] = [
  { canonical: "AXA", match: ["axa"] },
  { canonical: "Aviva", match: ["aviva"] },
  { canonical: "Bupa", match: ["bupa"] },
  { canonical: "Vitality", match: ["vitality"] },
  { canonical: "WPA", match: ["wpa"] },
];

/** Canonical insurer names, for convenience (form options, validation). */
export const INSURERS: string[] = INSURER_SPECS.map((s) => s.canonical);

export interface AppointmentClassification {
  /** Canonical insurer name when the type is an insurance type, else null. */
  insurer: string | null;
  /** True when the appointment type maps to a recognised insurer. */
  isInsurance: boolean;
  /**
   * true  → an initial / assessment appointment
   * false → a follow-up / review appointment
   * null  → could not be determined from the name
   */
  isInitial: boolean | null;
}

/** Derive initial-vs-follow-up from a type name. */
function deriveIsInitial(lower: string): boolean | null {
  // Follow-up is checked first: "follow up", "follow-up", "followup", "review".
  if (/follow[\s-]?up|review/.test(lower)) return false;
  if (/initial|assessment|new patient/.test(lower)) return true;
  return null;
}

/**
 * Classify a Cliniko appointment-type name. Generic / self-pay names return
 * `{ insurer: null, isInsurance: false, ... }`. An empty / missing name is
 * treated as non-insurance (the gate fails safe — no intake is sent).
 */
export function classifyAppointmentType(typeName: string | null | undefined): AppointmentClassification {
  const name = (typeName ?? "").trim();
  const lower = name.toLowerCase();
  const isInitial = deriveIsInitial(lower);

  if (!lower) return { insurer: null, isInsurance: false, isInitial };

  for (const spec of INSURER_SPECS) {
    if (spec.match.some((m) => lower.includes(m))) {
      return { insurer: spec.canonical, isInsurance: true, isInitial };
    }
  }

  return { insurer: null, isInsurance: false, isInitial };
}

export interface InsurerClaimResult {
  /**
   * The authoritative insurer to persist on the record. ALWAYS the derived
   * insurer — a patient claim never overwrites it (this is the safety-net rule).
   */
  insurer: string;
  /** True when the patient flagged an insurer that differs from the derived one. */
  insurerMismatch: boolean;
  /** What the patient claimed, only when it differs from the derived insurer. */
  claimedInsurer?: string;
}

/**
 * Evaluate a patient's optional insurer claim against the authoritative,
 * appointment-derived insurer. The derived value is always kept; a differing
 * claim raises a `insurerMismatch` flag for staff to arbitrate. Comparison is
 * case-insensitive and trimmed; an empty / matching / absent claim is a no-op.
 */
export function evaluateInsurerClaim(
  derivedInsurer: string,
  patientClaimedInsurer: string | null | undefined,
): InsurerClaimResult {
  const claimed = (patientClaimedInsurer ?? "").trim();
  if (!claimed || claimed.toLowerCase() === derivedInsurer.trim().toLowerCase()) {
    return { insurer: derivedInsurer, insurerMismatch: false };
  }
  return { insurer: derivedInsurer, insurerMismatch: true, claimedInsurer: claimed };
}
