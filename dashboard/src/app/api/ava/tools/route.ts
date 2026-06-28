/**
 * POST /api/ava/tools
 *
 * Dispatch endpoint for ElevenLabs tool calls during live Ava conversations.
 * Receives tool invocations from ElevenLabs agent, resolves the clinic,
 * loads PMS config, executes the tool, and returns a speakable result.
 *
 * Supported tools:
 *   - check_availability: queries PMS for open slots
 *   - book_appointment: creates booking in PMS + Firestore mirror
 *   - update_booking: cancels or reschedules via PMS
 *   - send_insurance_intake_link: texts the patient a secure insurance/pre-auth
 *     intake link mid-call (same pipeline as the staff failsafe)
 *
 * Auth: Bearer token (ELEVENLABS_WEBHOOK_SECRET). ElevenLabs tool-call webhooks
 *        use Authorization: Bearer — HMAC is only for conversation event webhooks.
 * Returns { response: string } — ElevenLabs speaks this back to the caller.
 */

import * as crypto from "crypto";
import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { createPMSAdapter } from "@/lib/integrations/pms/factory";
import { createIntakeLink, type IntakeLinkResult } from "@/lib/insurance/create-link";
import { buildInsuranceIntakeSms } from "@/lib/insurance/sms";
import { checkIntakeSuppression } from "@/lib/insurance/dedupe";
import { getTwilio } from "@/lib/twilio";
import { getClinicBranding } from "@/lib/comms/clinic-branding";
// Tool-call auth uses a static Bearer token (ElevenLabs tool webhooks don't
// send HMAC signatures — that's only for conversation event webhooks).
const TOOLS_SECRET = process.env.ELEVENLABS_WEBHOOK_SECRET ?? "";
import { withRequestLog } from "@/lib/request-logger";
import {
  proxyToEngine,
  ENGINE_TIMEOUT,
  normalizePhoneE164,
  bookingClaimKey,
  claimBooking,
  settleBooking,
  releaseBooking,
} from "@/lib/ava/engine-proxy";
import { computeFreeSlots } from "@/lib/ava/compute-free-slots";
import type { HoursConfig } from "@/lib/ava/compute-free-slots";
import { handleNoPmsToolCall } from "@/lib/ava/no-pms-handler";
import type { PMSIntegrationConfig } from "@/types/pms";

export const runtime = "nodejs";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ToolCallPayload {
  agent_id: string;
  conversation_id?: string;
  caller_phone?: string;
  tool_name: string;
  // ElevenLabs sends collected params under `parameters`; `tool_input` is kept
  // as a legacy alias in case an older agent version sends it instead.
  parameters?: Record<string, unknown>;
  tool_input?: Record<string, unknown>;
}

// ─── Tool Handlers ──────────────────────────────────────────────────────────

async function handleCheckAvailability(
  adapter: ReturnType<typeof createPMSAdapter>,
  input: Record<string, unknown>,
  clinicId: string,
  hoursConfig?: HoursConfig,
): Promise<string> {
  const db = getAdminDb();

  // Resolve clinician by name if provided
  let clinicianExternalId: string | undefined;
  const clinicianName = (input.clinician_name as string)?.trim();

  if (clinicianName) {
    const cliniciansSnap = await db
      .collection("clinics")
      .doc(clinicId)
      .collection("clinicians")
      .get();

    const match = cliniciansSnap.docs.find((d) => {
      const name = d.data().name?.toLowerCase() ?? "";
      return name.includes(clinicianName.toLowerCase());
    });

    if (match) {
      clinicianExternalId = match.data().pmsExternalId ?? match.id;
    }
  }

  // Build date range — default to next 7 days
  const preferredDay = input.preferred_day as string | undefined;
  let dateFrom: string;
  let dateTo: string;

  if (preferredDay) {
    const parsed = parseFutureDate(preferredDay);
    dateFrom = parsed.toISOString();
    dateTo = new Date(parsed.getTime() + 24 * 60 * 60 * 1000).toISOString();
  } else {
    const now = new Date();
    dateFrom = now.toISOString();
    dateTo = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  }

  let appointments: Awaited<ReturnType<typeof adapter.getAppointments>>;
  try {
    appointments = await adapter.getAppointments({
      clinicianExternalId,
      dateFrom,
      dateTo,
    });
  } catch (err) {
    console.error(`[ava/tools] check_availability PMS query failed for ${clinicId}:`, err instanceof Error ? err.message : String(err));
    const whoDesc = clinicianName ? ` with ${clinicianName}` : "";
    return `I'm having a bit of trouble accessing the diary right now. What day and time were you thinking${whoDesc}? I'll pass the details on and someone from the team will confirm the slot for you.`;
  }

  // WriteUpp has no free-slot endpoint — derive available slots from booked schedule
  const freeSlots = computeFreeSlots(appointments, new Date(dateFrom), new Date(dateTo), hoursConfig);
  const whoDesc = clinicianName ? ` with ${clinicianName}` : "";

  if (freeSlots.length === 0) {
    const rangeDesc = preferredDay ? `on ${preferredDay}` : "in the next week";
    return `I'm afraid we're fully booked ${rangeDesc}${whoDesc}. Would you like me to check another day?`;
  }

  const slotStrings = freeSlots.slice(0, 3).map((slot) => {
    const dayStr = slot.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
    const timeStr = slot.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true });
    return `${dayStr} at ${timeStr}`;
  });

  if (slotStrings.length === 1) {
    return `I have ${slotStrings[0]} available${whoDesc}. Does that work for you?`;
  }
  return `I have a few slots available${whoDesc}: ${slotStrings.join(", or ")}. Which works best?`;
}

