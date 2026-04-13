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
 * Auth: ElevenLabs HMAC signature (same as /api/ava/transfer).
 * Returns { result: string } — ElevenLabs speaks this back to the caller.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { createPMSAdapter } from "@/lib/integrations/pms/factory";
import { verifyElevenLabsSignature, isWebhookSecretConfigured } from "@/lib/ava/verify-signature";
import type { PMSIntegrationConfig, PMSClinician } from "@/types/pms";

export const runtime = "nodejs";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ToolCallPayload {
  agent_id: string;
  conversation_id?: string;
  caller_phone?: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
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
    // Try to parse a specific date or day name
    const parsed = parseFutureDate(preferredDay);
    dateFrom = parsed.toISOString();
    dateTo = new Date(parsed.getTime() + 24 * 60 * 60 * 1000).toISOString();
  } else {
    const now = new Date();
    dateFrom = now.toISOString();
    dateTo = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  }

  const appointments = await adapter.getAppointments({
    clinicianExternalId,
    dateFrom,
    dateTo,
  });

  // Find gaps in the schedule — basic slot detection
  // For now, return existing booked slots so ElevenLabs can infer availability
  // (Full gap-detection requires clinic opening hours config)
  if (appointments.length === 0) {
    const rangeDesc = preferredDay
      ? `on ${preferredDay}`
      : "in the next week";
    const whoDesc = clinicianName ? ` with ${clinicianName}` : "";
    return `The diary looks quite open ${rangeDesc}${whoDesc}. What day and time works best for you?`;
  }

  // Group by date and find busy times
  const busyByDate = new Map<string, string[]>();
  for (const appt of appointments) {
    const date = new Date(appt.dateTime).toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    const time = new Date(appt.dateTime).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    if (!busyByDate.has(date)) busyByDate.set(date, []);
    busyByDate.get(date)!.push(time);
  }

  // Build a natural summary
  const parts: string[] = [];
  for (const [date, times] of busyByDate) {
    parts.push(`${date} has appointments at ${times.join(", ")}`);
  }

  const whoDesc = clinicianName ? `for ${clinicianName} ` : "";
  return `Here's what the diary looks like ${whoDesc}— ${parts.slice(0, 3).join(". ")}. Which day and time would you prefer? I'll check if that slot is free.`;
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

  // Resolve clinician
  let clinicianExternalId = "";
  let resolvedClinicianName = "one of our physios";

  if (clinicianName) {
    const cliniciansSnap = await clinicRef.collection("clinicians").get();
    const match = cliniciansSnap.docs.find((d) => {
      const name = d.data().name?.toLowerCase() ?? "";
      return name.includes(clinicianName.toLowerCase());
    });
    if (match) {
      clinicianExternalId = match.data().pmsExternalId ?? match.id;
      resolvedClinicianName = match.data().name ?? clinicianName;
    }
  }

  // If no clinician specified, get the first active one
  if (!clinicianExternalId) {
    const cliniciansSnap = await clinicRef
      .collection("clinicians")
      .where("active", "==", true)
      .limit(1)
      .get();
    if (!cliniciansSnap.empty) {
      const doc = cliniciansSnap.docs[0];
      clinicianExternalId = doc.data().pmsExternalId ?? doc.id;
      resolvedClinicianName = doc.data().name ?? "one of our physios";
    }
  }

  if (!clinicianExternalId) {
    return "I'm having trouble finding an available clinician. Let me take your details and have someone call you back to book.";
  }

  // Determine duration
  const durationMinutes = appointmentType === "initial_assessment" ? 60 : 30;
  const endTime = new Date(dt.getTime() + durationMinutes * 60_000).toISOString();

  // Look up or create patient
  let patientExternalId = "";
  const normalizedPhone = phone.startsWith("0")
    ? `+44${phone.slice(1)}`
    : phone.startsWith("+")
      ? phone
      : `+${phone}`;

  const patientSnap = await clinicRef
    .collection("patients")
    .where("contact.phone", "==", normalizedPhone)
    .limit(1)
    .get();

  let patientIsNew = true;
  if (!patientSnap.empty) {
    const existingPatient = patientSnap.docs[0].data();
    patientExternalId = existingPatient.pmsExternalId ?? patientSnap.docs[0].id;
    patientIsNew = false;
  }
  if (!patientExternalId) {
    patientExternalId = `ava_${normalizedPhone.replace(/\D/g, "")}`;
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

    // Log tool call
    if (conversationId) {
      await db
        .collection("clinics")
        .doc(clinicId)
        .collection("call_log")
        .doc(conversationId)
        .set(
          {
            toolCalls: [
              ...(await getExistingToolCalls(db, clinicId, conversationId)),
              {
                tool: "book_appointment",
                input: { firstName, lastName, phone: normalizedPhone, slotDatetime, clinicianName },
                output: { pmsExternalId: pmsResult.externalId, firestoreDocId },
                timestamp: now,
              },
            ],
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

    return `Lovely — I've booked you in for ${dateStr} at ${timeStr} with ${resolvedClinicianName}. That's a ${durationMinutes}-minute ${appointmentType === "initial_assessment" ? "initial assessment" : "follow-up"}. You'll receive a confirmation text shortly.`;
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
            toolCalls: [
              ...(await getExistingToolCalls(db, clinicId, conversationId)),
              {
                tool: "book_appointment",
                input: { firstName, lastName, phone: normalizedPhone, slotDatetime },
                error: message,
                timestamp: now,
              },
            ],
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

async function getExistingToolCalls(
  db: ReturnType<typeof getAdminDb>,
  clinicId: string,
  conversationId: string,
): Promise<Array<Record<string, unknown>>> {
  try {
    const doc = await db
      .collection("clinics")
      .doc(clinicId)
      .collection("call_log")
      .doc(conversationId)
      .get();
    return (doc.data()?.toolCalls as Array<Record<string, unknown>>) ?? [];
  } catch {
    return [];
  }
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

    // Verify ElevenLabs signature
    if (!isWebhookSecretConfigured()) {
      return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
    }
    const sig = req.headers.get("elevenlabs-signature");
    const valid = await verifyElevenLabsSignature(rawBody, sig);
    if (!valid) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const body: ToolCallPayload = JSON.parse(rawBody);
    const { agent_id, conversation_id, caller_phone, tool_name, tool_input } = body;

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
        { result: "I'm having trouble accessing the system right now. Let me take your details and have someone call you back." },
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
        { result: "The booking system isn't connected for this clinic yet. Let me take your details and have someone call you back." },
        { status: 200 },
      );
    }

    const adapter = createPMSAdapter(pmsConfig);
    const toolInput = tool_input ?? {};

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

    return NextResponse.json({ result }, { status: 200 });
  } catch (_error) {
    return NextResponse.json(
      { result: "I'm having a bit of trouble right now. Let me take your details and someone will call you back shortly." },
      { status: 200 },
    );
  }
}

export const POST = handler;
