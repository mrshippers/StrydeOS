import * as admin from "firebase-admin";
import { onMessagePublished } from "firebase-functions/v2/pubsub";

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const REGION = "europe-west2";

// ─── Types ────────────────────────────────────────────────────────────────────

interface VisitSummaryMessage {
  clinicId: string;
  appointmentId: string;
}

interface AppointmentDoc {
  startsAt?: string;
  practitionerId?: string;
  appointmentTypeId?: string;
  status?: string;
  [key: string]: unknown;
}

interface ClaudeMessage {
  role: "user";
  content: string;
}

interface ClaudeRequest {
  model: string;
  max_tokens: number;
  messages: ClaudeMessage[];
}

interface ClaudeContentBlock {
  type: string;
  text?: string;
}

interface ClaudeResponse {
  content: ClaudeContentBlock[];
}

// ─── Claude helper ─────────────────────────────────────────────────────────────

async function generateVisitSummary(apt: AppointmentDoc): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const dateStr = apt.startsAt
    ? new Date(apt.startsAt).toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "your recent visit";

  const statusNote =
    apt.status === "cancelled"
      ? "This appointment was cancelled."
      : "This appointment was completed.";

  const prompt =
    `You are writing a brief, warm visit summary for a physiotherapy patient. ` +
    `Write 3–4 sentences in a friendly but professional tone. ` +
    `Do not invent clinical details — only reference what is provided. ` +
    `Appointment date: ${dateStr}. ` +
    `Practitioner ID: ${apt.practitionerId ?? "your practitioner"}. ` +
    `Appointment type ID: ${apt.appointmentTypeId ?? "your session type"}. ` +
    `Status: ${apt.status ?? "completed"}. ${statusNote} ` +
    `Summarise the visit briefly, remind the patient to follow any advice given, ` +
    `and encourage them to get in touch if they have questions.`;

  const body: ClaudeRequest = {
    model: "claude-sonnet-4-6",
    max_tokens: 256,
    messages: [{ role: "user", content: prompt }],
  };

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude API error: ${res.status} ${text}`);
  }

  const data = (await res.json()) as ClaudeResponse;
  const block = data.content.find((b) => b.type === "text");
  if (!block?.text) throw new Error("Claude returned no text content");
  return block.text.trim();
}

// ─── Pub/Sub triggered function ───────────────────────────────────────────────

export const visitSummary = onMessagePublished(
  {
    topic: "visit-summary-request",
    region: REGION,
    timeoutSeconds: 120,
    memory: "256MiB",
  },
  async (event) => {
    const db = admin.firestore();

    let clinicId: string;
    let appointmentId: string;
    try {
      const parsed = event.data.message.json as Partial<VisitSummaryMessage>;
      clinicId = parsed.clinicId ?? "";
      appointmentId = parsed.appointmentId ?? "";
    } catch {
      console.error("[visitSummary] Failed to parse Pub/Sub message:", event.data.message.data);
      return;
    }

    if (!clinicId || !appointmentId) {
      console.error("[visitSummary] Missing clinicId or appointmentId in message");
      return;
    }

    const aptRef = db
      .collection("clinics")
      .doc(clinicId)
      .collection("appointments")
      .doc(appointmentId);

    const aptSnap = await aptRef.get();
    if (!aptSnap.exists) {
      console.error(
        `[visitSummary] Appointment ${appointmentId} not found for clinic ${clinicId}`
      );
      return;
    }

    const apt = aptSnap.data() as AppointmentDoc;

    let summary: string;
    try {
      summary = await generateVisitSummary(apt);
    } catch (err) {
      console.error(
        `[visitSummary] Claude generation failed for appointment ${appointmentId}:`,
        err
      );
      throw err;
    }

    await aptRef.set({ patientSummary: summary }, { merge: true });

    console.log(
      `[visitSummary] Summary written for appointment ${appointmentId} (clinic ${clinicId})`
    );
  }
);