async function handleBookAppointment(
  adapter: ReturnType<typeof createPMSAdapter>,
  input: Record<string, unknown>,
  clinicId: string,
  conversationId: string,
  callerPhone: string,
): Promise<string> {
  const db = getAdminDb();
  const clinicRef = db.collection("clinics").doc(clinicId);

  const firstName = ((input.patient_first_name as string) ?? "").trim();
  const lastName = ((input.patient_last_name as string) ?? "").trim();
  const phone = ((input.patient_phone as string) ?? callerPhone).trim();
  const email = (input.patient_email as string)?.trim() || null;
  const slotDatetime = (input.slot_datetime as string) ?? "";
  const clinicianName = (input.clinician_name as string)?.trim();
  const appointmentType = ((input.appointment_type as string) ?? "initial_assessment") as
    | "initial_assessment"
    | "follow_up";
  const bodyRegion = (input.body_region as string)?.trim() || null;
  const isRedFlagScreened =
    typeof input.is_red_flag_screened === "boolean" ? input.is_red_flag_screened : null;
  const insuranceType = (input.insurance_type as string)?.trim() || null;

  if (!firstName || !lastName) {
    return "I need your first and last name to book the appointment. Could you give me those?";
  }
  if (!phone) {
    return "I need a phone number for the booking. What's the best number to reach you on?";
  }
  if (!slotDatetime) {
    return "I need to know the date and time you'd like. When works for you?";
  }

  // Validate datetime
  const dt = new Date(slotDatetime);
  if (isNaN(dt.getTime())) {
    return "I didn't quite catch the date and time. Could you say it again — for example, Tuesday at 2pm?";
  }
  if (dt.getTime() < Date.now() - 5 * 60_000) {
    return "That time seems to be in the past. Could you give me a future date and time?";
  }

  // Determine duration
  const durationMinutes = 45;
  const endTime = new Date(dt.getTime() + durationMinutes * 60_000).toISOString();

  // Normalise phone to E.164 — shared with the engine path so both derive the
  // SAME booking claim key for one caller (a 0... and its +44... form collapse).
  const normalizedPhone = normalizePhoneE164(phone);

  // ── Parallel Firestore reads ──────────────────────────────────────────────
  // Clinician resolution and patient cache lookup are independent. Run them
  // concurrently to save one round-trip on the live-call critical path.
  const clinicianPromise: Promise<{ id: string; name: string }> = (async () => {
    if (clinicianName) {
      const snap = await clinicRef.collection("clinicians").get();
      const match = snap.docs.find((d) => {
        const name = d.data().name?.toLowerCase() ?? "";
        return name.includes(clinicianName.toLowerCase());
      });
      if (match) {
        return {
          id: match.data().pmsExternalId ?? match.id,
          name: match.data().name ?? clinicianName,
        };
      }
    }
    // Fallback: first active clinician
    const snap = await clinicRef
      .collection("clinicians")
      .where("active", "==", true)
      .limit(1)
      .get();
    if (!snap.empty) {
      const doc = snap.docs[0];
      return {
        id: doc.data().pmsExternalId ?? doc.id,
        name: doc.data().name ?? "one of our physios",
      };
    }
    return { id: "", name: "one of our physios" };
  })();

  const patientCachePromise = clinicRef
    .collection("patients")
    .where("contact.phone", "==", normalizedPhone)
    .limit(1)
    .get();

  const [clinicianResult, patientSnap] = await Promise.all([
    clinicianPromise,
    patientCachePromise,
  ]);

  const clinicianExternalId = clinicianResult.id;
  const resolvedClinicianName = clinicianResult.name;

  if (!clinicianExternalId) {
    return "I'm having trouble finding an available clinician. Let me take your details and have someone call you back to book.";
  }

  // ── Resolve patient external ID ──────────────────────────────────────────
  // Priority: Firestore cache → PMS phone search → PMS patient create
  let patientExternalId = "";
  let isReturningPatient = false;

  if (!patientSnap.empty) {
    patientExternalId = patientSnap.docs[0].data().pmsExternalId ?? patientSnap.docs[0].id;
    isReturningPatient = true;
  }

  // 2. If not in Firestore, search PMS directly by phone (handles existing PMS patients not yet synced)
  if (!patientExternalId && adapter.findPatientByPhone) {
    const foundId = await adapter.findPatientByPhone(normalizedPhone);
    if (foundId) {
      patientExternalId = foundId;
      isReturningPatient = true;
    }
  }

  // 3. Still not found — create patient in PMS (genuinely new patient)
  if (!patientExternalId) {
    if (adapter.createPatient) {
      try {
        const created = await adapter.createPatient({ firstName, lastName, phone: normalizedPhone, email: email ?? undefined });
        patientExternalId = created.externalId;
        isReturningPatient = false;
      } catch {
        patientExternalId = `ava_${normalizedPhone.replace(/\D/g, "")}`;
      }
    } else {
      patientExternalId = `ava_${normalizedPhone.replace(/\D/g, "")}`;
    }
  }

  // ── Booking idempotency claim ─────────────────────────────────────────────
  // Atomically claim this booking BEFORE the PMS write so a retried webhook (or
  // a slow engine that the TS path raced past) can't double-book. Key off the
  // normalised slot instant + caller so the engine and TS paths share one claim.
  // We claim here, after the patient/clinician resolution above, but before any
  // PMS or Firestore write — the write side is what we must not duplicate.
  const claimKey = bookingClaimKey({
    conversationId,
    slot: dt.toISOString(),
    callerPhone: normalizedPhone,
  });
  if (claimKey) {
    const claim = await claimBooking(db, clinicId, claimKey);
    if (!claim.claimed) {
      return (
        claim.priorResult ??
        "I've got that booking going through for you now — you'll receive a confirmation text shortly."
      );
    }
  }

  // ── Slot re-validation (TOCTOU guard) ──────────────────────────────────────
  // The slot offered at check_availability time may have been taken in the gap
  // by a DIFFERENT caller or a direct PMS booking. The idempotency claim only
  // dedups THIS caller, so re-query the diary for the clinician and confirm the
  // exact slot is still free before writing. One extra read on the critical path
  // is acceptable; on a read failure we proceed rather than block a genuine
  // caller. We pull a 7-day window so the same read also yields real alternatives.
  const revalWindowTo = new Date(dt.getTime() + 7 * 24 * 60 * 60 * 1000);
  let upcomingAppointments: { dateTime: string; endTime?: string }[] = [];
  try {
    upcomingAppointments = await adapter.getAppointments({
      clinicianExternalId,
      dateFrom: dt.toISOString(),
      dateTo: revalWindowTo.toISOString(),
    });
  } catch {
    upcomingAppointments = [];
  }
  if (slotOverlaps(upcomingAppointments, dt, new Date(endTime).getTime(), durationMinutes)) {
    // Slot gone — never write. Release the claim so a later attempt at a
    // DIFFERENT slot can proceed, and offer the next free slots if we have them.
    if (claimKey) {
      await releaseBooking(db, clinicId, claimKey);
    }
    const alternatives = computeFreeSlots(upcomingAppointments, dt, revalWindowTo)
      .filter((s) => s.getTime() !== dt.getTime())
      .slice(0, 2);
    if (alternatives.length > 0) {
      const altStrings = alternatives.map((slot) => {
        const dayStr = slot.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
        const timeStr = slot.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true });
        return `${dayStr} at ${timeStr}`;
      });
      return `I'm so sorry — that slot has just been taken. I do still have ${altStrings.join(", or ")}. Would either of those work?`;
    }
    return "I'm so sorry — that slot has just been taken. What other day or time would suit you? I'll get you booked straight in.";
  }

  // ── Step 1: the PMS write — the ONLY step we must never duplicate ───────────
  // Isolate createAppointment in its own try. A failure HERE means nothing was
  // booked: release the claim so a genuine retry can book, log, and return a
  // graceful script. Post-write bookkeeping (Step 2) must NOT share this catch,
  // or a booked appointment gets misreported as a failure AND the released claim
  // lets the ElevenLabs retry create a SECOND appointment.
  let pmsResult: Awaited<ReturnType<typeof adapter.createAppointment>>;
  try {
    pmsResult = await adapter.createAppointment({
      patientExternalId,
      clinicianExternalId,
      dateTime: dt.toISOString(),
      endTime,
      appointmentType,
      notes: "[Booked by Ava — AI receptionist]",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (claimKey) {
      await releaseBooking(db, clinicId, claimKey);
    }
    if (conversationId) {
      const now = new Date().toISOString();
      await db
        .collection("clinics")
        .doc(clinicId)
        .collection("call_log")
        .doc(conversationId)
        .set(
          {
            toolCalls: FieldValue.arrayUnion({
              tool: "book_appointment",
              input: { firstName, lastName, phone: normalizedPhone, slotDatetime },
              error: message,
              timestamp: now,
            }),
          },
          { merge: true },
        )
        .catch(() => {});
    }
    return "I'm having a bit of trouble with the booking system right now. Let me take your details and have someone from the team confirm your appointment within the hour.";
  }

  // ── Step 2: the booking is REAL and authoritative ───────────────────────────
  // Everything below is best-effort bookkeeping. It must never turn a successful
  // booking into a reported failure, and must never release the claim (a released
  // claim + a real booking = a double-book on the next retry).
  const now = new Date().toISOString();
  const firestoreDocId = pmsResult.externalId ?? db.collection("_").doc().id;

  const dateStr = dt.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const timeStr = dt.toLocaleTimeString("en-GB", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const opener = isReturningPatient
    ? "Welcome back — I've got you booked in"
    : "All sorted — I've set you up and booked you in";
  const confirmation = `${opener} for ${dateStr} at ${timeStr} with ${resolvedClinicianName}. That's a ${durationMinutes}-minute ${appointmentType === "initial_assessment" ? "initial assessment" : "follow-up"}. You'll receive a confirmation text shortly.`;

  try {
    // Mirror to Firestore
    await clinicRef.collection("appointments").doc(firestoreDocId).set(
      {
        patientId: patientExternalId,
        clinicianId: clinicianExternalId,
        dateTime: dt.toISOString(),
        endTime,
        status: "scheduled",
        appointmentType,
        isInitialAssessment: appointmentType === "initial_assessment",
        hepAssigned: false,
        revenueAmountPence: 0,
        followUpBooked: false,
        source: "strydeos_receptionist",
        pmsExternalId: pmsResult.externalId,
        pmsWriteStatus: "success",
        bookedBy: "ava",
        bodyRegion,
        isRedFlagScreened,
        insuranceType,
        callId: conversationId ?? null,
        patientFirstName: firstName,
        patientLastName: lastName,
        patientPhone: normalizedPhone,
        patientEmail: email,
        createdAt: now,
        updatedAt: now,
      },
      { merge: true },
    );

    // Ensure patient record exists
    const patientDocRef = clinicRef.collection("patients").doc(patientExternalId);
    const patientDoc = await patientDocRef.get();
    if (!patientDoc.exists) {
      await patientDocRef.set({
        pmsExternalId: patientExternalId,
        firstName,
        lastName,
        contact: { phone: normalizedPhone, email },
        source: "ava_booking",
        createdAt: now,
        updatedAt: now,
      });
    }

    // Log tool call — atomic append, no read-modify-write
    if (conversationId) {
      await db
        .collection("clinics")
        .doc(clinicId)
        .collection("call_log")
        .doc(conversationId)
        .set(
          {
            // Durable top-level marker for the post-call webhook
            // (/api/webhooks/elevenlabs). The real PMS appointment id is created
            // HERE on the live path; the webhook reads it straight off `existing`
            // to (a) emit appointmentExternalId on the Intelligence call_fact and
            // (b) lock the "booked" outcome so the LLM summary classifier can't
            // downgrade a genuine booking. The toolCalls array is an opaque audit
            // log; this field is the cheap, readable signal.
            bookingExternalId: pmsResult.externalId ?? firestoreDocId,
            toolCalls: FieldValue.arrayUnion({
              tool: "book_appointment",
              input: { firstName, lastName, phone: normalizedPhone, slotDatetime, clinicianName },
              output: { pmsExternalId: pmsResult.externalId, firestoreDocId },
              timestamp: now,
            }),
          },
          { merge: true },
        );
    }
  } catch (err) {
    // The appointment IS booked — never report failure here. Log and carry on.
    console.error(
      `[ava/tools] booking succeeded (PMS ${pmsResult.externalId ?? firestoreDocId}) but post-write bookkeeping failed for ${clinicId}:`,
      err instanceof Error ? err.message : String(err),
    );
  }

  // Settle the idempotency claim with the confirmation so a duplicate retry
  // replays this exact line instead of booking a second appointment. Best-effort:
  // even if this throws, the claim doc already exists, so the retry still cannot
  // double-book — it just won't get the polished replay line.
  if (claimKey) {
    try {
      await settleBooking(db, clinicId, claimKey, confirmation, {
        bookingId: pmsResult.externalId ?? firestoreDocId,
        path: "ts",
      });
    } catch (err) {
      console.error(
        `[ava/tools] booking succeeded but settling the idempotency claim failed for ${clinicId}:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }
  return confirmation;
}

async function handleUpdateBooking(
  adapter: ReturnType<typeof createPMSAdapter>,
  input: Record<string, unknown>,
  clinicId: string,
  conversationId: string,
  callerPhone: string,
  hoursConfig?: HoursConfig,
): Promise<string> {
  const action = (input.action as string)?.toLowerCase();
  const bookingId = (input.booking_id as string)?.trim();

  if (!bookingId) {
    return "I need the booking reference to make changes. Do you have your appointment reference number, or shall I look it up by your name?";
  }

  if (action === "cancel") {
    try {
      await adapter.updateAppointmentStatus(bookingId, "cancelled");
      const cancelledAt = new Date().toISOString();
      try {
        const db = getAdminDb();
        await db.collection("clinics").doc(clinicId).collection("appointments").doc(bookingId).update({
          status: "cancelled",
          updatedAt: cancelledAt,
        });
      } catch { /* best-effort Firestore mirror */ }
      // Durable cancel marker for the post-call webhook. A happy-path cancel
      // leaves graphAction="continue" → the webhook would otherwise classify the
      // call "resolved" and Pulse never chases the freed slot. This marker lets
      // the webhook lift the outcome to "follow_up_required". Best-effort merge —
      // a marker failure must not turn a real cancel into a reported failure.
      if (conversationId) {
        try {
          await getAdminDb()
            .collection("clinics").doc(clinicId).collection("call_log").doc(conversationId)
            .set({ cancelledAt, cancellationExternalId: bookingId }, { merge: true });
        } catch { /* best-effort marker */ }
      }
      return "That appointment has been cancelled. Would you like to rebook for another time?";
    } catch {
      return "I'm having trouble cancelling that booking right now. Let me take a note and have someone sort it out for you today.";
    }
  }

  if (action === "reschedule") {
    const newDatetime = input.new_datetime as string | undefined;
    const db = getAdminDb();

    // ── Phase 1: No new time yet — look up the clinician and offer real slots ──
    if (!newDatetime) {
      let clinicianExternalId: string | undefined;
      let clinicianName: string | undefined;

      try {
        const apptSnap = await db
          .collection("clinics")
          .doc(clinicId)
          .collection("appointments")
          .doc(bookingId)
          .get();

        if (apptSnap.exists) {
          const data = apptSnap.data()!;
          clinicianExternalId = data.clinicianId as string | undefined;

          if (clinicianExternalId) {
            const cSnap = await db.collection("clinics").doc(clinicId).collection("clinicians").get();
            const match = cSnap.docs.find(
              (d) => (d.data().pmsExternalId ?? d.id) === clinicianExternalId,
            );
            if (match) clinicianName = match.data().name as string | undefined;
          }
        }
      } catch { /* proceed with generic slots if appointment lookup fails */ }

      const now = new Date();
      const dateFrom = now.toISOString();
      const dateTo = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const whoDesc = clinicianName ? ` with ${clinicianName}` : "";

      let freeSlots: Date[] = [];
      try {
        const appointments = await adapter.getAppointments({ clinicianExternalId, dateFrom, dateTo });
        freeSlots = computeFreeSlots(appointments, new Date(dateFrom), new Date(dateTo), hoursConfig);
      } catch {
        return `I'm having a bit of trouble checking the diary right now. What day were you thinking${whoDesc}? I'll pass it on and someone will confirm your new slot.`;
      }

      if (freeSlots.length === 0) {
        return `We don't have any free slots in the next week${whoDesc}. Would you like me to check further ahead?`;
      }

      const slotStrings = freeSlots.slice(0, 3).map((slot) => {
        const dayStr = slot.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
        const timeStr = slot.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true });
        return `${dayStr} at ${timeStr}`;
      });

      if (slotStrings.length === 1) {
        return `I can see ${slotStrings[0]} is available${whoDesc}. Shall I move your appointment to that slot?`;
      }
      return `I can see a few openings${whoDesc}: ${slotStrings.join(", or ")}. Which works best for you?`;
    }

    // ── Phase 2: Patient has picked a time — cancel old, book new ──
    const dt = new Date(newDatetime);
    if (isNaN(dt.getTime())) {
      return "I didn't quite catch the new date and time. Could you say it again — for example, Tuesday at 2pm?";
    }
    if (dt.getTime() < Date.now() - 5 * 60_000) {
      return "That time seems to be in the past. Could you give me a future date and time?";
    }

    let clinicianExternalId = "";
    let clinicianName = "one of our physios";
    let patientExternalId = "";
    let appointmentType: "initial_assessment" | "follow_up" = "follow_up";

    try {
      const apptSnap = await db
        .collection("clinics")
        .doc(clinicId)
        .collection("appointments")
        .doc(bookingId)
        .get();

      if (apptSnap.exists) {
        const data = apptSnap.data()!;
        clinicianExternalId = (data.clinicianId as string) ?? "";
        patientExternalId = (data.patientId as string) ?? "";
        appointmentType = (data.appointmentType as "initial_assessment" | "follow_up") ?? "follow_up";

        if (clinicianExternalId) {
          const cSnap = await db.collection("clinics").doc(clinicId).collection("clinicians").get();
          const match = cSnap.docs.find((d) => (d.data().pmsExternalId ?? d.id) === clinicianExternalId);
          if (match) clinicianName = (match.data().name as string) ?? clinicianName;
        }
      }
    } catch { /* proceed — PMS rebook may still work if we have enough data */ }

    if (!clinicianExternalId || !patientExternalId) {
      return "I'm having trouble finding the full appointment details. Let me take a note and have someone rebook this for you within the hour.";
    }

    const durationMinutes = 45;
    const endTime = new Date(dt.getTime() + durationMinutes * 60_000).toISOString();

    // ── Reschedule idempotency claim ──────────────────────────────────────────
    // Mirror the book path: atomically claim BEFORE the PMS write so a retried
    // webhook can't create a SECOND appointment on the new slot (the old one is
    // already cancelled by the first attempt, so a retry could not even undo it).
    // Key on the NEW slot + the appointment being moved (bookingId folded into the
    // conversation portion) so two different reschedules in one call don't collide,
    // and so the engine and TS paths derive the SAME key for one move. The caller
    // matches the engine path's `patient_phone ?? caller_phone` so the keys agree.
    const normalizedCaller = normalizePhoneE164((input.patient_phone as string) ?? callerPhone ?? "");
    const rescheduleClaimKey = bookingClaimKey({
      conversationId: `${conversationId}:${bookingId}`,
      slot: dt.toISOString(),
      callerPhone: normalizedCaller,
    });
    if (rescheduleClaimKey) {
      const claim = await claimBooking(db, clinicId, rescheduleClaimKey);
      if (!claim.claimed) {
        return (
          claim.priorResult ??
          "I've got that change going through for you now — you'll receive a confirmation text shortly."
        );
      }
    }

    // ── Slot re-validation (TOCTOU guard) ────────────────────────────────────
    // Re-check the target slot is still free before creating the replacement, so
    // a slot taken since we offered it is not double-booked. On a read failure
    // proceed (the saga still creates-before-cancel, the safer side). If taken,
    // do NOT create and leave the existing appointment exactly as it is.
    let rescheduleConflicts: { dateTime: string; endTime?: string }[] = [];
    try {
      rescheduleConflicts = await adapter.getAppointments({
        clinicianExternalId,
        dateFrom: dt.toISOString(),
        dateTo: new Date(dt.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      });
    } catch {
      rescheduleConflicts = [];
    }
    if (slotOverlaps(rescheduleConflicts, dt, new Date(endTime).getTime(), durationMinutes)) {
      // Slot gone — never write. Release the claim so a later attempt at a
      // DIFFERENT slot can proceed, and leave the original appointment intact.
      if (rescheduleClaimKey) {
        await releaseBooking(db, clinicId, rescheduleClaimKey);
      }
      return "I'm so sorry — that slot has just been taken, so I've left your current appointment as it is. What other day or time would suit you?";
    }

    // ── Saga: book the NEW slot BEFORE cancelling the OLD one ──────────────────
    // Cancelling first then failing to create leaves the patient with NO
    // appointment and no rollback. Creating first means a create failure leaves
    // the original booking untouched, and a cancel failure after the create
    // leaves a (clearable) duplicate rather than nothing — always the safer side.
    let pmsResult: Awaited<ReturnType<typeof adapter.createAppointment>>;
    try {
      pmsResult = await adapter.createAppointment({
        patientExternalId,
        clinicianExternalId,
        dateTime: dt.toISOString(),
        endTime,
        appointmentType,
        notes: "[Rescheduled by Ava — AI receptionist]",
      });
    } catch {
      // New slot could not be created — the original appointment is intact.
      // Release the claim so a genuine retry can rebook rather than be blocked.
      if (rescheduleClaimKey) {
        await releaseBooking(db, clinicId, rescheduleClaimKey);
      }
      return "I'm having a bit of trouble rescheduling right now. Let me take a note and have someone sort this for you within the hour.";
    }

    const now = new Date().toISOString();
    const newDocId = pmsResult.externalId ?? db.collection("_").doc().id;

    // ── Step 2: the reschedule is REAL and authoritative ────────────────────────
    // Once createAppointment has succeeded the move is committed. Everything below
    // is best-effort bookkeeping and must NEVER turn a successful reschedule into a
    // reported failure, skip the old-slot cancel, or skip the claim settle (a
    // 'pending' claim + a real new appointment = a double-book on retry). Mirror
    // handleBookAppointment's Step 2: wrap the new-appointment Firestore mirror and
    // the durable booking marker in a best-effort try/catch (log, do NOT rethrow),
    // then ALWAYS attempt the old-slot cancel and the settle below.
    try {
      // New appointment is secured — mirror it to Firestore so the record exists
      // regardless of how the old-slot cancel below resolves.
      await db
        .collection("clinics").doc(clinicId).collection("appointments").doc(newDocId)
        .set({
          patientId: patientExternalId,
          clinicianId: clinicianExternalId,
          dateTime: dt.toISOString(),
          endTime,
          status: "scheduled",
          appointmentType,
          isInitialAssessment: appointmentType === "initial_assessment",
          hepAssigned: false,
          revenueAmountPence: 0,
          followUpBooked: false,
          source: "strydeos_receptionist",
          pmsExternalId: pmsResult.externalId,
          pmsWriteStatus: "success",
          bookedBy: "ava",
          rescheduledFromId: bookingId,
          createdAt: now,
          updatedAt: now,
        });

      // Durable booking marker for the post-call webhook — same field the book path
      // writes. A reschedule produces a real new appointment, so the webhook must
      // lock "booked" (not follow_up via the cancel marker) and surface the new PMS
      // id on the Intelligence call_fact.
      if (conversationId) {
        await db
          .collection("clinics").doc(clinicId).collection("call_log").doc(conversationId)
          .set({ bookingExternalId: pmsResult.externalId ?? newDocId }, { merge: true });
      }
    } catch (err) {
      // The new appointment IS created — never report failure here. Log and carry
      // on to the old-slot cancel and the claim settle below.
      console.error(
        `[ava/tools] reschedule: new appt ${newDocId} created but post-write bookkeeping failed for ${clinicId}:`,
        err instanceof Error ? err.message : String(err),
      );
    }

    // Release the OLD slot. If this throws the patient still HAS the new
    // appointment, so log best-effort and still confirm rather than reporting a
    // failure that already half-succeeded.
    try {
      await adapter.updateAppointmentStatus(bookingId, "cancelled");
      await db
        .collection("clinics").doc(clinicId).collection("appointments").doc(bookingId)
        .update({ status: "cancelled", updatedAt: now });
    } catch (err) {
      console.error(
        `[ava/tools] reschedule: new appt ${newDocId} created but cancelling old ${bookingId} failed for ${clinicId}:`,
        err instanceof Error ? err.message : String(err),
      );
    }

    const dateStr = dt.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
    const timeStr = dt.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true });
    const confirmation = `Done — I've moved your appointment to ${dateStr} at ${timeStr} with ${clinicianName}. You'll receive a confirmation text shortly.`;

    // Settle the claim with the confirmation so a duplicate retry replays this
    // exact line instead of rescheduling again. Best-effort: the claim doc already
    // exists, so even a settle failure still blocks a double-book.
    if (rescheduleClaimKey) {
      try {
        await settleBooking(db, clinicId, rescheduleClaimKey, confirmation, {
          bookingId: pmsResult.externalId ?? newDocId,
          path: "ts",
        });
      } catch (err) {
        console.error(
          `[ava/tools] reschedule succeeded but settling the idempotency claim failed for ${clinicId}:`,
          err instanceof Error ? err.message : String(err),
        );
      }
    }

    return confirmation;
  }

  return "Would you like to cancel or reschedule the appointment?";
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Re-validate a target slot against the live diary immediately before a write.
 * Returns true when an existing appointment overlaps [dt, slotEndMs) for the
 * clinician — i.e. the slot was taken in the gap since check_availability
 * offered it. Falls back to a 45-minute block when an appointment has no
 * endTime. Unparseable rows are ignored rather than treated as a conflict.
 */
