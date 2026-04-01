/**
 * POST /api/bookings/create
 *
 * Creates a booking in the PMS (WriteUpp) and mirrors it in Firestore.
 * Called by n8n after Ava (voice AI) confirms a booking with the caller.
 *
 * Auth: shared webhook secret (AVA_BOOKING_SECRET) — NOT Firebase Auth,
 * because the caller is n8n/ElevenLabs, not a logged-in user.
 *
 * Request body:
 *   clinicId              — StrydeOS clinic ID
 *   patientFirstName      — caller's first name
 *   patientLastName       — caller's last name
 *   patientPhone          — caller's phone (E.164)
 *   patientEmail          — caller's email
 *   clinicianExternalId   — WriteUpp practitioner ID
 *   dateTime              — ISO 8601 start time (Europe/London)
 *   durationMinutes       — appointment length (default 45)
 *   appointmentType       — "initial_assessment" | "follow_up"
 *   notes?                — free-text notes from the call
 *   callId?               — voice call ID for traceability
 *   idempotencyKey?       — client-supplied dedup key (prevents double-booking on retry)
 *
 * Response:
 *   { ok: true, appointmentId, pmsExternalId, patientExternalId }
 *   or { error: string } with appropriate status code
 */

import crypto from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { getAdminDb } from "@/lib/firebase-admin";
import { createPMSAdapter } from "@/lib/integrations/pms/factory";
import { writeAuditLog } from "@/lib/audit-log";
import type { PMSIntegrationConfig } from "@/types/pms";
import type { AppointmentType, AppointmentSource } from "@/types";
import { withRequestLog } from "@/lib/request-logger";

export const runtime = "nodejs";

const BOOKING_SECRET = process.env.AVA_BOOKING_SECRET;

// ─── Request / response types ────────────────────────────────────────────────

