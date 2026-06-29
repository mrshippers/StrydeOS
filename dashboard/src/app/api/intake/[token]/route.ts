/**
 * Public insurance intake endpoint (token-gated, unauthenticated).
 *
 * GET  /api/intake/[token]  → { clinicName, insurerOptions, status, consentVersion }
 * POST /api/intake/[token]  → submit insurance details (creates a PENDING record)
 *
 * Security posture: this endpoint NEVER writes to the PMS. A submission lands in
 * the staff review queue (insurance_intakes, reviewStatus "pending"); a human
 * approves before anything reaches Cliniko. Consent is enforced server-side.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { handleApiError } from "@/lib/auth-guard";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { withRequestLog } from "@/lib/request-logger";
import { writeAuditLog, extractIpFromRequest } from "@/lib/audit-log";
import { verifyIntakeToken } from "@/lib/insurance/intake-token";
import { validateInsuranceSubmission } from "@/lib/insurance/validate";
import { normaliseFormSubmission } from "@/lib/insurance/normalise";
import { evaluateInsurerClaim } from "@/lib/insurance/appointment-classifier";
import { redactRecordForLog } from "@/lib/insurance/redact";
import { stageIntakeToPms } from "@/lib/insurance/stage-to-pms";
import type { RawFormSubmission, InsuranceRecord, InsuranceAuditEntry } from "@/lib/insurance/types";

const INTAKE_LINKS = "insurance_intake_links";
const INTAKES = "insurance_intakes";

interface LinkDoc {
  patientRef: string;
  appointmentId: string | null;
  insurerOptions: string[];
  /** Insurer derived from the booked appointment type; locks the form field. */
  derivedInsurer?: string | null;
  consentVersion?: string;
  status: "issued" | "submitted";
  intakeId?: string;
}

async function loadLink(token: string) {
  const payload = verifyIntakeToken(token, Date.now());
  if (!payload) return { error: "Invalid or expired link" as const };
  const db = getAdminDb();
  const ref = db
    .collection("clinics").doc(payload.clinicId)
    .collection(INTAKE_LINKS).doc(payload.linkId);
  const snap = await ref.get();
  if (!snap.exists) return { error: "Invalid or expired link" as const };
  return { payload, ref, link: snap.data() as LinkDoc, db };
}

async function getHandler(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { limited } = await checkRateLimitAsync(request, { limit: 30, windowMs: 60_000 });
  if (limited) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  try {
    const { token } = await params;
    const loaded = await loadLink(token);
    if ("error" in loaded) {
      return NextResponse.json({ error: loaded.error }, { status: 404 });
    }
    const { payload, link, db } = loaded;

    const clinicSnap = await db.collection("clinics").doc(payload.clinicId).get();
    const clinicData = clinicSnap.data();
    const clinicName = (clinicData?.name as string | undefined) ?? "Your clinic";
    const clinicLogoUrl = (clinicData?.brandConfig?.logo as string | undefined) ?? null;

    return NextResponse.json({
      clinicName,
      clinicLogoUrl,
      insurerOptions: link.insurerOptions ?? [],
      // When the insurer was derived from the booked appointment type, the form
      // shows it read-only (the patient does not pick their insurer).
      derivedInsurer: link.derivedInsurer ?? null,
      status: link.status,
      consentVersion: link.consentVersion ?? "intake-v1",
    });
  } catch (e) {
    return handleApiError(e);
  }
}

