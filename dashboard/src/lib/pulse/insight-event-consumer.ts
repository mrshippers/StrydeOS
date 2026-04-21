import { FieldValue, type Firestore } from "firebase-admin/firestore";
import type { InsightEvent } from "@/types/insight-events";
import { PATIENT_ACTION_EVENTS, EVENT_TO_SEQUENCE } from "@/types/insight-events";
import type { SequenceDefinition } from "@/types/comms";

interface ConsumeResult {
  actioned: number;
  skipped: number;
  errors: string[];
}

const CONSUMER_NAME = "pulse";

/**
 * Consume patient-actionable insight events and trigger Pulse sequences.
 *
 * Called inline after detection writes events (no Firestore triggers in this
 * Vercel/Next.js architecture — adapted from the Cloud Function spec).
 *
 * Idempotency: each event carries a `consumedBy: string[]` field. Before
 * processing, the consumer checks whether `'pulse'` is already in the array
 * and short-circuits if so. After processing (whether or not a sequence
 * was matched) the consumer atomically appends `'pulse'` via arrayUnion,
 * making re-runs no-ops.
 *
 * Sequence matching:
 *   1. `sequence_definitions[].triggerEventType === event.type` (new path, wins)
 *   2. `EVENT_TO_SEQUENCE[event.type]` (legacy map, fallback)
 *
 * For each matched patient-actionable event:
 * 1. Check actionTarget === 'patient'
 * 2. Match event type to a Pulse sequence
 * 3. Check sequence is enabled for the clinic
 * 4. Check comms consent (clinic-level)
 * 5. Write to comms_log with insightEventId reference and outcome='pending'
 * 6. Write pulseActionId back to the InsightEvent
 * 7. Mark event as consumed (arrayUnion)
 */
export async function consumeInsightEvents(
  db: Firestore,
  clinicId: string,
  events: InsightEvent[]
): Promise<ConsumeResult> {
  const result: ConsumeResult = {
    actioned: 0,
    skipped: 0,
    errors: [],
  };

  const patientEvents = events.filter(
    (e) => e.actionTarget === "patient" && PATIENT_ACTION_EVENTS.includes(e.type)
  );

  if (patientEvents.length === 0) return result;

  // Check clinic-level comms consent
  const clinicDoc = await db.doc(`clinics/${clinicId}`).get();
  if (!clinicDoc.exists) {
    result.errors.push("Clinic document not found");
    return result;
  }

  const clinicData = clinicDoc.data()!;
  const consentGranted = clinicData.commsConsentGrantedAt != null;
  if (!consentGranted) {
    result.skipped = patientEvents.length;
    return result;
  }

  // Load sequence definitions — indexed by BOTH sequenceType (legacy) and
  // triggerEventType (new) so we can match either way.
  const seqSnap = await db
    .collection(`clinics/${clinicId}/sequence_definitions`)
    .get();

  const bySequenceType = new Map<string, { id: string; active: boolean; def: SequenceDefinition }>();
  const byTriggerEventType = new Map<string, { id: string; active: boolean; def: SequenceDefinition }>();

  for (const d of seqSnap.docs) {
    const data = d.data() as Omit<SequenceDefinition, "id">;
    const entry = { id: d.id, active: data.active as boolean, def: { id: d.id, ...data } as SequenceDefinition };
    bySequenceType.set(data.sequenceType as string, entry);
    if (data.triggerEventType) {
      byTriggerEventType.set(data.triggerEventType as string, entry);
    }
  }

  const commsLogRef = db.collection(`clinics/${clinicId}/comms_log`);

  for (const event of patientEvents) {
    // ── Idempotency: skip if already consumed by pulse ─────────────────
    if (Array.isArray(event.consumedBy) && event.consumedBy.includes(CONSUMER_NAME)) {
      result.skipped++;
      continue;
    }

    try {
      // Resolve the matching sequence:
      //   1. triggerEventType on a sequence_definition (new, wins)
      //   2. EVENT_TO_SEQUENCE legacy map
      let seq = byTriggerEventType.get(event.type);
      if (!seq) {
        const legacyType = EVENT_TO_SEQUENCE[event.type];
        if (legacyType) {
          seq = bySequenceType.get(legacyType);
        }
      }

      // Whether or not we match a sequence, mark the event as consumed so
      // re-runs don't re-evaluate it. This is the core idempotency guarantee.
      const markConsumed = async () => {
        if (event.id) {
          try {
            await db
              .doc(`clinics/${clinicId}/insight_events/${event.id}`)
              .update({ consumedBy: FieldValue.arrayUnion(CONSUMER_NAME) });
          } catch {
            // Non-fatal — next run will re-evaluate, and sequence-level
            // dedup (prior comms_log) will still prevent duplicate sends.
          }
        }
      };

      if (!seq || !seq.active) {
        await markConsumed();
        result.skipped++;
        continue;
      }

      // Check patient exists and has contact info
      if (!event.patientId) {
        await markConsumed();
        result.skipped++;
        continue;
      }

      const patientDoc = await db
        .doc(`clinics/${clinicId}/patients/${event.patientId}`)
        .get();
      if (!patientDoc.exists) {
        await markConsumed();
        result.skipped++;
        continue;
      }

      const patient = patientDoc.data()!;
      const contact = patient.contact as { email?: string; phone?: string } | undefined;
      const channel = contact?.phone ? "sms" : contact?.email ? "email" : null;
      if (!channel) {
        await markConsumed();
        result.skipped++;
        continue;
      }

      // Check for existing unsubscribe in comms_log
      const unsubCheck = await db
        .collection(`clinics/${clinicId}/comms_log`)
        .where("patientId", "==", event.patientId)
        .where("outcome", "==", "unsubscribed")
        .limit(1)
        .get();

      if (!unsubCheck.empty) {
        await markConsumed();
        result.skipped++;
        continue;
      }

      // Derive templateKey from the sequence's step 1 (or fall back to a
      // synthetic key for observability if step 1 is missing).
      const step1 = seq.def.steps.find((s) => s.stepNumber === 1);
      const templateKey = step1?.templateKey ?? `${seq.def.sequenceType}_step1`;

      // Write to comms_log with Intelligence attribution and outcome='pending'
      const logEntry = {
        patientId: event.patientId,
        sequenceType: seq.def.sequenceType,
        channel,
        sentAt: new Date().toISOString(),
        outcome: "pending",
        stepNumber: 1,
        templateKey,
        patientLifecycleStateAtSend: patient.lifecycleState ?? "ACTIVE",
        // Intelligence attribution
        insightEventId: event.id,
        triggeredByIntelligence: true,
        insightEventType: event.type,
      };

      const logDoc = await commsLogRef.add(logEntry);

      // Write pulseActionId back to the InsightEvent AND mark consumed atomically
      if (event.id) {
        try {
          await db.doc(`clinics/${clinicId}/insight_events/${event.id}`).update({
            pulseActionId: logDoc.id,
            consumedBy: FieldValue.arrayUnion(CONSUMER_NAME),
          });
        } catch (err) {
          // Non-fatal — the comms_log write succeeded so the send will proceed.
          result.errors.push(
            `pulseActionId update failed for event ${event.id}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }

      result.actioned++;
    } catch (err) {
      result.errors.push(
        `Failed to action ${event.type} for patient ${event.patientId}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return result;
}