function slotOverlaps(
  appointments: { dateTime: string; endTime?: string }[],
  dt: Date,
  slotEndMs: number,
  durationMinutes: number,
): boolean {
  const startMs = dt.getTime();
  return appointments.some((a) => {
    const aStart = new Date(a.dateTime).getTime();
    if (isNaN(aStart)) return false;
    const aEnd = a.endTime ? new Date(a.endTime).getTime() : aStart + durationMinutes * 60_000;
    return startMs < aEnd && aStart < slotEndMs;
  });
}

/**
 * Parse a natural-language day reference into a future Date.
 * Handles: "Monday", "next Tuesday", "tomorrow", "2026-04-15", etc.
 */
function parseFutureDate(input: string): Date {
  const lower = input.toLowerCase().trim();
  const now = new Date();

  if (lower === "today") return now;
  if (lower === "tomorrow") return new Date(now.getTime() + 24 * 60 * 60 * 1000);

  // Try ISO date first
  const iso = new Date(input);
  if (!isNaN(iso.getTime())) return iso;

  // Day name matching
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const cleanDay = lower.replace("next ", "");
  const dayIndex = days.indexOf(cleanDay);

  if (dayIndex >= 0) {
    const currentDay = now.getDay();
    let daysUntil = dayIndex - currentDay;
    if (daysUntil <= 0) daysUntil += 7;
    if (lower.startsWith("next ")) daysUntil += 7;
    return new Date(now.getTime() + daysUntil * 24 * 60 * 60 * 1000);
  }

  // Fallback: next business day
  return new Date(now.getTime() + 24 * 60 * 60 * 1000);
}

