/**
 * Insurance Intake — internal, PMS-agnostic data model.
 *
 * One normalisation pipeline serves both capture modalities (typed form,
 * voice fallback) and the CSV export. Nothing in this module talks to a PMS;
 * the PmsAdapter layer maps an InsuranceRecord onto a provider's custom fields.
 *
 * Field naming is camelCase to match the rest of the codebase (see PMSPatient).
 * The scoped build plan uses snake_case in prose; this is the canonical TS shape.
 */

export type InsuranceSource = "form" | "voice" | "csv";

// "writing" is a transient claim state: a single approve transaction flips
// pending → writing before touching the PMS, so concurrent/retried approves
// can't both pass the guard and double-write. It reverts to pending if the PMS
// write fails, or advances to approved on success.
export type InsuranceReviewStatus = "pending" | "writing" | "approved" | "rejected";

export type InsuranceAuditAction =
  | "captured"
  | "approved"
  | "rejected"
  | "written"
  | "write_failed"
  | "held";

export interface InsuranceAuditEntry {
  at: string; // ISO timestamp
  actor: string; // "patient" | "ava" | staff uid | "system"
  action: InsuranceAuditAction;
  note?: string;
}

/**
 * The canonical internal record. Persisted to
 * `clinics/{tenantId}/insurance_intakes/{id}` and mapped to the PMS on approval.
 */
export interface InsuranceRecord {
  /** Firestore doc id — absent until persisted. */
  id?: string;
  tenantId: string;
  /** PMS patient external id. */
  patientRef: string;
  source: InsuranceSource;
  /**
   * PMS external id of the booked appointment this intake was sent for, copied
   * from the intake link at submission. Drives the appointment-scoped invoice
   * deep link on approval (correct business + practitioner + appointment). Null
   * for captures with no associated booking (e.g. ad-hoc/voice).
   */
  appointmentId?: string | null;
  insurerName: string;
  scheme?: string;
  /** Policy or membership number. Redacted to last 4 in all logs. */
  policyNumber: string;
  authorisationCode?: string;
  claimReference?: string;
  /** Excess / copay stored in pence to match revenueAmountPence convention. */
  excessPence?: number;
  validFrom?: string;
  validTo?: string;
  /** 0..1. Typed form is always 1; voice is scored. */
  confidence: number;
  /** Voice only: whether the in-call NATO read-back of alphanumerics was confirmed. */
  readBackConfirmed?: boolean;
  capturedAt: string;
  capturedBy: string;
  /** Consent is mandatory before any capture is accepted. */
  consentAt?: string;
  consentVersion?: string;
  reviewStatus: InsuranceReviewStatus;
  /**
   * Set when the record was auto-staged to the PMS but a required field is still
   * missing (e.g. a claimable insurer with no pre-authorisation code). It does
   * NOT block the write (clinic policy: pre-auth is optional, the patient may not
   * have it yet) — it flags the claim for the end-of-day incomplete digest.
   */
  incomplete?: boolean;
  incompleteReason?: string;
  /** Set when an approve claims the record (pending → writing). Cleared/superseded on resolve. */
  writeClaimedAt?: string;
  writeClaimedBy?: string;
  audit: InsuranceAuditEntry[];

  // ─── Insurer-mismatch safety net (derived insurer is authoritative) ──────────
  /**
   * True when the patient flagged a different insurer than the one derived from
   * their booked appointment type. `insurerName` STAYS the authoritative derived
   * value; `claimedInsurer` records what the patient said. Staff arbitrate (correct
   * the Cliniko appointment type/insurer) before approving — never auto-resolved.
   */
  insurerMismatch?: boolean;
  /** What the patient claimed their insurer is, when it differs from the derived value. */
  claimedInsurer?: string;

  // ─── Patient address (captured/confirmed on the form; written back to PMS) ───
  addressLine1?: string;
  addressLine2?: string;
  town?: string;
  county?: string;
  postcode?: string;
  country?: string;
}

/** Raw payload from the patient-facing typed form. */
export interface RawFormSubmission {
  insurerName: string;
  /**
   * Optional: the insurer the patient says they actually have, used only when
   * the form's insurer is locked (derived from the booked appointment type) and
   * the patient flags a mismatch via "Not your insurer?". Never overwrites the
   * authoritative derived insurer — it raises a staff review flag instead.
   */
  patientClaimedInsurer?: string;
  scheme?: string;
  policyNumber: string;
  authorisationCode?: string;
  claimReference?: string;
  /** Free-typed by the patient; "£50", "50", "50.00" all accepted. */
  excess?: string | number;
  validFrom?: string;
  validTo?: string;
  consent: boolean;
  // Patient address (postcode-assisted on the form).
  addressLine1?: string;
  addressLine2?: string;
  town?: string;
  county?: string;
  postcode?: string;
  country?: string;
}

/** Raw extraction from an ElevenLabs post-call analysis (voice fallback). */
export interface RawVoiceExtraction {
  insurerName?: string;
  scheme?: string;
  policyNumber?: string;
  authorisationCode?: string;
  claimReference?: string;
  excess?: string | number;
  validFrom?: string;
  validTo?: string;
  /** Whether the in-call NATO read-back of alphanumeric fields was confirmed. */
  readBackConfirmed?: boolean;
  /** 0..1 STT/analysis confidence reported by the provider, if any. */
  sttConfidence?: number;
}

/** Context supplied by the orchestrator when normalising a capture. */
export interface CaptureContext {
  tenantId: string;
  patientRef: string;
  /** ISO timestamp — passed in (never generated here) so behaviour is testable. */
  capturedAt: string;
  capturedBy?: string;
  consentVersion?: string;
}

/**
 * Result of discovering a tenant's insurance custom fields in their PMS.
 * `fallbackToInvoiceExtraInfo` is true when the insurer/policy tokens are
 * absent, signalling the orchestrator to write to invoice extra info and
 * raise an onboarding task instead of crashing.
 */
export interface InsuranceFieldMap {
  /** Options bound to the tenant's insurer / Provider field, for the form dropdown. */
  insurerOptions: string[];
  /**
   * Cliniko addresses insurance fields via a patient_form_template (questions keyed
   * by name, not token). templateId + question names locate them; null when none.
   */
  templateId: string | null;
  insurerQuestionName: string | null;
  policyQuestionName: string | null;
  /**
   * True when no structured insurance form is configured in the PMS. The write
   * still records a summary to the patient's billing info (invoice extra info);
   * the orchestrator raises an onboarding task recommending one be provisioned.
   */
  fallbackToInvoiceExtraInfo: boolean;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

/** Outcome of writing an InsuranceRecord into a PMS. */
export interface InsuranceWriteResult {
  ok: boolean;
  /**
   * True when structured custom fields were written. Cliniko exposes no API to
   * set structured patient custom-field values (patient_forms are patient-
   * completed), so the Cliniko adapter leaves this false and writes the summary
   * to billing info; other PMS adapters may support it.
   */
  wroteCustomFields: boolean;
  /** True when the staff-facing billing / invoice summary was written. */
  wroteBillingInfo: boolean;
  /** True when the tenant lacked insurance custom fields and we used invoice extra info. */
  usedFallback: boolean;
  /** True when the orchestrator should raise an onboarding task to provision fields. */
  onboardingTaskNeeded: boolean;
  /** Redacted error message — never contains a full policy number. */
  error?: string;
}
