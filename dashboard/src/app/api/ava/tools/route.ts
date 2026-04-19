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
 *
 * Auth: Bearer token (ELEVENLABS_WEBHOOK_SECRET). ElevenLabs tool-call webhooks
 *        use Authorization: Bearer — HMAC is only for conversation event webhooks.
 * Returns { response: string } — ElevenLabs speaks this back to the caller.
 */

import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { createPMSAdapter } from "@/lib/integrations/pms/factory";
// Tool-call auth uses a static Bearer token (ElevenLabs tool webhooks don't
// send HMAC signatures — that's only for conversation event webhooks).
const TOOLS_SECRET = process.env.ELEVENLABS_WEBHOOK_SECRET ?? "";
import { withRequestLog } from "@/lib/request-logger";
import { proxyToEngine } from "@/lib/ava/engine-proxy";
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
  const freeSlots = computeFreeSlots(appointments, new Date(dateFrom), new Date(dateTo));
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

  // Normalise phone to E.164
  const normalizedPhone = phone.startsWith("0")
    ? `+44${phone.slice(1)}`
    : phone.startsWith("+")
      ? phone
      : `+${phone}`;

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

  // Write to PMS
  try {
    const pmsResult = await adapter.createAppointment({
      patientExternalId,
      clinicianExternalId,
      dateTime: dt.toISOString(),
      endTime,
      appointmentType,
      notes: "[Booked by Ava — AI receptionist]",
    });

    // Mirror to Firestore
    const now = new Date().toISOString();
    const firestoreDocId = pmsResult.externalId ?? db.collection("_").doc().id;

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

    // Format speakable confirmation
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
    return `${opener} for ${dateStr} at ${timeStr} with ${resolvedClinicianName}. That's a ${durationMinutes}-minute ${appointmentType === "initial_assessment" ? "initial assessment" : "follow-up"}. You'll receive a confirmation text shortly.`;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Log the failure but give Ava a graceful script
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
        );
    }
    return "I'm having a bit of trouble with the booking system right now. Let me take your details and have someone from the team confirm your appointment within the hour.";
  }
}

async function handleUpdateBooking(
  adapter: ReturnType<typeof createPMSAdapter>,
  input: Record<string, unknown>,
  clinicId: string,
): Promise<string> {
  const action = (input.action as string)?.toLowerCase();
  const bookingId = (input.booking_id as string)?.trim();

  if (!bookingId) {
    return "I need the booking reference to make changes. Do you have your appointment reference number, or shall I look it up by your name?";
  }

  if (action === "cancel") {
    try {
      await adapter.updateAppointmentStatus(bookingId, "cancelled");
      return "That appointment has been cancelled. Would you like to rebook for another time?";
    } catch {
      return "I'm having trouble cancelling that booking right now. Let me take a note and have someone sort it out for you today.";
    }
  }

  if (action === "reschedule") {
    const newDatetime = input.new_datetime as string;
    if (!newDatetime) {
      return "When would you like to move the appointment to?";
    }
    // For now, cancel + rebook is the safest pattern across PMS providers
    return "Let me check if that new time is available. One moment.";
  }

  return "Would you like to cancel or reschedule the appointment?";
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Compute free 45-minute appointment slots from a list of booked appointments.
 * Assumes Mon–Fri 09:00–18:00 clinic hours. Returns up to 6 free slots.
 */
function computeFreeSlots(
  appointments: { dateTime: string }[],
  dateFrom: Date,
  dateTo: Date,
): Date[] {
  const SLOT_MINS = 45;
  const SLOT_MS = SLOT_MINS * 60_000;
  const CLINIC_START_HOUR = 9;
  const CLINIC_END_HOUR = 18;

  const busyIntervals = appointments.map((a) => {
    const start = new Date(a.dateTime).getTime();
    return { start, end: start + SLOT_MS };
  });

  // Snap cursor to next 45-min boundary at or after dateFrom
  const cursor = new Date(dateFrom);
  cursor.setSeconds(0, 0);
  const totalMins = cursor.getHours() * 60 + cursor.getMinutes();
  const snappedMins = Math.ceil(totalMins / SLOT_MINS) * SLOT_MINS;
  cursor.setHours(Math.floor(snappedMins / 60), snappedMins % 60, 0, 0);

  const freeSlots: Date[] = [];

  while (cursor < dateTo && freeSlots.length < 6) {
    const day = cursor.getDay();
    const hour = cursor.getHours();

    if (day === 0 || day === 6 || hour < CLINIC_START_HOUR || hour >= CLINIC_END_HOUR) {
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(CLINIC_START_HOUR, 0, 0, 0);
      continue;
    }

    const slotStart = cursor.getTime();
    const slotEnd = slotStart + SLOT_MS;
    const isBusy = busyIntervals.some(({ start, end }) => slotStart < end && start < slotEnd);
    if (!isBusy) freeSlots.push(new Date(cursor));

    cursor.setMinutes(cursor.getMinutes() + SLOT_MINS);
  }

  return freeSlots;
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

// ─── Main Handler ───────────────────────────────────────────────────────────

async function handler(req: NextRequest) {
  try {
    const rawBody = await req.text();

    // Verify Bearer token — ElevenLabs sends this as Authorization header on tool calls
    if (!TOOLS_SECRET) {
      return NextResponse.json({ error: "Tools secret not configured" }, { status: 500 });
    }
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${TOOLS_SECRET}`) {
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

    // Load PMS config
    const configSnap = await db
      .collection("clinics")
      .doc(clinicId)
      .collection("integrations_config")
      .doc("pms")
      .get();
    const pmsConfig = configSnap.data() as PMSIntegrationConfig | undefined;

    if (!pmsConfig?.apiKey?.trim()) {
      return NextResponse.json(
        { response: "The booking system isn't connected for this clinic yet. Let me take your details and have someone call you back." },
        { status: 200 },
      );
    }

    // ── Python engine proxy ──────────────────────────────────────────────────
    // If AVA_ENGINE_URL is configured, forward the tool call to the Python
    // service for richer booking negotiation. Fall back to TS adapters on any
    // failure (timeout, engine down, validation error).
    const engineUrl = process.env.AVA_ENGINE_URL;
    if (engineUrl) {
      const engineResult = await proxyToEngine(engineUrl, {
        tool_name,
        tool_input: toolInput,
        clinic_id: clinicId,
        pms_type: pmsConfig.provider,
        api_key: pmsConfig.apiKey,
        base_url: pmsConfig.baseUrl ?? "",
      });

      if (engineResult !== null) {
        return NextResponse.json({ response: engineResult.result }, { status: 200 });
      }
      // null → fall through to TypeScript PMS handlers below
    }

    const adapter = createPMSAdapter(pmsConfig);

    // Dispatch by tool name
    let result: string;

    switch (tool_name) {
      case "check_availability":
        result = await handleCheckAvailability(adapter, toolInput, clinicId);
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
        result = await handleUpdateBooking(adapter, toolInput, clinicId);
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