/**
 * Twilio status-callback URL for a clinic. `/api/webhooks/twilio` scopes the
 * comms_log lookup by clinicId and matches the row by twilioSid.
 */
function avaStatusCallbackUrl(clinicId: string): string {
  const base = (
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://portal.strydeos.com"
  ).replace(/\/$/, "");
  return `${base}/api/webhooks/twilio?clinicId=${encodeURIComponent(clinicId)}`;
}

/**
 * Write a comms_log row for an Ava SMS send, scoped under the clinic exactly as
 * /api/comms/send does — `pending` on a successful enqueue (with twilioSid),
 * `send_failed` on a throw. Best-effort: a log-write failure must not change the
 * caller-facing outcome.
 */
async function writeAvaSmsLog(
  db: ReturnType<typeof getAdminDb>,
  clinicId: string,
  entry: { to: string; outcome: "pending" | "send_failed"; kind: string; twilioSid?: string; error?: string },
): Promise<void> {
  const ts = new Date().toISOString();
  await db
    .collection("clinics").doc(clinicId).collection("comms_log")
    .add({
      clinicId,
      channel: "sms",
      to: entry.to,
      outcome: entry.outcome,
      source: entry.kind,
      sentAt: ts,
      createdAt: ts,
      ...(entry.twilioSid ? { twilioSid: entry.twilioSid } : {}),
      ...(entry.error ? { error: entry.error } : {}),
    })
    .catch(() => {});
}

