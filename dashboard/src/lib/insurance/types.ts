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

export type InsuranceReviewStatus = "pending" | "approved" | "rejected";

export type InsuranceAuditAction =
  | "captured"
  | "approved"
  | "rejected"
  | "written"
  | "write_failed";

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
  audit: InsuranceAuditEntry[];

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
