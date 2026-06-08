/**
 * Validation at the capture boundary. Runs before a submission is accepted,
 * for both the public form (server-side) and the voice review path.
 */

import type { RawFormSubmission, ValidationResult } from "./types";
import { excessToPence } from "./normalise";

/** Letters, numbers, spaces and dashes only — covers UK insurer policy formats. */
const POLICY_RE = /^[A-Za-z0-9 -]+$/;

/** UK postcode format (lenient on internal spacing). */
const UK_POSTCODE_RE = /^[A-Za-z]{1,2}\d[A-Za-z\d]?\s*\d[A-Za-z]{2}$/;

export function validateInsuranceSubmission(
  input: RawFormSubmission,
  opts: { insurerOptions?: string[] } = {},
): ValidationResult {
  const errors: string[] = [];

  if (!input.consent) {
    errors.push("Consent is required before submitting insurance details.");
  }

  const insurer = (input.insurerName ?? "").trim();
  if (!insurer) {
    errors.push("Insurer name is required.");
  } else if (
    opts.insurerOptions &&
    opts.insurerOptions.length > 0 &&
    !opts.insurerOptions.includes(insurer)
  ) {
    errors.push("Please select an insurer from the recognised list.");
  }

  const policy = (input.policyNumber ?? "").trim();
  if (!policy) {
    errors.push("Policy or membership number is required.");
  } else if (policy.length < 3) {
    errors.push("Policy number looks too short — please check it.");
  } else if (!POLICY_RE.test(policy)) {
    errors.push("Policy number may only contain letters, numbers, spaces and dashes.");
  }

  if (input.validFrom && input.validTo) {
    const from = Date.parse(input.validFrom);
    const to = Date.parse(input.validTo);
    if (!Number.isNaN(from) && !Number.isNaN(to) && from > to) {
      errors.push("The valid-from date must not be after the valid-to date.");
    }
  }

  if (input.excess !== undefined && input.excess !== "") {
    const pence = excessToPence(input.excess);
    if (pence === undefined || pence < 0) {
      errors.push("Excess must be a non-negative amount.");
    }
  }

  // Address (required) — confirms/updates the patient's record on the PMS.
  if (!(input.addressLine1 ?? "").trim()) {
    errors.push("Address line 1 is required.");
  }
  if (!(input.town ?? "").trim()) {
    errors.push("Town or city is required.");
  }
  const postcode = (input.postcode ?? "").trim();
  if (!postcode) {
    errors.push("Postcode is required.");
  } else if (!UK_POSTCODE_RE.test(postcode)) {
    errors.push("Please enter a valid UK postcode.");
  }

  return { ok: errors.length === 0, errors };
}