/**
 * Ava mid-call action: generate a secure insurance-intake link and text it to
 * the patient so they can confirm insurance + pre-authorisation before their
 * appointment. Reuses the same link + delivery path as the staff failsafe, so
 * the voice and form journeys share one pipeline.
 */
async function handleSendInsuranceLink(
  toolInput: Record<string, unknown>,
  clinicId: string,
  callerPhone: string,
): Promise<string> {
  const patientRef =
    ((toolInput.patient_external_id as string) ?? "").trim() ||
    ((toolInput.patient_phone as string) ?? callerPhone ?? "").trim() ||
    "ava-caller";
  const rawPhone = (((toolInput.patient_phone as string) ?? callerPhone) ?? "").replace(/[^\d+]/g, "");
  const smsTo = rawPhone.startsWith("+")
    ? rawPhone
    : rawPhone.startsWith("0")
      ? `+44${rawPhone.slice(1)}`
      : rawPhone
        ? `+${rawPhone}`
        : "";
  if (!smsTo) {
    return "I can send you a secure link to confirm your insurance, but I don't have a mobile number for you. What's the best number to text?";
  }
  const db = getAdminDb();
  // Track the just-minted link so a failed text can roll it back. The 24h
  // cooldown keys on the link's createdAt regardless of status, so a lingering
  // link from a failed send would lock the patient out of Ava re-offers AND the
  // 09:00 insurance cron for 24h. createdLink is only set once the link exists.
  let createdLink: IntakeLinkResult | null = null;
  try {
    const supp = await checkIntakeSuppression(db, clinicId, patientRef, Date.now());
    if (supp.suppress) {
      return supp.reason === "already_submitted"
        ? "It looks like you've already completed your insurance form recently, so you're all set - no need to do it again."
        : "I've already sent you a secure link very recently - please check your texts. I won't send another just yet so your phone doesn't get cluttered.";
    }
    const branding = await getClinicBranding(db, clinicId);
    createdLink = await createIntakeLink(db, clinicId, {
      patientRef,
      insurerOptions: [],
      createdBy: "ava",
      nowMs: Date.now(),
    });
    const msg = await getTwilio().messages.create({
      from: branding.smsSender,
      to: smsTo,
      body: buildInsuranceIntakeSms({ link: createdLink.shortUrl, clinicName: branding.clinicName }),
      statusCallback: avaStatusCallbackUrl(clinicId),
    });
    await writeAvaSmsLog(db, clinicId, {
      to: smsTo,
      outcome: "pending",
      kind: "ava_insurance_link",
      twilioSid: msg.sid,
    });
    return "Perfect, I've just texted you a secure link to confirm your insurance details before your appointment. It only takes a minute.";
  } catch (err) {
    console.error("[ava/tools] send_insurance_intake_link failed:", err instanceof Error ? err.message : String(err));
    // Surface to monitoring, matching the notify-callback senders — a clinical
    // pre-auth SMS failure must not die as a passive console line while the
    // caller is told "the team will follow up".
    Sentry.captureException(err);
    // Roll the link back so the cooldown does not suppress a genuine retry, then
    // record the failed send. Best-effort: the apology must still reach the caller.
    if (createdLink) {
      await db
        .collection("clinics").doc(clinicId).collection("insurance_intake_links")
        .doc(createdLink.linkId)
        .delete()
        .catch(() => {});
    }
    await writeAvaSmsLog(db, clinicId, {
      to: smsTo,
      outcome: "send_failed",
      kind: "ava_insurance_link",
      error: err instanceof Error ? err.message : String(err),
    });
    return "I tried to text you the insurance link but something went wrong on our side. The team will follow up.";
  }
}