async function postHandler(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { limited } = await checkRateLimitAsync(request, { limit: 15, windowMs: 60_000 });
  if (limited) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  try {
    const { token } = await params;
    const loaded = await loadLink(token);
    if ("error" in loaded) {
      return NextResponse.json({ error: loaded.error }, { status: 404 });
    }
    const { payload, ref, link, db } = loaded;

    if (link.status === "submitted") {
      return NextResponse.json({ error: "This form has already been submitted." }, { status: 409 });
    }

    const body = (await request.json().catch(() => ({}))) as RawFormSubmission;

    // When the insurer was derived from the booked appointment type it is the
    // authoritative value and the form field is locked — never trust a
    // client-supplied insurer over it (prevents spoofing the locked field).
    if (link.derivedInsurer) {
      body.insurerName = link.derivedInsurer;
    }

    // Validate against the derived insurer when present, else the discovered list.
    const insurerOptions = link.derivedInsurer ? [link.derivedInsurer] : link.insurerOptions;
    const validation = validateInsuranceSubmission(body, { insurerOptions });
    if (!validation.ok) {
      return NextResponse.json({ error: "Validation failed", errors: validation.errors }, { status: 400 });
    }

    const record = normaliseFormSubmission(body, {
      tenantId: payload.clinicId,
      patientRef: link.patientRef,
      capturedAt: new Date().toISOString(),
      capturedBy: "patient",
      consentVersion: link.consentVersion ?? "intake-v1",
    });

    // Insurer-mismatch safety net: when the insurer is locked (derived from the
    // booked appointment type) the patient may FLAG a different insurer. We keep
    // the derived value authoritative and only raise a flag for staff to resolve.
    if (link.derivedInsurer) {
      const claim = evaluateInsurerClaim(link.derivedInsurer, body.patientClaimedInsurer);
      if (claim.insurerMismatch) {
        record.insurerMismatch = true;
        record.claimedInsurer = claim.claimedInsurer;
      }
    }

    const intakeRef = db
      .collection("clinics").doc(payload.clinicId)
      .collection(INTAKES).doc();
    const stored: InsuranceRecord = {
      ...record,
      id: intakeRef.id,
      appointmentId: link.appointmentId ?? null,
    };
    await intakeRef.set({ ...stored, linkId: payload.linkId });

    await ref.set(
      { status: "submitted", submittedAt: record.capturedAt, intakeId: intakeRef.id },
      { merge: true },
    );

    // Auto-stage: write straight to the PMS so StrydeOS stays invisible — no
    // human approval gate. It is the patient's own data and fully reversible in
    // the PMS, so a manual gate is pure friction. A miss (no PMS configured, or a
    // transient write error) leaves the record pending in the staff queue rather
    // than losing it; auto-stage must NEVER fail the patient's submission.
    try {
      const stage = await stageIntakeToPms(db, payload.clinicId, stored);
      const auto = (entry: Omit<InsuranceAuditEntry, "at" | "actor">): InsuranceAuditEntry => ({
        at: new Date().toISOString(),
        actor: "auto",
        ...entry,
      });
      if (stage.ok) {
        await intakeRef.set(
          {
            reviewStatus: "approved",
            pmsInvoiceUrl: stage.pmsInvoiceUrl,
            audit: [...(stored.audit ?? []), auto({
              action: "written",
              note: stage.usedFallback
                ? "auto-staged insurance summary to patient billing info (no structured insurance form configured)"
                : "auto-staged insurance summary to patient billing info",
            })],
          },
          { merge: true },
        );
        if (stage.onboardingTaskNeeded) {
          await db.collection("clinics").doc(payload.clinicId).set(
            { onboarding: { insuranceFieldsNeeded: true } },
            { merge: true },
          );
        }
      } else if (!stage.noPms) {
        // PMS configured but the write failed: keep pending for staff retry, log why.
        await intakeRef.set(
          { audit: [...(stored.audit ?? []), auto({ action: "write_failed", note: stage.error })] },
          { merge: true },
        );
      }
      // stage.noPms => leave pending silently; the clinic resolves it in the queue.
    } catch {
      // Never break the patient's submission on an auto-stage error.
    }

    // Audit without PHI — policy number is redacted before anything is logged.
    const safe = redactRecordForLog(record);
    await writeAuditLog(db, payload.clinicId, {
      userId: "patient",
      userEmail: "",
      action: "write",
      resource: "insurance_intake",
      resourceId: intakeRef.id,
      metadata: {
        source: "form",
        insurerName: safe.insurerName,
        policyNumber: safe.policyNumber,
        ...(record.insurerMismatch ? { insurerMismatch: true, claimedInsurer: record.claimedInsurer } : {}),
      },
      ip: extractIpFromRequest(request),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}

export const GET = withRequestLog(getHandler);
export const POST = withRequestLog(postHandler);
