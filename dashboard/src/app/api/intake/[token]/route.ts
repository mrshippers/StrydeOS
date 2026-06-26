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
import type { RawFormSubmission } from "@/lib/insurance/types";

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
    await intakeRef.set({ ...record, linkId: payload.linkId, appointmentId: link.appointmentId ?? null });

    await ref.set(
      { status: "submitted", submittedAt: record.capturedAt, intakeId: intakeRef.id },
      { merge: true },
    );

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
