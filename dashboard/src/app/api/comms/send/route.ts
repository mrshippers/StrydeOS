/**
 * POST /api/comms/send
 *
 * Sends a comms sequence message (SMS via Twilio or email via Resend)
 * and logs the send to Firestore comms_log.
 *
 * Body:
 *   clinicId      — clinic to bill / log against
 *   patientId     — patient record ID
 *   patientName   — for log + template substitution
 *   sequenceType  — hep_reminder | rebooking_prompt | pre_auth_collection | review_prompt | reactivation_90d | reactivation_180d
 *   channel       — "sms" | "email"
 *   to            — phone number (E.164) for SMS, email address for email
 *   templateVars  — key/value pairs to substitute in message body ([Name], [Date], etc.)
 *   subject?      — required for email channel
 *   body          — message body with [Variable] placeholders
 */

import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyApiRequest, requireRole, requireClinic, handleApiError } from "@/lib/auth-guard";
import { getTwilio, getTwilioPhone } from "@/lib/twilio";
import { getResend } from "@/lib/resend";
import type { SequenceType, CommsChannel, CommsLogEntry } from "@/types";
import { withRequestLog } from "@/lib/request-logger";

export const runtime = "nodejs";

interface SendCommsBody {
  clinicId: string;
  patientId: string;
  patientName: string;
  sequenceType: SequenceType;
  channel: CommsChannel;
  to: string;
  body: string;
  subject?: string;
  templateVars?: Record<string, string>;
}

function resolveTemplate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (str, [key, val]) => str.replaceAll(`[${key}]`, val),
    template
  );
}

/**
 * Find any unresolved `[Variable]` tokens remaining in a template after
 * substitution. Used to short-circuit sends that would leak literal
 * placeholder strings to patients.
 */
function findUnresolvedTokens(template: string): string[] {
  const matches = template.match(/\[([A-Za-z][A-Za-z0-9_]*)\]/g) ?? [];
  return [...new Set(matches.map((m) => m.slice(1, -1)))];
}

/**
 * Normalise a UK phone number to E.164. Accepts:
 *   - already-E.164 (starts with "+")
 *   - UK domestic "07xxxxxxxxx" (11 digits starting 0)
 * Returns { ok: true, normalised } or { ok: false } if the number is not
 * a supported format.
 */
function normaliseSmsNumber(raw: string): { ok: true; normalised: string } | { ok: false } {
  const trimmed = raw.trim().replace(/\s+/g, "");
  if (trimmed.startsWith("+")) return { ok: true, normalised: trimmed };
  if (/^0[0-9]{10}$/.test(trimmed)) {
    return { ok: true, normalised: `+44${trimmed.slice(1)}` };
  }
  return { ok: false };
}

