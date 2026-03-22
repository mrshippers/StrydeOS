import type { Firestore } from "firebase-admin/firestore";
import type { InsightEvent } from "@/types/insight-events";
import { PATIENT_ACTION_EVENTS, EVENT_TO_SEQUENCE } from "@/types/insight-events";

interface ConsumeResult {
  actioned: number;
  skipped: number;
  errors: string[];
}

/**
 * Consume patient-actionable insight events and trigger Pulse sequences.
 *
 * Called inline after detection writes events (no Firestore triggers in this
 * Vercel/Next.js architecture — adapted from the Cloud Function spec).
 *
 * For each patient-actionable event:
 * 1. Check actionTarget === 'patient'
 * 2. Map event type to Pulse sequence
 * 3. Check sequence is enabled for the clinic
 * 4. Check comms consent (clinic-level)
 * 5. Write to comms_log with insightEventId reference
 * 6. Write pulseActionId back to the InsightEvent
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

  // Load sequence definitions to check enabled state
  const seqSnap = await db
    .collection(`clinics/${clinicId}/sequence_definitions`)
    .get();
  const sequences = new Map(
    seqSnap.docs.map((d) => [
      d.data().sequenceType as string,
      { id: d.id, active: d.data().active as boolean },
    ])
  );

  const commsLogRef = db.collection(`clinics/${clinicId}/comms_log`);

  for (const event of patientEvents) {
    const sequenceType = EVENT_TO_SEQUENCE[event.type];
    if (!sequenceType) {
      result.skipped++;
      continue;
    }

    // Check if sequence is enabled
    const seq = sequences.get(sequenceType);
    if (!seq || !seq.active) {
      result.skipped++;
      continue;
    }

    // Check patient exists and has contact info
    if (!event.patientId) {
      result.skipped++;
      continue;
    }

    const patientDoc = await db
      .doc(`clinics/${clinicId}/patients/${event.patientId}`)
      .get();
    if (!patientDoc.exists) {
      result.skipped++;
      continue;
    }

    const patient = patientDoc.data()!;
    const contact = patient.contact as { email?: string; phone?: string } | undefined;
    const channel = contact?.phone ? "sms" : contact?.email ? "email" : null;
    if (!channel) {
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
      result.skipped++;
      continue;
    }

    try {
      // Write to comms_log with Intelligence attribution
      const logEntry = {
        patientId: event.patientId,
        sequenceType,
        channel,
        sentAt: new Date().toISOString(),
        outcome: "no_action",
        stepNumber: 1,
        patientLifecycleStateAtSend: patient.lifecycleState ?? "ACTIVE",
        // Intelligence attribution
        insightEventId: event.id,
        triggeredByIntelligence: true,
        insightEventType: event.type,
      };

      const logDoc = await commsLogRef.add(logEntry);

      // Write pulseActionId back to the InsightEvent
      if (event.id) {
        await db
          .doc(`clinics/${clinicId}/insight_events/${event.id}`)
          .update({ pulseActionId: logDoc.id });
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