// ─── Main Handler ───────────────────────────────────────────────────────────

async function handler(req: NextRequest) {
  try {
    const rawBody = await req.text();

    // Verify Bearer token — ElevenLabs sends this as Authorization header on tool calls
    if (!TOOLS_SECRET) {
      return NextResponse.json({ error: "Tools secret not configured" }, { status: 500 });
    }
    // Constant-time Bearer comparison (matches the timingSafeEqual pattern used
    // by every other secret-checked webhook — writeupp, resend, n8n, etc.).
    const authHeader = req.headers.get("authorization");
    const presented = authHeader?.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : "";
    const presentedBuf = Buffer.from(presented);
    const expectedBuf = Buffer.from(TOOLS_SECRET);
    if (
      presentedBuf.length !== expectedBuf.length ||
      !crypto.timingSafeEqual(presentedBuf, expectedBuf)
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: ToolCallPayload = JSON.parse(rawBody);
    const { agent_id, conversation_id, caller_phone, tool_name } = body;
    // ElevenLabs sends collected parameters under `parameters`; fall back to
    // the legacy `tool_input` field in case of older agent versions.
    const toolInput = (body.parameters ?? body.tool_input ?? {}) as Record<string, unknown>;

    if (!agent_id) {
      return NextResponse.json({ error: "Missing agent_id" }, { status: 400 });
    }

    // Resolve clinic from agent_id
    const db = getAdminDb();
    const clinicSnap = await db
      .collection("clinics")
      .where("ava.agent_id", "==", agent_id)
      .limit(1)
      .get();

    if (clinicSnap.empty) {
      return NextResponse.json(
        { response: "I'm having trouble accessing the system right now. Let me take your details and have someone call you back." },
        { status: 200 },
      );
    }

    const clinicId = clinicSnap.docs[0].id;
    const clinicData = clinicSnap.docs[0].data();

    // Load PMS config
    const configSnap = await db
      .collection("clinics")
      .doc(clinicId)
      .collection("integrations_config")
      .doc("pms")
      .get();
    const pmsConfig = configSnap.data() as PMSIntegrationConfig | undefined;

    if (!pmsConfig?.apiKey?.trim()) {
      const response = await handleNoPmsToolCall(
        clinicId,
        clinicData?.email as string | undefined,
        tool_name,
        toolInput,
        conversation_id ?? "",
        caller_phone ?? "",
      );
      return NextResponse.json({ response }, { status: 200 });
    }

    // ── Python engine proxy ──────────────────────────────────────────────────
    // If AVA_ENGINE_URL is configured, forward the tool call to the Python
    // service for richer booking negotiation. Fall back to TS adapters on any
    // failure (timeout, engine down, validation error).
    const engineUrl = process.env.AVA_ENGINE_URL;
    if (engineUrl) {
      // Booking idempotency for the engine path. A retried webhook, or a slow
      // engine that the TS path already raced past, must not create a second
      // appointment. Claim the same key the TS-fallback path uses BEFORE the
      // engine writes; if the claim is already taken, replay the prior result.
      const isBooking = tool_name === "book_appointment";
      // A reschedule also creates a NEW appointment, so it needs the same claim
      // (a retried update_booking would otherwise double-book the new slot). A
      // cancel is idempotent and needs no claim.
      const isReschedule =
        tool_name === "update_booking" &&
        (toolInput.action as string)?.toLowerCase() === "reschedule";
      const claimKey = isBooking
        ? bookingClaimKey({
            conversationId: conversation_id ?? "",
            slot: (toolInput.slot_datetime as string) ?? "",
            // Normalise with the SAME helper the TS path uses, so a national
            // 0... number and its +44... form share one claim key across paths.
            callerPhone: normalizePhoneE164(
              (toolInput.patient_phone as string) ?? caller_phone ?? "",
            ),
          })
        : isReschedule
          ? bookingClaimKey({
              // Key on the NEW datetime + the appointment being moved, matching
              // the TS handleUpdateBooking key exactly so engine and TS dedup as one.
              conversationId: `${conversation_id ?? ""}:${(toolInput.booking_id as string) ?? ""}`,
              slot: (toolInput.new_datetime as string) ?? "",
              callerPhone: normalizePhoneE164(
                (toolInput.patient_phone as string) ?? caller_phone ?? "",
              ),
            })
          : null;

      let claimedHere = false;
      if (claimKey) {
        const claim = await claimBooking(db, clinicId, claimKey);
        if (!claim.claimed) {
          // Duplicate booking attempt — return the prior confirmation rather
          // than booking again. If the first attempt is still in flight
          // (priorResult null), give a safe holding line; do NOT write.
          return NextResponse.json(
            {
              response:
                claim.priorResult ??
                "I've got that booking going through for you now — you'll receive a confirmation text shortly.",
            },
            { status: 200 },
          );
        }
        claimedHere = true;
      }

      const engineResult = await proxyToEngine(engineUrl, {
        tool_name,
        tool_input: toolInput,
        clinic_id: clinicId,
        pms_type: pmsConfig.provider,
        api_key: pmsConfig.apiKey,
        base_url: pmsConfig.baseUrl ?? "",
      });

      if (engineResult === ENGINE_TIMEOUT) {
        // UNCERTAIN — the abort timer fired but the engine MAY already have
        // committed the write. For a booking OR reschedule we claimed, do NOT
        // release the claim and do NOT fall through to a TS create: a
        // guaranteed-safe holding line beats a guaranteed double-book. Leave the
        // claim pending so a genuine retry still dedups, and tell the caller it's
        // in progress. A non-claimed tool (cancel / availability) is safe to retry
        // on TS below.
        if (claimedHere) {
          return NextResponse.json(
            {
              response:
                "I've got that change going through for you now — you'll receive a confirmation text shortly.",
            },
            { status: 200 },
          );
        }
        // Non-claimed timeout → fall through to the TS handler below.
      } else if (engineResult !== null) {
        if (claimedHere && claimKey) {
          // Best-effort, mirroring the TS paths' guarded settle: a settle throw
          // must NEVER turn a committed engine booking/reschedule into a reported
          // failure or skip the durable marker below. The claim stays "pending"
          // (no double-book on retry; the cleanup cron reclaims it).
          try {
            await settleBooking(db, clinicId, claimKey, engineResult.result, {
              bookingId: engineResult.booking_id ?? null,
              path: "engine",
            });
          } catch (err) {
            console.error(
              `[ava/tools] engine booking committed but settling the claim failed for ${clinicId}:`,
              err instanceof Error ? err.message : String(err),
            );
          }
        }
        // Durable booking marker for the post-call webhook — mirror the TS path
        // (handleBookAppointment) on the PRODUCTION engine path. ALWAYS write it
        // on a successful engine booking OR reschedule, with a stable fallback when
        // booking_id is empty/absent (cliniko.py coalesces a missing id to ""). A
        // reschedule routed through the engine creates a NEW appointment (its claim
        // is even settled), so without this marker the webhook could neither lock
        // the "booked" outcome nor emit appointmentExternalId on the Intelligence
        // call_fact for engine reschedules.
        if ((isBooking || isReschedule) && conversation_id) {
          await db
            .collection("clinics")
            .doc(clinicId)
            .collection("call_log")
            .doc(conversation_id)
            .set(
              { bookingExternalId: engineResult.booking_id || `engine_${conversation_id}` },
              { merge: true },
            )
            .catch((err) => {
              console.error(
                `[ava/tools] engine booking marker write failed for ${clinicId}:`,
                err instanceof Error ? err.message : String(err),
              );
            });
        }
        return NextResponse.json({ response: engineResult.result }, { status: 200 });
      } else {
        // null — HARD failure: the engine definitely did not act. Release our
        // claim so the TS fallback below can re-claim and book; otherwise the
        // dead claim would block the only path that can still serve this caller.
        if (claimedHere && claimKey) {
          await releaseBooking(db, clinicId, claimKey);
        }
      }
      // ENGINE_TIMEOUT (non-booking) or null → fall through to TS handlers below.
    }

    const adapter = createPMSAdapter(pmsConfig);

    // Dispatch by tool name
    let result: string;

    switch (tool_name) {
      case "check_availability":
        result = await handleCheckAvailability(
          adapter,
          toolInput,
          clinicId,
          (clinicData?.ava as Record<string, unknown>)?.hours as HoursConfig | undefined,
        );
        break;
      case "book_appointment":
        result = await handleBookAppointment(
          adapter,
          toolInput,
          clinicId,
          conversation_id ?? "",
          caller_phone ?? "",
        );
        break;
      case "update_booking":
        result = await handleUpdateBooking(
          adapter,
          toolInput,
          clinicId,
          conversation_id ?? "",
          caller_phone ?? "",
          (clinicData?.ava as Record<string, unknown>)?.hours as HoursConfig | undefined,
        );
        break;
      case "send_insurance_intake_link":
        result = await handleSendInsuranceLink(toolInput, clinicId, caller_phone ?? "");
        break;
      default:
        result = "I'm not sure how to help with that. Can I take a message and have someone call you back?";
    }

    return NextResponse.json({ response: result }, { status: 200 });
  } catch (_error) {
    console.error("[ava/tools] Unhandled error:", _error instanceof Error ? _error.message : String(_error));
    return NextResponse.json(
      { response: "I'm having a bit of trouble right now. Let me take your details and someone will call you back shortly." },
      { status: 200 },
    );
  }
}

export const POST = withRequestLog(handler);
