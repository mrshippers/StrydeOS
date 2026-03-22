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
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyApiRequest, requireClinic, handleApiError } from "@/lib/auth-guard";
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

async function handler(request: NextRequest) {
  try {
    const user = await verifyApiRequest(request);

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

    const templateVars = { Name: patientName, ...(body.templateVars ?? {}) };
    const resolvedBody = resolveTemplate(body.body, templateVars);

    const now = new Date().toISOString();
    let success = false;
    let errorDetail: string | null = null;

    try {
      if (channel === "sms") {
        const twilio = getTwilio();
        await twilio.messages.create({
          body: resolvedBody,
          from: getTwilioPhone(),
          to,
        });
        success = true;
      } else if (channel === "email") {
        if (!subject) {
          return NextResponse.json({ error: "subject required for email channel" }, { status: 400 });
        }
        const fromEmail = process.env.RESEND_FROM_EMAIL ?? "noreply@strydeos.com";
        const resend = getResend();
        const { error } = await resend.emails.send({
          from: fromEmail,
          to,
          subject: resolveTemplate(subject, templateVars),
          text: resolvedBody,
        });
        if (error) throw new Error(error.message);
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
      const db = getAdminDb();
      const entry: Omit<CommsLogEntry, "id"> = {
        patientId,
        sequenceType,
        channel,
        sentAt: now,
        outcome: success ? "no_action" : "no_action", // outcome updated later (via webhook/manual)
      };
      await db.collection("clinics").doc(clinicId).collection("comms_log").add(entry);
    } catch (logErr) {
      Sentry.captureException(logErr, { tags: { context: "comms_log_write" } });
    }

    if (!success) {
      return NextResponse.json({ error: errorDetail ?? "Send failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, sentAt: now });
  } catch (error) {
    return handleApiError(error);
  }
}

export const POST = withRequestLog(handler);
