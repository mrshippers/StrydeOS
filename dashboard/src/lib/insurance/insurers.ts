/**
 * Default UK private medical insurers, used to populate the intake form's
 * insurer dropdown when a clinic has not configured a structured insurance
 * field in their PMS. Covers the major UK PMI providers; clinics that DO
 * configure their own list (via a Cliniko patient_form_template) override this.
 */
export const DEFAULT_UK_INSURERS: string[] = [
  "Aviva",
  "AXA Health",
  "Bupa",
  "Bupa Global",
  "Cigna",
  "Healix",
  "Vitality",
  "WPA",
  "Self-funding",
];

/**
 * Resolve the insurer options to present: a clinic's discovered options take
 * precedence; otherwise fall back to the default UK list.
 */
export function resolveInsurerOptions(discovered: string[]): string[] {
  return discovered.length > 0 ? discovered : DEFAULT_UK_INSURERS;
}

/** Self-funding / self-pay patients — no insurer, so no pre-auth applies. */
const SELF_FUNDING_RE = /self[\s-]?fund|self[\s-]?pay/i;

/**
 * Whether an approval for this insurer must carry a pre-authorisation code.
 * Every named PMI insurer requires one before a claimable session is invoiced;
 * a self-funding patient (or no insurer) does not. Used to gate the staff
 * approve action so a claim is never written to the PMS without its auth code.
 */
export function requiresPreAuthorisation(insurerName: string): boolean {
  const name = (insurerName ?? "").trim();
  if (!name) return false;
  return !SELF_FUNDING_RE.test(name);
}