interface CreateBookingBody {
  clinicId: string;
  patientFirstName: string;
  patientLastName: string;
  patientPhone: string;
  patientEmail?: string;
  clinicianExternalId: string;
  dateTime: string;
  durationMinutes?: number;
  appointmentType?: AppointmentType;
  notes?: string;
  callId?: string;
  idempotencyKey?: string;
  insurerName?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Compute end time from start + duration. */
function computeEndTime(startIso: string, durationMinutes: number): string {
  const start = new Date(startIso);
  if (isNaN(start.getTime())) throw new Error(`Invalid dateTime: ${startIso}`);
  return new Date(start.getTime() + durationMinutes * 60_000).toISOString();
}

/** Validate required string fields are non-empty. */
function validateRequired(
  body: CreateBookingBody
): string | null {
  if (!body.clinicId?.trim()) return "clinicId is required";
  if (!body.patientFirstName?.trim()) return "patientFirstName is required";
  if (!body.patientLastName?.trim()) return "patientLastName is required";
  if (!body.patientPhone?.trim()) return "patientPhone is required";
  if (!body.clinicianExternalId?.trim()) return "clinicianExternalId is required";
  if (!body.dateTime?.trim()) return "dateTime is required";

  // Validate dateTime is a parseable date
  const dt = new Date(body.dateTime);
  if (isNaN(dt.getTime())) return `dateTime is not a valid ISO date: ${body.dateTime}`;

  // Validate dateTime is not in the past (with 5-minute grace for clock drift)
  const fiveMinAgo = Date.now() - 5 * 60_000;
  if (dt.getTime() < fiveMinAgo) return "dateTime is in the past";

  // Validate appointmentType if provided
  const validTypes: AppointmentType[] = ["initial_assessment", "follow_up", "review", "discharge"];
  if (body.appointmentType && !validTypes.includes(body.appointmentType)) {
    return `appointmentType must be one of: ${validTypes.join(", ")}`;
  }

  return null;
}

// ─── Route handler ───────────────────────────────────────────────────────────

async function handler(request: NextRequest) {
  // Rate limit: 20 requests per IP per minute
  const { limited, remaining } = checkRateLimit(request, { limit: 20, windowMs: 60 * 1000 });
  if (limited) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "X-RateLimit-Remaining": String(remaining) } }
    );
  }

  try {
    // ── Auth: shared secret (n8n / ElevenLabs, not a browser user) ──
    const secret =
      request.headers.get("x-webhook-secret") ??
      request.headers.get("authorization")?.replace("Bearer ", "");

    if (
      !BOOKING_SECRET ||
      !secret ||
      secret.length !== BOOKING_SECRET.length ||
      !crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(BOOKING_SECRET))
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Parse + validate ──
    let body: CreateBookingBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const validationError = validateRequired(body);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const {
      clinicId,
      patientFirstName,
      patientLastName,
      patientPhone,
      patientEmail,
      clinicianExternalId,
      dateTime,
      durationMinutes = 45,
      appointmentType = "initial_assessment",
      notes,
      callId,
      idempotencyKey,
      insurerName,
    } = body;

    const db = getAdminDb();
    const clinicRef = db.collection("clinics").doc(clinicId);

    // ── Idempotency check ──
    if (idempotencyKey) {
      const existing = await clinicRef
        .collection("appointments")
        .where("idempotencyKey", "==", idempotencyKey)
        .limit(1)
        .get();

      if (!existing.empty) {
        const doc = existing.docs[0];
        const data = doc.data();
        return NextResponse.json({
          ok: true,
          appointmentId: doc.id,
          pmsExternalId: data.pmsExternalId ?? null,
          patientExternalId: data.patientId ?? null,
          deduplicated: true,
        });
      }
    }

    // ── Load PMS config ──
    const configSnap = await clinicRef
      .collection("integrations_config")
      .doc("pms")
      .get();
    const pmsConfig = configSnap.data() as PMSIntegrationConfig | undefined;

    if (!pmsConfig?.apiKey?.trim()) {
      return NextResponse.json(
        { error: "PMS integration not configured for this clinic" },
        { status: 422 }
      );
    }

    const adapter = createPMSAdapter(pmsConfig);
    const endTime = computeEndTime(dateTime, durationMinutes);
    const now = new Date().toISOString();

    // ── Resolve or create the patient in the PMS ──
    // Search for existing patient by phone to avoid duplicates
    let patientExternalId: string | null = null;

    // Check Firestore patients collection for a matching phone number
    const patientSnap = await clinicRef
      .collection("patients")
      .where("contact.phone", "==", patientPhone)
      .limit(1)
      .get();

    if (!patientSnap.empty) {
      const existingPatient = patientSnap.docs[0].data();
      patientExternalId = existingPatient.pmsExternalId ?? patientSnap.docs[0].id;
    }

    // If no existing patient, we still pass the phone as the external ID placeholder.
    // The PMS sync pipeline will reconcile this when the WriteUpp webhook fires back.
    if (!patientExternalId) {
      patientExternalId = `ava_${patientPhone.replace(/\D/g, "")}`;
    }

    // ── Write to PMS ──
    let pmsExternalId: string | null = null;
    let pmsWriteError: string | null = null;

    try {
      const pmsResult = await adapter.createAppointment({
        patientExternalId,
        clinicianExternalId,
        dateTime,
        endTime,
        appointmentType,
        notes: notes
          ? `[Booked by Ava] ${notes}`
          : "[Booked by Ava — AI receptionist]",
      });
      pmsExternalId = pmsResult.externalId;
    } catch (err) {
      pmsWriteError = err instanceof Error ? err.message : String(err);
      Sentry.captureException(err, {
        tags: { context: "ava_booking_pms_write", clinicId },
        extra: { patientPhone, clinicianExternalId, dateTime },
      });
    }

    // ── Write to Firestore (mirror) ──
    // Use the PMS external ID as the Firestore doc ID when available,
    // so that when the WriteUpp webhook fires back and syncAppointments runs,
    // it merges into the same document instead of creating a duplicate.
    const firestoreDocId = pmsExternalId ?? idempotencyKey ?? db.collection("_").doc().id;
    const isIA = appointmentType === "initial_assessment";
    const source: AppointmentSource = "strydeos_receptionist";

    const appointmentData: Record<string, unknown> = {
      patientId: patientExternalId,
      clinicianId: clinicianExternalId,
      dateTime,
      endTime,
      status: "scheduled",
      appointmentType,
      isInitialAssessment: isIA,
      hepAssigned: false,
      revenueAmountPence: 0,
      followUpBooked: false,
      source,
      pmsExternalId: pmsExternalId ?? null,
      pmsWriteStatus: pmsExternalId ? "success" : "failed",
      pmsWriteError: pmsWriteError ?? null,
      bookedBy: "ava",
      callId: callId ?? null,
      idempotencyKey: idempotencyKey ?? null,
      patientFirstName: patientFirstName.trim(),
      patientLastName: patientLastName.trim(),
      patientPhone,
      patientEmail: patientEmail ?? null,
      insurerName: insurerName ?? null,
      createdAt: now,
      updatedAt: now,
    };

    await clinicRef
      .collection("appointments")
      .doc(firestoreDocId)
      .set(appointmentData, { merge: true });

    // ── Ensure patient record exists in Firestore ──
    const patientDocRef = clinicRef.collection("patients").doc(patientExternalId);
    const patientDoc = await patientDocRef.get();
    if (!patientDoc.exists) {
      await patientDocRef.set(
        {
          pmsExternalId: patientExternalId,
          firstName: patientFirstName.trim(),
          lastName: patientLastName.trim(),
          contact: {
            phone: patientPhone,
            email: patientEmail ?? null,
          },
          insurerName: insurerName ?? null,
          source: "ava_booking",
          createdAt: now,
          updatedAt: now,
        },
        { merge: true }
      );
    }

    // ── Link the voice interaction (if callId provided) ──
    if (callId) {
      const voiceDocRef = clinicRef.collection("voiceInteractions").doc(callId);
      const voiceDoc = await voiceDocRef.get();
      if (voiceDoc.exists) {
        await voiceDocRef.set(
          {
            outcome: "booked",
            appointmentId: firestoreDocId,
            pmsExternalId: pmsExternalId ?? null,
            updatedAt: now,
          },
          { merge: true }
        );
      }
    }

    // ── Audit log ──
    await writeAuditLog(db, clinicId, {
      userId: "system:ava",
      userEmail: "ava@strydeos.com",
      action: "write",
      resource: "appointments",
      resourceId: firestoreDocId,
      metadata: {
        patientPhone,
        clinicianExternalId,
        dateTime,
        appointmentType,
        pmsExternalId,
        pmsWriteStatus: pmsExternalId ? "success" : "failed",
        pmsWriteError: pmsWriteError ?? undefined,
        callId: callId ?? undefined,
        source: "ava_booking",
      },
    });

    // ── If PMS write failed, log a separate error audit entry ──
    if (pmsWriteError) {
      await writeAuditLog(db, clinicId, {
        userId: "system:ava",
        userEmail: "ava@strydeos.com",
        action: "write",
        resource: "pms_write_failure",
        resourceId: firestoreDocId,
        metadata: {
          error: pmsWriteError,
          patientPhone,
          clinicianExternalId,
          dateTime,
          retryable: true,
        },
      });
    }

    // ── Response ──
    if (pmsWriteError) {
      // Partial success: Firestore record created, PMS write failed
      return NextResponse.json(
        {
          ok: true,
          partial: true,
          appointmentId: firestoreDocId,
          pmsExternalId: null,
          patientExternalId,
          warning: `Booking saved locally but PMS write failed: ${pmsWriteError}. Will retry on next sync.`,
        },
        { status: 207 }
      );
    }

    return NextResponse.json({
      ok: true,
      appointmentId: firestoreDocId,
      pmsExternalId,
      patientExternalId,
    });
  } catch (err) {
    Sentry.captureException(err, { tags: { context: "ava_booking_create" } });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export const POST = withRequestLog(handler);
