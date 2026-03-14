/**
 * trigger-sequences.ts
 *
 * Stage 5b: For each patient, loads sequence definitions from Firestore,
 * evaluates eligibility and step progression, fires n8n webhooks, and
 * writes to comms_log.
 *
 * Sequence definitions are seeded on first run from DEFAULT_SEQUENCE_DEFINITIONS.
 * Step progression: daysAfterTrigger is measured from the trigger event date,
 * not from the previous step's sentAt.
 *
 * Exit conditions checked before each step fires:
 *   - nextSessionDate present → appointment_booked
 *   - lifecycleState is DISCHARGED or RE_ENGAGED
 *   - prior comms_log entry for this patient+sequence has outcome 'unsubscribed'
 */

import type { Firestore } from "firebase-admin/firestore";
import type { SequenceType } from "@/types";
import type { SequenceDefinition, N8nSequencePayload } from "@/types/comms";
import { DEFAULT_SEQUENCE_DEFINITIONS } from "@/types/comms";

const N8N_BASE   = process.env.N8N_WEBHOOK_BASE_URL;
const N8N_SECRET = process.env.N8N_COMMS_WEBHOOK_SECRET;
const APP_URL    = process.env.APP_URL ?? "";
const N8N_TIMEOUT = 10_000;

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

  const now       = new Date();
  const clinicRef = db.collection("clinics").doc(clinicId);

  // ── Load or seed sequence definitions ──────────────────────────────────
  const definitions = await loadOrSeedDefinitions(db, clinicId);
  const activeDefinitions = definitions
    .filter((d) => d.active)
    .sort((a, b) => a.priority - b.priority);

  // ── Load supporting data ────────────────────────────────────────────────
  const [patientsSnap, cliniciansSnap, allLogsSnap] = await Promise.all([
    clinicRef.collection("patients").get(),
    clinicRef.collection("clinicians").get(),
    // Load last 200 days of comms_log for step progression queries
    clinicRef
      .collection("comms_log")
      .where("sentAt", ">=", new Date(now.getTime() - 200 * 86_400_000).toISOString())
      .get(),
  ]);

  const clinicianNames: Record<string, string> = {};
  for (const doc of cliniciansSnap.docs) {
    clinicianNames[doc.id] = (doc.data().name as string) ?? "Your clinician";
  }

  // Index comms_log by "patientId:sequenceType" → sorted entries
  const logsByKey = new Map<string, Array<{ stepNumber: number; sentAt: string; outcome: string }>>();
  for (const doc of allLogsSnap.docs) {
    const d = doc.data();
    if (!d.patientId || !d.sequenceType) continue;
    const key = `${d.patientId}:${d.sequenceType}`;
    if (!logsByKey.has(key)) logsByKey.set(key, []);
    logsByKey.get(key)!.push({
      stepNumber: (d.stepNumber as number) ?? 1,
      sentAt:     d.sentAt as string,
      outcome:    d.outcome as string,
    });
  }
  // Sort each group by sentAt ascending
  for (const entries of logsByKey.values()) {
    entries.sort((a, b) => a.sentAt.localeCompare(b.sentAt));
  }

  let fired   = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const patientDoc of patientsSnap.docs) {
    const patient   = patientDoc.data();
    const patientId = patientDoc.id;
    const email     = patient.contact?.email as string | undefined;
    const phone     = patient.contact?.phone as string | undefined;
    const lifecycleState = patient.lifecycleState as string | undefined;

    for (const def of activeDefinitions) {
      const key = `${patientId}:${def.sequenceType}`;
      const priorLogs = logsByKey.get(key) ?? [];

      // ── Exit: prior unsubscribe ───────────────────────────────────────
      if (priorLogs.some((l) => l.outcome === "unsubscribed")) {
        skipped++;
        continue;
      }

      // ── Exit: appointment_booked (nextSessionDate present) ───────────
      if (
        def.exitConditions.includes("appointment_booked") &&
        patient.nextSessionDate
      ) {
        skipped++;
        continue;
      }

      // ── Exit: discharged ─────────────────────────────────────────────
      if (
        def.exitConditions.includes("discharged") &&
        patient.discharged === true &&
        def.sequenceType !== "review_prompt" &&
        def.sequenceType !== "reactivation_90d" &&
        def.sequenceType !== "reactivation_180d"
      ) {
        skipped++;
        continue;
      }

      // ── Exit: re_engaged ──────────────────────────────────────────────
      if (
        def.exitConditions.includes("re_engaged") &&
        lifecycleState === "RE_ENGAGED"
      ) {
        skipped++;
        continue;
      }

      // ── Eligibility ───────────────────────────────────────────────────
      const triggerDate = getTriggerDate(patient, def.sequenceType);
      if (!triggerDate) { skipped++; continue; }

      if (!isEligible(patient, def.sequenceType, now, priorLogs.length > 0)) { skipped++; continue; }

      // ── Step progression ──────────────────────────────────────────────
      const nextStep = getNextStep(def, priorLogs, triggerDate, now);
      if (!nextStep) { skipped++; continue; }

      // ── Cooldown: last log entry must be older than cooldownDays ──────
      if (priorLogs.length > 0) {
        const lastLog = priorLogs[priorLogs.length - 1];
        const daysSinceLast = Math.floor(
          (now.getTime() - new Date(lastLog.sentAt).getTime()) / 86_400_000
        );

        // Never re-send the same step number regardless of cooldown
        if (lastLog.stepNumber === nextStep.stepNumber) { skipped++; continue; }

        // Enforce cooldown between steps
        if (nextStep.stepNumber > 1 && daysSinceLast < def.cooldownDays) {
          skipped++;
          continue;
        }
      }

      // ── Contact requirement ───────────────────────────────────────────
      if (nextStep.channel === "email" && !email) { skipped++; continue; }
      if (nextStep.channel === "sms"   && !phone) { skipped++; continue; }

      // ── Pre-create comms_log doc ──────────────────────────────────────
      const logRef = clinicRef.collection("comms_log").doc();

      const payload: N8nSequencePayload = {
        clinicId,
        patientId,
        patientName:           (patient.name as string) ?? "Patient",
        patientEmail:          email,
        patientPhone:          phone,
        clinicianName:         clinicianNames[patient.clinicianId as string] ?? "Your clinician",
        sequenceType:          def.sequenceType,
        logId:                 logRef.id,
        callbackUrl:           `${APP_URL}/api/n8n/callback`,
        stepNumber:            nextStep.stepNumber,
        sequenceDefinitionId:  def.id,
        attributionWindowDays: def.attributionWindowDays,
        triggerData: {
          sessionCount:    patient.sessionCount,
          lastSessionDate: patient.lastSessionDate,
          nextSessionDate: patient.nextSessionDate,
          discharged:      patient.discharged,
          churnRisk:       patient.churnRisk,
          lifecycleState:  patient.lifecycleState,
          riskScore:       patient.riskScore,
          insuranceFlag:   patient.insuranceFlag,
          insurerName:     patient.insurerName,
          hepProgramId:    patient.hepProgramId,
          channel:         nextStep.channel,
          templateKey:     nextStep.templateKey,
          stepNumber:      nextStep.stepNumber,
        },
      };

      // ── Fire n8n webhook ──────────────────────────────────────────────
      const url = `${N8N_BASE!.replace(/\/$/, "")}/${def.sequenceType}`;
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
          errors.push(`[${def.sequenceType}] step${nextStep.stepNumber} ${patientId} → n8n HTTP ${res.status}`);
          continue;
        }

        // ── Write comms_log ───────────────────────────────────────────
        await logRef.set({
          patientId,
          sequenceType:               def.sequenceType,
          channel:                    nextStep.channel,
          sentAt:                     now.toISOString(),
          outcome:                    "no_action",
          n8nExecutionId:             null,
          stepNumber:                 nextStep.stepNumber,
          attributionWindowDays:      def.attributionWindowDays,
          patientLifecycleStateAtSend: patient.lifecycleState ?? null,
          createdAt:                  now.toISOString(),
          createdBy:                  "trigger-sequences",
        });

        // Update lastSequenceSentAt on patient doc for CHURNED detection
        await clinicRef.collection("patients").doc(patientId).set(
          { lastSequenceSentAt: now.toISOString() },
          { merge: true }
        );

        // Add to local index so same-run dedup works
        const entries = logsByKey.get(key) ?? [];
        entries.push({ stepNumber: nextStep.stepNumber, sentAt: now.toISOString(), outcome: "no_action" });
        logsByKey.set(key, entries);

        fired++;
      } catch (err) {
        errors.push(
          `[${def.sequenceType}] step${nextStep.stepNumber} ${patientId} → ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  return { fired, skipped, errors };
}

// ─── Seed / load sequence definitions ────────────────────────────────────────

async function loadOrSeedDefinitions(
  db: Firestore,
  clinicId: string
): Promise<SequenceDefinition[]> {
  const ref = db
    .collection("clinics")
    .doc(clinicId)
    .collection("sequence_definitions");
  const snap = await ref.get();

  if (!snap.empty) {
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as SequenceDefinition));
  }

  // Seed defaults
  const batch = db.batch();
  const seeded: SequenceDefinition[] = [];
  for (const def of DEFAULT_SEQUENCE_DEFINITIONS) {
    const docRef = ref.doc();
    batch.set(docRef, def);
    seeded.push({ id: docRef.id, ...def });
  }
  await batch.commit();
  return seeded;
}

// ─── Step progression ─────────────────────────────────────────────────────────

function getNextStep(
  def: SequenceDefinition,
  priorLogs: Array<{ stepNumber: number; sentAt: string; outcome: string }>,
  triggerDate: Date,
  now: Date
): (typeof def.steps)[0] | null {
  const daysSinceTrigger = Math.floor(
    (now.getTime() - triggerDate.getTime()) / 86_400_000
  );

  if (priorLogs.length === 0) {
    // No prior sends — evaluate step 1
    const step1 = def.steps.find((s) => s.stepNumber === 1);
    if (!step1) return null;
    if (daysSinceTrigger < step1.daysAfterTrigger) return null;
    return step1;
  }

  const lastSentStep = priorLogs[priorLogs.length - 1].stepNumber;
  const nextStepNum = lastSentStep + 1;
  const nextStep = def.steps.find((s) => s.stepNumber === nextStepNum);
  if (!nextStep) return null; // sequence complete

  if (daysSinceTrigger < nextStep.daysAfterTrigger) return null;
  return nextStep;
}

// ─── Trigger date ──────────────────────────────────────────────────────────────

/**
 * Returns the event date from which daysAfterTrigger is measured.
 * For most sequences this is lastSessionDate.
 * Returns null if the required data is absent.
 */
function getTriggerDate(
  patient: Record<string, unknown>,
  sequenceType: SequenceType
): Date | null {
  const lastSession = patient.lastSessionDate
    ? new Date(patient.lastSessionDate as string)
    : null;

  switch (sequenceType) {
    case "early_intervention":
    case "rebooking_prompt":
    case "hep_reminder":
    case "review_prompt":
    case "reactivation_90d":
    case "reactivation_180d":
      return lastSession;
    case "pre_auth_collection":
      return new Date(); // fires immediately on eligibility
    default:
      return lastSession;
  }
}

// ─── Eligibility ──────────────────────────────────────────────────────────────

function isEligible(
  patient: Record<string, unknown>,
  sequenceType: SequenceType,
  now: Date,
  hasBeenStarted: boolean  // true if prior logs exist for this patient+sequence
): boolean {
  const sessionCount = (patient.sessionCount as number) ?? 0;

  switch (sequenceType) {
    case "early_intervention":
      return (patient.sessionThresholdAlert === true) && !patient.nextSessionDate;

    case "rebooking_prompt":
      return patient.churnRisk === true && sessionCount >= 2;

    case "hep_reminder": {
      if (!patient.hepProgramId || patient.nextSessionDate) return false;
      // 48h entry guard applies only to step 1 (first contact).
      // Subsequent steps are already underway — no window restriction.
      if (!hasBeenStarted) {
        const lastSess = patient.lastSessionDate ? new Date(patient.lastSessionDate as string) : null;
        const hoursAgo = lastSess ? (now.getTime() - lastSess.getTime()) / 3_600_000 : Infinity;
        if (hoursAgo > 48) return false;
      }
      return true;
    }

    case "review_prompt":
      return patient.discharged === true;

    case "pre_auth_collection":
      return patient.insuranceFlag === true && sessionCount === 1;

    case "reactivation_90d":
      return patient.discharged === true && !!patient.lastSessionDate;

    case "reactivation_180d":
      return patient.discharged === true && !!patient.lastSessionDate;

    default:
      return false;
  }
}
