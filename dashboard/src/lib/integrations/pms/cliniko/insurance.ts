/**
 * Cliniko insurance discovery + write (Insurance Intake, Stream B).
 *
 * Verified against a live Cliniko sandbox (uk3, June 2026):
 *  - There is NO `/patient_fields` or `/custom_patient_fields` endpoint (both 404)
 *    and NO per-field `custom_field_token`. Custom fields are defined inside
 *    `patient_form_templates` as content.sections[].questions[] keyed by NAME;
 *    radiobutton questions carry their options in `answers[].value`.
 *  - `patient_forms` are patient-completion artifacts (they return a patient-facing
 *    URL); the API rejects inline answers, so they are not a programmatic write target.
 *  - The working write is `PATCH /patients/{id}` setting `invoice_extra_information`
 *    (confirmed by readback). Cliniko surfaces this on the patient and carries it
 *    onto invoices — exactly the "pre-loaded invoice" outcome the feature needs.
 *
 * So: discovery sources the insurer dropdown from a configured insurance form
 * template; the write records a formatted summary to the patient's billing info.
 */

import { clinikoFetch, clinikoFetchAll, type ClinikoConfig } from "./client";
import { redactPolicyNumber } from "@/lib/insurance/redact";
import type {
  InsuranceFieldMap,
  InsuranceRecord,
  InsuranceWriteResult,
} from "@/lib/insurance/types";

export const CLINIKO_FORM_TEMPLATES_PATH = "/patient_form_templates?per_page=100";
export const CLINIKO_FORM_TEMPLATES_KEY = "patient_form_templates";

const INSURER_RE = /insurer|insurance|provider/i;
const POLICY_RE = /policy|membership/i;

export interface ClinikoQuestion {
  name: string;
  type?: string;
  answers?: Array<string | { value?: string }>;
}
export interface ClinikoSection {
  name?: string;
  questions?: ClinikoQuestion[];
}
export interface ClinikoFormTemplate {
  id: string;
  name?: string;
  archived_at?: string | null;
  content?: { sections?: ClinikoSection[] };
}

function optionValues(q: ClinikoQuestion | null): string[] {
  if (!q || !Array.isArray(q.answers)) return [];
  return q.answers
    .map((a) => (typeof a === "string" ? a : a.value ?? ""))
    .filter((s) => s.length > 0);
}

const EMPTY_MAP: InsuranceFieldMap = {
  insurerOptions: [],
  templateId: null,
  insurerQuestionName: null,
  policyQuestionName: null,
  fallbackToInvoiceExtraInfo: true,
};

/**
 * Locate an insurance patient_form_template and map its insurer + policy
 * questions. Pure — no I/O. Falls back when none is found.
 */
export function mapInsuranceTemplates(templates: ClinikoFormTemplate[]): InsuranceFieldMap {
  for (const t of templates) {
    if (t.archived_at) continue;
    const templateLooksInsurance = INSURER_RE.test(t.name ?? "");

    let insurerQ: ClinikoQuestion | null = null;
    let policyQ: ClinikoQuestion | null = null;
    for (const section of t.content?.sections ?? []) {
      for (const q of section.questions ?? []) {
        if (!policyQ && POLICY_RE.test(q.name)) policyQ = q;
        else if (!insurerQ && INSURER_RE.test(q.name)) insurerQ = q;
      }
    }

    // Accept the template if we found an insurer field, or it is clearly an
    // insurance form that at least has a policy field.
    if (insurerQ || (templateLooksInsurance && policyQ)) {
      return {
        insurerOptions: optionValues(insurerQ),
        templateId: t.id,
        insurerQuestionName: insurerQ?.name ?? null,
        policyQuestionName: policyQ?.name ?? null,
        fallbackToInvoiceExtraInfo: false,
      };
    }
  }
  return { ...EMPTY_MAP };
}

// Markers that fence the StrydeOS-generated block inside the patient's free-text
// invoice info. They let us replace our own block on re-approval (idempotent)
// while preserving anything the clinician typed by hand around it.
export const STRYDE_BLOCK_START = "[StrydeOS insurance]";
export const STRYDE_BLOCK_END = "[/StrydeOS insurance]";

const BUPA_RE = /bupa/i;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Human-readable summary written to the patient's billing / invoice extra info.
 *
 * Labels match what the clinic actually types on a Cliniko invoice: Bupa
 * patients carry a "Membership number" and a "Pre-auth -" line (verified against
 * a real Spires Bupa invoice, June 2026); other insurers use the generic
 * Policy / Auth labels. Capture provenance is deliberately NOT included — it is
 * recorded in the intake audit trail, never leaked onto the patient invoice.
 */
