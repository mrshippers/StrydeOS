/**
 * trigger-sequences.ts
 *
 * Runs after Stage 5 (compute-patients) in the pipeline.
 * For each patient, checks eligibility for each enabled comms sequence,
 * deduplicates against recent comms_log entries (7-day window),
 * POSTs the payload to the relevant n8n webhook, then writes to comms_log.
 *
 * Gracefully no-ops if N8N_WEBHOOK_BASE_URL is not configured.
 */

import type { Firestore } from "firebase-admin/firestore";
import type { SequenceType } from "@/types";
import type { N8nWebhookPayload } from "@/types/comms";
import { DEFAULT_SEQUENCES } from "@/types/comms";

const N8N_BASE    = process.env.N8N_WEBHOOK_BASE_URL;
const N8N_SECRET  = process.env.N8N_COMMS_WEBHOOK_SECRET;
const APP_URL     = process.env.APP_URL ?? "";

const DEDUP_DAYS  = 7;
const N8N_TIMEOUT = 10_000; // 10 s — fail fast, don't block the pipeline

export interface TriggerResult {
  fired:   number;
  skipped: number;
  errors:  string[];
}

// ─── Main export ─────────────────────────────────────────────────────────────

export async function triggerCommsSequences(
  db: Firestore,
  clinicId: string
): Promise<TriggerResult> {
  if (!N8N_BASE?.trim()) {
    return { fired: 0, skipped: 0, errors: ["N8N_WEBHOOK_BASE_URL not set — comms skipped"] };
  }

  const now          = new Date();
  const dedupCutoff  = new Date(now.getTime() - DEDUP_DAYS * 86_400_000).toISOString();
  const clinicRef    = db.collection("clinics").doc(clinicId);

  const enabledSeqs  = DEFAULT_SEQUENCES.filter((s) => s.enabled);

  // ── Load supporting data ────────────────────────────────────────────────
  const [patientsSnap, cliniciansSnap, recentLogsSnap] = await Promise.all([
    clinicRef.collection("patients").get(),
    clinicRef.collection("clinicians").get(),
    clinicRef.collection("comms_log").where("sentAt", ">=", dedupCutoff).get(),
  ]);

  // clinicianId → name
  const clinicianNames: Record<string, string> = {};
  for (const doc of cliniciansSnap.docs) {
    clinicianNames[doc.id] = (doc.data().name as string) ?? "Your clinician";
  }

  // dedup set: "patientId:sequenceType" for anything sent in the last 7 days
  const sentKeys = new Set<string>();
  for (const doc of recentLogsSnap.docs) {
    const { patientId, sequenceType } = doc.data() as { patientId?: string; sequenceType?: string };
    if (patientId && sequenceType) sentKeys.add(`${patientId}:${sequenceType}`);
  }

  let fired   = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const patientDoc of patientsSnap.docs) {
    const patient   = patientDoc.data();
    const patientId = patientDoc.id;
    const email     = patient.contact?.email as string | undefined;
    const phone     = patient.contact?.phone as string | undefined;

    for (const seq of enabledSeqs) {
      // ── Deduplication ────────────────────────────────────────────────────
      const key = `${patientId}:${seq.type}`;
      if (sentKeys.has(key)) { skipped++; continue; }

      // ── Eligibility ──────────────────────────────────────────────────────
      if (!isEligible(patient, seq.type, now)) { skipped++; continue; }

      // ── Contact requirement ──────────────────────────────────────────────
      if (seq.channel === "email" && !email) { skipped++; continue; }
      if (seq.channel === "sms"   && !phone) { skipped++; continue; }

      // ── Create comms_log doc ref first (so we can pass logId to n8n) ────
      const logRef = clinicRef.collection("comms_log").doc();

      const payload: N8nWebhookPayload & {
        logId:       string;
        callbackUrl: string;
      } = {
        clinicId,
        patientId,
        patientName:   (patient.name as string) ?? "Patient",
        patientEmail:  email,
        patientPhone:  phone,
        clinicianName: clinicianNames[patient.clinicianId as string] ?? "Your clinician",
        sequenceType:  seq.type,
        logId:         logRef.id,
        callbackUrl:   `${APP_URL}/api/n8n/callback`,
        triggerData: {
          sessionCount:    patient.sessionCount,
          lastSessionDate: patient.lastSessionDate,
          nextSessionDate: patient.nextSessionDate,
          discharged:      patient.discharged,
          churnRisk:       patient.churnRisk,
          insuranceFlag:   patient.insuranceFlag,
          insurerName:     patient.insurerName,
          hepProgramId:    patient.hepProgramId,
          channel:         seq.channel,
        },
      };

      // ── Fire n8n webhook ─────────────────────────────────────────────────
      const url = `${N8N_BASE.replace(/\/$/, "")}/${seq.type}`;
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(N8N_SECRET ? { "x-webhook-secret": N8N_SECRET } : {}),
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(N8N_TIMEOUT),
        });

        if (!res.ok) {
          errors.push(`[${seq.type}] ${patientId} → n8n HTTP ${res.status}`);
          continue;
        }

        // ── Write comms_log (optimistic — n8n callback enriches later) ────
        await logRef.set({
          patientId,
          sequenceType:  seq.type,
          channel:       seq.channel,
          sentAt:        now.toISOString(),
          outcome:       "no_action",   // updated by n8n callback on delivery
          n8nExecutionId: null,
          createdAt:     now.toISOString(),
          createdBy:     "trigger-sequences",
        });

        sentKeys.add(key); // prevent double-fire in the same pipeline run
        fired++;
      } catch (err) {
        errors.push(
          `[${seq.type}] ${patientId} → ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  return { fired, skipped, errors };
}

// ─── Eligibility logic ────────────────────────────────────────────────────────

function isEligible(
  patient: Record<string, unknown>,
  sequenceType: SequenceType,
  now: Date
): boolean {
  const lastSession     = patient.lastSessionDate ? new Date(patient.lastSessionDate as string) : null;
  const hoursAgo        = lastSession
    ? (now.getTime() - lastSession.getTime()) / 3_600_000
    : Infinity;
  const sessionCount    = (patient.sessionCount as number) ?? 0;

  switch (sequenceType) {
    case "hep_reminder":
      // Last session was 20–48 h ago; patient has no next appointment booked
      return hoursAgo >= 20 && hoursAgo <= 48 && !patient.nextSessionDate;

    case "rebooking_prompt":
      // Churn risk (>14 days since last session, no next appt) with 2+ sessions
      return patient.churnRisk === true && sessionCount >= 2;

    case "review_prompt":
      // Just discharged: last session 48–80 h ago
      return patient.discharged === true && hoursAgo >= 48 && hoursAgo <= 80;

    case "pre_auth_collection":
      // Insurance patient on their very first session
      return patient.insuranceFlag === true && sessionCount === 1;

    case "reactivation_90d":
      // Discharged ~90 days ago (88–94 h tolerance window)
      return patient.discharged === true
        && hoursAgo >= 88 * 24
        && hoursAgo <= 94 * 24;

    case "reactivation_180d":
      // Discharged ~180 days ago
      return patient.discharged === true
        && hoursAgo >= 178 * 24
        && hoursAgo <= 184 * 24;

    default:
      return false;
  }
}
