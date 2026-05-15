import { getAdminDb } from "@/lib/firebase-admin";
import { getResend } from "@/lib/resend";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://portal.strydeos.com";

/**
 * Handle a tool call when the clinic has no PMS configured.
 * Writes a contact_requests doc and emails the clinic admin.
 * Returns a speakable response string.
 */
export async function handleNoPmsToolCall(
  clinicId: string,
  clinicEmail: string | undefined,
  toolName: string,
  toolInput: Record<string, unknown>,
  conversationId: string,
  callerPhone: string,
): Promise<string> {
  const db = getAdminDb();
  const now = new Date().toISOString();

  const firstName = (toolInput.patient_first_name as string)?.trim() || "";
  const lastName = (toolInput.patient_last_name as string)?.trim() || "";
  const callerName = [firstName, lastName].filter(Boolean).join(" ") || undefined;

  const preferredTime =
    (toolInput.preferred_day as string) ||
    (toolInput.slot_datetime as string) ||
    undefined;

  const bodyRegion = (toolInput.body_region as string)?.trim() || undefined;
  const insuranceType = (toolInput.insurance_type as string)?.trim() || undefined;

  const reason =
    (toolInput.reason as string)?.trim() ||
    (toolInput.appointment_type === "initial_assessment"
      ? "Initial assessment"
      : toolInput.appointment_type === "follow_up"
        ? "Follow-up appointment"
        : toolName === "check_availability"
          ? "Availability enquiry"
          : toolName === "update_booking"
            ? "Booking change"
            : "General enquiry");

  const docRef = conversationId
    ? db.collection("clinics").doc(clinicId).collection("contact_requests").doc(conversationId)
    : db.collection("clinics").doc(clinicId).collection("contact_requests").doc();

  await docRef.set(
    {
      callerPhone,
      callerName: callerName ?? null,
      reason,
      bodyRegion: bodyRegion ?? null,
      preferredTime: preferredTime ?? null,
      insuranceType: insuranceType ?? null,
      toolName,
      conversationId: conversationId || null,
      createdAt: now,
    },
    { merge: true },
  );

  if (clinicEmail) {
    try {
      const resend = getResend();
      await resend.emails.send({
        from: "Ava at StrydeOS <ava@notifications.strydeos.com>",
        to: clinicEmail,
        subject: `New contact from Ava${callerName ? ` - ${callerName}` : ""}`,
        html: buildContactEmail({
          callerPhone,
          callerName,
          reason,
          bodyRegion,
          preferredTime,
          insuranceType,
          callDateTime: now,
        }),
        text: buildContactEmailText({
          callerPhone,
          callerName,
          reason,
          bodyRegion,
          preferredTime,
          insuranceType,
          callDateTime: now,
        }),
      });
    } catch {
      // Fire-and-forget — never fail a live call on email error
    }
  }

  const firstNameDisplay = firstName || undefined;
  return firstNameDisplay
    ? `Of course — I've noted your details, ${firstNameDisplay}. Someone from the team will call you back to confirm your appointment.`
    : "Of course — I've taken a note of your call. Someone from the team will be in touch shortly to sort your appointment.";
}

interface ContactEmailData {
  callerPhone: string;
  callerName?: string;
  reason: string;
  bodyRegion?: string;
  preferredTime?: string;
  insuranceType?: string;
  callDateTime: string;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function row(label: string, value: string | undefined): string {
  if (!value) return "";
  return `
    <tr>
      <td style="padding:6px 12px 6px 0;font-size:13px;color:#6B7280;font-family:'Outfit',Helvetica,Arial,sans-serif;white-space:nowrap;vertical-align:top;">${esc(label)}</td>
      <td style="padding:6px 0;font-size:13px;color:#0B2545;font-family:'Outfit',Helvetica,Arial,sans-serif;">${esc(value)}</td>
    </tr>`;
}

function buildContactEmail(data: ContactEmailData): string {
  const callTime = new Date(data.callDateTime).toLocaleString("en-GB", {
    weekday: "short", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Europe/London",
  });

  const tableRows = [
    row("Phone", data.callerPhone),
    row("Name", data.callerName),
    row("Reason", data.reason),
    row("Body region", data.bodyRegion),
    row("Preferred time", data.preferredTime),
    row("Insurance", data.insuranceType?.replace("_", " ")),
    row("Call time", callTime),
  ].join("");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F2F1EE;font-family:'Outfit',Helvetica,Arial,sans-serif;">
  <div style="max-width:540px;margin:0 auto;padding:24px 16px;">
    <div style="padding:24px 24px 20px;border-radius:12px 12px 0 0;background:#0B2545;border-bottom:3px solid #1C54F2;">
      <span style="font-size:16px;font-weight:700;color:#fff;letter-spacing:-0.02em;">Stryde<span style="color:#4B8BF5;">OS</span></span>
      <span style="display:inline-block;padding:3px 10px;border-radius:50px;background:#1C54F2;color:#fff;font-size:10px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;margin-left:8px;vertical-align:middle;">Ava</span>
    </div>
    <div style="padding:24px;background:#fff;border:1px solid #E2DFDA;border-top:none;border-radius:0 0 12px 12px;">
      <h2 style="margin:0 0 4px;font-size:18px;font-weight:600;color:#0B2545;font-family:'Outfit',Helvetica,Arial,sans-serif;">New contact from Ava</h2>
      <p style="margin:0 0 20px;font-size:13px;color:#6B7280;font-family:'Outfit',Helvetica,Arial,sans-serif;">A caller reached Ava while the booking system wasn't connected. Their details are below.</p>
      <table style="border-collapse:collapse;width:100%;">${tableRows}</table>
      <div style="margin-top:24px;">
        <a href="${esc(APP_URL + "/receptionist")}" style="display:inline-block;padding:10px 20px;background:#1C54F2;color:#fff;text-decoration:none;border-radius:8px;font-size:13px;font-weight:600;font-family:'Outfit',Helvetica,Arial,sans-serif;">View in Ava dashboard</a>
      </div>
    </div>
    <div style="padding:16px 8px;text-align:center;">
      <p style="margin:0;font-size:11px;color:#8B8B8B;font-family:'Outfit',Helvetica,Arial,sans-serif;">Powered by StrydeOS Ava</p>
    </div>
  </div>
</body>
</html>`;
}

function buildContactEmailText(data: ContactEmailData): string {
  const callTime = new Date(data.callDateTime).toLocaleString("en-GB", {
    weekday: "short", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Europe/London",
  });
  const lines = [
    "New contact from Ava",
    "A caller reached Ava while the booking system wasn't connected.",
    "",
    `Phone: ${data.callerPhone}`,
    data.callerName ? `Name: ${data.callerName}` : "",
    `Reason: ${data.reason}`,
    data.bodyRegion ? `Body region: ${data.bodyRegion}` : "",
    data.preferredTime ? `Preferred time: ${data.preferredTime}` : "",
    data.insuranceType ? `Insurance: ${data.insuranceType.replace("_", " ")}` : "",
    `Call time: ${callTime}`,
    "",
    `View in Ava dashboard: ${APP_URL}/receptionist`,
    "",
    "Powered by StrydeOS Ava",
  ];
  return lines.filter((l) => l !== undefined && l !== null).join("\n");
}