async function handler(request: NextRequest) {
  // Rate limit: 20 requests per IP per 60 seconds
  const { limited, remaining } = await checkRateLimitAsync(request, { limit: 20, windowMs: 60_000 });
  if (limited) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "X-RateLimit-Remaining": String(remaining) } }
    );
  }

  try {
    const user = await verifyApiRequest(request);
    requireRole(user, ["owner", "admin", "superadmin"]);

    let body: SendCommsBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { clinicId, patientId, patientName, sequenceType, channel, to, subject } = body;
    if (!clinicId || !patientId || !sequenceType || !channel || !to || !body.body) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    requireClinic(user, clinicId);

    const db = getAdminDb();

    // ── Opt-out gate ────────────────────────────────────────────────────
    // Ad-hoc sends must respect prior unsubscribes. The sequence runner
    // already honours this (trigger-sequences.ts line ~207); replicate the
    // check here so manual "Re-engage" or UI sends cannot bypass STOP.
    try {
      const unsubSnap = await db
        .collection("clinics")
        .doc(clinicId)
        .collection("comms_log")
        .where("patientId", "==", patientId)
        .where("outcome", "==", "unsubscribed")
        .limit(1)
        .get();
      if (!unsubSnap.empty) {
        return NextResponse.json(
          { error: "Patient has opted out of communications", outcome: "unsubscribed" },
          { status: 409 }
        );
      }
    } catch (err) {
      // Firestore failure here is fatal — we can't confirm opt-out status
      // and must not risk messaging an unsubscribed patient.
      Sentry.captureException(err, { tags: { context: "comms_opt_out_check" } });
      return NextResponse.json(
        { error: "Unable to verify patient opt-out status" },
        { status: 500 }
      );
    }

    // ── Resolve authoritative template vars from Firestore ──────────────
    // ClinicName / BookingUrl / ReviewLink come from the clinic doc, not
    // the caller, so patient-facing messages always use the canonical
    // clinic metadata. Caller-provided templateVars still override (e.g.
    // per-patient tokens like appointment times).
    let clinicName = "";
    let bookingUrl = "";
    let reviewLink = "";
    try {
      const clinicDoc = await db.collection("clinics").doc(clinicId).get();
      const clinicData = clinicDoc.exists ? (clinicDoc.data() ?? {}) : {};
      clinicName = (clinicData.name as string) ?? "";
      bookingUrl = (clinicData.bookingUrl as string) ?? "";
      reviewLink = (clinicData.googleReviewUrl as string) ?? "";
    } catch (err) {
      Sentry.captureException(err, { tags: { context: "comms_clinic_meta_read" } });
      // Non-fatal — fall through with empty strings; unresolved-token
      // check below will catch any templates that actually need them.
    }

    // Only include vars with non-empty values so that missing clinic metadata
    // (e.g. no bookingUrl configured) leaves the `[BookingUrl]` token intact
    // — the leak guard below then refuses to dispatch instead of sending an
    // empty-string substitution to a patient.
    const candidateVars: Record<string, string> = {
      Name: patientName,
      ClinicName: clinicName,
      BookingUrl: bookingUrl,
      ReviewLink: reviewLink,
      ...(body.templateVars ?? {}),
    };
    const templateVars: Record<string, string> = Object.fromEntries(
      Object.entries(candidateVars).filter(([, v]) => typeof v === "string" && v.length > 0),
    );
    const resolvedBody = resolveTemplate(body.body, templateVars);
    const resolvedSubject = subject ? resolveTemplate(subject, templateVars) : undefined;

    // ── Leak guard: refuse to send if any [Variable] token survives ─────
    const unresolvedInBody = findUnresolvedTokens(resolvedBody);
    const unresolvedInSubject = resolvedSubject ? findUnresolvedTokens(resolvedSubject) : [];
    const unresolved = [...new Set([...unresolvedInBody, ...unresolvedInSubject])];
    if (unresolved.length > 0) {
      Sentry.captureMessage(
        `[comms/send] Unresolved template variables — send blocked: ${unresolved.join(", ")}`,
        { level: "warning", tags: { sequenceType, channel, clinicId } }
      );
      return NextResponse.json(
        { error: "Template has unresolved variables", unresolved },
        { status: 422 }
      );
    }

    const now = new Date().toISOString();
    let success = false;
    let errorDetail: string | null = null;
    let twilioSid: string | undefined;
    let resendId: string | undefined;
    // Mutable recipient — may be normalised from a UK 07... number to +44...
    // before Twilio dispatch.
    let recipient = to;

    try {
      if (channel === "sms") {
        const normalised = normaliseSmsNumber(to);
        if (!normalised.ok) {
          return NextResponse.json(
            { error: "Invalid SMS recipient — must be E.164 or UK format (07...)" },
            { status: 400 }
          );
        }
        recipient = normalised.normalised;
        const twilio = getTwilio();
        const msg = await twilio.messages.create({
          body: resolvedBody,
          from: getTwilioPhone(),
          to: recipient,
        });
        twilioSid = msg.sid;
        success = true;
      } else if (channel === "email") {
        if (!subject || !resolvedSubject) {
          return NextResponse.json({ error: "subject required for email channel" }, { status: 400 });
        }
        const fromEmail = process.env.RESEND_FROM_EMAIL ?? "noreply@strydeos.com";
        const resend = getResend();
        const { data, error } = await resend.emails.send({
          from: `StrydeOS Pulse <${fromEmail}>`,
          to,
          subject: resolvedSubject,
          text: resolvedBody,
        });
        if (error) throw new Error(error.message);
        resendId = data?.id;
        success = true;
      } else {
        return NextResponse.json({ error: `Unsupported channel: ${channel}` }, { status: 400 });
      }
    } catch (err) {
      errorDetail = err instanceof Error ? err.message : String(err);
      Sentry.captureException(err, { tags: { sequenceType, channel } });
    }

    // Log the attempt to Firestore regardless of success/failure
    try {
      // Denormalise clinicianId from patient record for query scoping
      let clinicianId: string | undefined;
      try {
        const patientDoc = await db.doc(`clinics/${clinicId}/patients/${patientId}`).get();
        clinicianId = patientDoc.exists ? (patientDoc.data()?.clinicianId as string | undefined) : undefined;
      } catch {
        // Non-blocking — comms log still written without clinicianId
      }

      const entry: Omit<CommsLogEntry, "id"> = {
        patientId,
        clinicianId,
        sequenceType,
        channel,
        sentAt: now,
        // pending = provider accepted, awaiting delivery webhook (Twilio/Resend).
        // send_failed = immediate dispatch failure (caught above).
        outcome: success ? "pending" : "send_failed",
        // Explicit template tracking for future template-migration compatibility.
        // For direct /api/comms/send calls the "template" is the caller-provided body;
        // we tag it with the sequenceType so provenance is preserved.
        templateKey: `${sequenceType}_direct`,
        ...(twilioSid ? { twilioSid } : {}),
        ...(resendId ? { resendId } : {}),
      };
      await db.collection("clinics").doc(clinicId).collection("comms_log").add(entry);
    } catch (logErr) {
      Sentry.captureException(logErr, { tags: { context: "comms_log_write" } });
    }

    if (!success) {
      console.error("[comms/send] Send failed:", errorDetail);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, sentAt: now });
  } catch (error) {
    return handleApiError(error);
  }
}

export const POST = withRequestLog(handler);
