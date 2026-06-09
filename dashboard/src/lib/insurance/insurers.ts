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