export function buildInsuranceSummary(record: InsuranceRecord): string {
  const isBupa = BUPA_RE.test(record.insurerName ?? "");
  const lines: string[] = [`Insurer: ${record.insurerName}`];
  if (record.scheme) lines.push(`Scheme: ${record.scheme}`);
  if (record.policyNumber) {
    lines.push(isBupa ? `Membership number ${record.policyNumber}` : `Policy: ${record.policyNumber}`);
  }
  if (record.authorisationCode) {
    lines.push(isBupa ? `Pre-auth - ${record.authorisationCode}` : `Auth: ${record.authorisationCode}`);
  }
  if (record.claimReference) lines.push(`Claim: ${record.claimReference}`);
  if (record.excessPence !== undefined) {
    lines.push(`Excess: £${(record.excessPence / 100).toFixed(2)}`);
  }
  return lines.join("\n");
}

/**
 * Merge a fresh StrydeOS summary into the patient's existing invoice extra info
 * without destroying a clinician's hand-typed note. Any prior StrydeOS block is
 * stripped first (so re-approval replaces rather than stacks), and the new block
 * is fenced with markers and appended below whatever the clinician kept.
 */
export function mergeInvoiceExtraInfo(existing: string | undefined, summary: string): string {
  const block = `${STRYDE_BLOCK_START}\n${summary}\n${STRYDE_BLOCK_END}`;
  const priorBlock = new RegExp(
    `\\n*${escapeRegExp(STRYDE_BLOCK_START)}[\\s\\S]*?${escapeRegExp(STRYDE_BLOCK_END)}\\n*`,
    "g",
  );
  const preserved = (existing ?? "")
    .replace(priorBlock, "")
    // Drop any legacy unmarked StrydeOS summary: the pre-marker writer tagged its
    // single line with "(captured via StrydeOS ...)", a sentinel nothing else emits.
    .split("\n")
    .filter((line) => !line.includes("(captured via StrydeOS"))
    .join("\n")
    .trim();
  return preserved ? `${preserved}\n\n${block}` : block;
}

/** Replace any full policy/auth value in an error string with its redacted form. */
function redactError(err: unknown, record: InsuranceRecord): string {
  let msg = err instanceof Error ? err.message : String(err);
  for (const secret of [record.policyNumber, record.authorisationCode]) {
    if (secret && secret.length > 0) {
      msg = msg.split(secret).join(redactPolicyNumber(secret));
    }
  }
  return msg;
}

export async function discoverClinikoInsuranceFields(
  config: ClinikoConfig,
): Promise<InsuranceFieldMap> {
  const templates = await clinikoFetchAll<ClinikoFormTemplate>(
    config,
    CLINIKO_FORM_TEMPLATES_PATH,
    CLINIKO_FORM_TEMPLATES_KEY,
  );
  return mapInsuranceTemplates(templates);
}

export async function writeInsuranceToCliniko(
  config: ClinikoConfig,
  record: InsuranceRecord,
  fieldMap: InsuranceFieldMap,
): Promise<InsuranceWriteResult> {
  const patientPath = `/patients/${encodeURIComponent(record.patientRef)}`;
  const usedFallback = fieldMap.fallbackToInvoiceExtraInfo;

  try {
    // Read the patient's current invoice info FIRST, so the write merges into
    // (rather than blindly overwrites) whatever the clinician typed by hand.
    // A read failure must not block the approval — fall back to writing fresh.
    let existingExtra: string | undefined;
    try {
      const current = await clinikoFetch<{ invoice_extra_information?: string }>(config, patientPath);
      existingExtra = current?.invoice_extra_information ?? undefined;
    } catch {
      existingExtra = undefined;
    }

    // Patient profile patch: merged insurance summary + any confirmed address.
    //
    // Round-trip alignment: getPatient() reads the insurer back from
    // `concession_type`, so we write the canonical insurer name there as well as
    // the human-readable summary into `invoice_extra_information`. Without this,
    // a write→read would lose the insurer (the summary string is not parsed back).
    const patch: Record<string, string> = {
      invoice_extra_information: mergeInvoiceExtraInfo(existingExtra, buildInsuranceSummary(record)),
    };
    if (record.insurerName) patch.concession_type = record.insurerName;
    if (record.addressLine1) patch.address_1 = record.addressLine1;
    if (record.addressLine2) patch.address_2 = record.addressLine2;
    if (record.town) patch.city = record.town;
    if (record.county) patch.state = record.county;
    if (record.postcode) patch.post_code = record.postcode;
    if (record.country) patch.country = record.country;

    await clinikoFetch(config, patientPath, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });

    return {
      ok: true,
      // Cliniko has no API to set structured patient custom-field values.
      wroteCustomFields: false,
      wroteBillingInfo: true,
      usedFallback,
      onboardingTaskNeeded: usedFallback,
    };
  } catch (err) {
    return {
      ok: false,
      wroteCustomFields: false,
      wroteBillingInfo: false,
      usedFallback,
      onboardingTaskNeeded: false,
      error: redactError(err, record),
    };
  }
}
