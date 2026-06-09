import * as admin from "firebase-admin";
import * as functionsV1 from "firebase-functions/v1";

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const REGION = "europe-west2";

// ─── Types ────────────────────────────────────────────────────────────────────

type InsurancePathway =
  | "nhs"
  | "bupa"
  | "axa"
  | "vitality"
  | "aviva"
  | "self-pay"
  | "unknown";

type Confidence = "high" | "low";

interface InsuranceRoute {
  pathway: InsurancePathway;
  confidence: Confidence;
  routedAt: string;
}

interface AppointmentDoc {
  appointmentTypeId?: string;
  notes?: string;
  tags?: string | string[];
}

// ─── Routing logic ────────────────────────────────────────────────────────────

const INSURER_KEYWORDS: { keyword: string; pathway: InsurancePathway }[] = [
  { keyword: "bupa",      pathway: "bupa"     },
  { keyword: "axa",       pathway: "axa"      },
  { keyword: "vitality",  pathway: "vitality" },
  { keyword: "aviva",     pathway: "aviva"    },
  { keyword: "nhs",       pathway: "nhs"      },
  { keyword: "self-pay",  pathway: "self-pay" },
  { keyword: "self pay",  pathway: "self-pay" },
];

function matchPathway(text: string): InsurancePathway | null {
  const lower = text.toLowerCase();
  for (const { keyword, pathway } of INSURER_KEYWORDS) {
    if (lower.includes(keyword)) return pathway;
  }
  return null;
}

function classifyAppointment(data: AppointmentDoc): InsuranceRoute {
  const routedAt = new Date().toISOString();

  // High-confidence: appointmentTypeId contains an insurer name
  if (data.appointmentTypeId) {
    const match = matchPathway(data.appointmentTypeId);
    if (match) {
      return { pathway: match, confidence: "high", routedAt };
    }
  }

  // Low-confidence: check free-text notes/tags
  const candidates: string[] = [];
  if (data.notes) candidates.push(data.notes);
  if (Array.isArray(data.tags)) {
    candidates.push(...data.tags);
  } else if (typeof data.tags === "string") {
    candidates.push(data.tags);
  }

  for (const text of candidates) {
    const match = matchPathway(text);
    if (match) {
      return { pathway: match, confidence: "low", routedAt };
    }
  }

  // Default: self-pay (most common for private UK physio)
  return { pathway: "self-pay", confidence: "low", routedAt };
}

// ─── Pub/Sub triggered function ───────────────────────────────────────────────

export const insuranceRoute = functionsV1
  .region(REGION)
  .runWith({ timeoutSeconds: 60, memory: "256MB" })
  .pubsub.topic("insurance-route-request")
  .onPublish(async (message) => {
    const db = admin.firestore();

    let clinicId: string;
    let appointmentId: string;
    try {
      const parsed = message.json as { clinicId?: string; appointmentId?: string };
      clinicId = parsed.clinicId ?? "";
      appointmentId = parsed.appointmentId ?? "";
    } catch {
      console.error("[insuranceRoute] Failed to parse Pub/Sub message:", message.data);
      return;
    }

    if (!clinicId || !appointmentId) {
      console.error("[insuranceRoute] Missing clinicId or appointmentId in message");
      return;
    }

    const apptRef = db
      .collection("clinics")
      .doc(clinicId)
      .collection("appointments")
      .doc(appointmentId);

    const snap = await apptRef.get();
    if (!snap.exists) {
      console.error(
        `[insuranceRoute] Appointment ${appointmentId} not found for clinic ${clinicId}`
      );
      return;
    }

    const data = snap.data() as AppointmentDoc;
    const route = classifyAppointment(data);

    await apptRef.set({ insuranceRoute: route }, { merge: true });

    console.log(
      `[insuranceRoute] Clinic ${clinicId} appt ${appointmentId} → pathway=${route.pathway} confidence=${route.confidence}`
    );
  });
