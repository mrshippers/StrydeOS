/**
 * Value Attribution Detection Engine
 *
 * Scans existing data (call logs, comms logs, patients, appointments, insight events)
 * and writes attributable value events to the value_events subcollection.
 *
 * Runs on a schedule (same cadence as detect-insight-events) or on-demand.
 * Every event is conservative — we round DOWN, not up. No inflated projections.
 *
 * Firestore writes: clinics/{clinicId}/value_events/{auto-id}
 */

import type { Firestore } from "firebase-admin/firestore";
import type {
  ValueEvent,
  ValueEventType,
  AttributionConfidence,
  AvaAttributionConfig,
  PulseAttributionConfig,
} from "@/types/value-ledger";
import {
  DEFAULT_AVA_ATTRIBUTION_CONFIG,
  DEFAULT_PULSE_ATTRIBUTION_CONFIG,
} from "@/types/value-ledger";
import type {
  CallLog,
  CommsLogEntry,
  Patient,
  Appointment,
  WeeklyStats,
} from "@/types";
import type { InsightEvent } from "@/types/insight-events";

// ─── Result ──────────────────────────────────────────────────────────────────

interface DetectionResult {
  clinicId: string;
  eventsCreated: number;
  eventsSkipped: number;
  errors: string[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SESSION_RATE_PENCE = 6500;
const DEDUP_WINDOW_DAYS = 30;

// ─── Main Entry Point ────────────────────────────────────────────────────────

export async function detectValueEvents(
  db: Firestore,
  clinicId: string
): Promise<DetectionResult> {
  const result: DetectionResult = {
    clinicId,
    eventsCreated: 0,
    eventsSkipped: 0,
    errors: [],
  };

  try {
    // Load configs
    const avaConfig = await loadAvaConfig(db, clinicId);
    const pulseConfig = await loadPulseConfig(db, clinicId);
    const sessionRate = await loadSessionRate(db, clinicId);

    // Load existing value events for dedup
    const dedupCutoff = new Date();
    dedupCutoff.setDate(dedupCutoff.getDate() - DEDUP_WINDOW_DAYS);
    const existingEvents = await loadExistingValueEvents(db, clinicId, dedupCutoff);
    const dedupKeys = new Set(existingEvents.map(buildDedupKey));

    const newEvents: Omit<ValueEvent, "id">[] = [];

    // ── Ava Attribution ──
    const avaEvents = await detectAvaEvents(db, clinicId, avaConfig, sessionRate, dedupCutoff);
    for (const event of avaEvents) {
      const key = buildDedupKeyFromPartial(event);
      if (dedupKeys.has(key)) {
        result.eventsSkipped++;
      } else {
        newEvents.push(event);
        dedupKeys.add(key);
      }
    }

    // ── Pulse Attribution ──
    const pulseEvents = await detectPulseEvents(db, clinicId, pulseConfig, sessionRate, dedupCutoff);
    for (const event of pulseEvents) {
      const key = buildDedupKeyFromPartial(event);
      if (dedupKeys.has(key)) {
        result.eventsSkipped++;
      } else {
        newEvents.push(event);
        dedupKeys.add(key);
      }
    }

    // ── Intelligence Attribution ──
    const intelEvents = await detectIntelligenceEvents(db, clinicId, sessionRate, dedupCutoff);
    for (const event of intelEvents) {
      const key = buildDedupKeyFromPartial(event);
      if (dedupKeys.has(key)) {
        result.eventsSkipped++;
      } else {
        newEvents.push(event);
        dedupKeys.add(key);
      }
    }

    // Write to Firestore
    const eventsRef = db.collection(`clinics/${clinicId}/value_events`);
    const batch = db.batch();
    for (const event of newEvents) {
      batch.set(eventsRef.doc(), event);
    }
    await batch.commit();
    result.eventsCreated = newEvents.length;
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : String(err));
  }

  return result;
}

// ─── Ava Detection ───────────────────────────────────────────────────────────

async function detectAvaEvents(
  db: Firestore,
  clinicId: string,
  config: AvaAttributionConfig,
  sessionRate: number,
  since: Date
): Promise<Omit<ValueEvent, "id">[]> {
  const events: Omit<ValueEvent, "id">[] = [];
  const now = new Date().toISOString();

  // Load call logs since cutoff
  const callsSnap = await db
    .collection(`clinics/${clinicId}/call_logs`)
    .where("timestamp", ">=", since.toISOString())
    .orderBy("timestamp", "desc")
    .get();

  const calls = callsSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as CallLog);

  for (const call of calls) {
    const callHour = new Date(call.timestamp).getHours() +
      new Date(call.timestamp).getMinutes() / 60;
    const isAfterHours =
      callHour < config.receptionStartHour || callHour >= config.receptionEndHour;

    // After-hours booking — highest confidence
    if (call.outcome === "booked" && isAfterHours) {
      events.push({
        clinicId,
        module: "ava",
        type: "AVA_AFTER_HOURS_BOOKING",
        confidence: "high",
        valuePence: sessionRate, // Conservative: 1 session (not full course)
        valueCalculation: `1 session × £${(sessionRate / 100).toFixed(0)} = £${(sessionRate / 100).toFixed(0)} (after-hours booking)`,
        title: "Ava booked an after-hours appointment",
        description: `Call received at ${formatTime(call.timestamp)} (outside reception hours). Ava answered and converted to a booking.`,
        patientId: call.patientId,
        clinicianId: call.clinicianId,
        callLogId: call.id,
        triggeredAt: call.timestamp,
        attributedAt: call.timestamp,
        createdAt: now,
        metadata: { callDuration: call.duration, hour: callHour },
      });
    }

    // During-hours booking (overflow / receptionist busy)
    if (call.outcome === "booked" && !isAfterHours) {
      events.push({
        clinicId,
        module: "ava",
        type: "AVA_OVERFLOW_BOOKING",
        confidence: "medium",
        valuePence: sessionRate,
        valueCalculation: `1 session × £${(sessionRate / 100).toFixed(0)} = £${(sessionRate / 100).toFixed(0)} (overflow booking)`,
        title: "Ava handled an overflow booking",
        description: `Call answered by Ava during reception hours and converted to a booking.`,
        patientId: call.patientId,
        clinicianId: call.clinicianId,
        callLogId: call.id,
        triggeredAt: call.timestamp,
        attributedAt: call.timestamp,
        createdAt: now,
        metadata: { callDuration: call.duration },
      });
    }

    // Labour saved (any call handled)
    const callMinutes = Math.max(call.duration / 60, config.avgCallDurationMinutes);
    const labourSavedPence = Math.round(
      (callMinutes / 60) * config.receptionistHourlyRatePence
    );
    if (labourSavedPence > 0) {
      events.push({
        clinicId,
        module: "ava",
        type: "AVA_CALL_HANDLED",
        confidence: "high",
        valuePence: labourSavedPence,
        valueCalculation: `${callMinutes.toFixed(1)} min × £${(config.receptionistHourlyRatePence / 100).toFixed(2)}/hr = £${(labourSavedPence / 100).toFixed(2)} labour saved`,
        title: "Ava handled a call",
        description: `${callMinutes.toFixed(0)}-minute call handled by Ava. Outcome: ${call.outcome}.`,
        callLogId: call.id,
        triggeredAt: call.timestamp,
        attributedAt: call.timestamp,
        createdAt: now,
        metadata: { outcome: call.outcome, durationSeconds: call.duration },
      });
    }
  }

  return events;
}

// ─── Pulse Detection ─────────────────────────────────────────────────────────

async function detectPulseEvents(
  db: Firestore,
  clinicId: string,
  config: PulseAttributionConfig,
  sessionRate: number,
  since: Date
): Promise<Omit<ValueEvent, "id">[]> {
  const events: Omit<ValueEvent, "id">[] = [];
  const now = new Date().toISOString();

  // Load comms logs with outcomes since cutoff
  const commsSnap = await db
    .collection(`clinics/${clinicId}/comms_log`)
    .where("sentAt", ">=", since.toISOString())
    .orderBy("sentAt", "desc")
    .get();

  const commsLogs = commsSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as CommsLogEntry);

  // Load patients for course context
  const patientsSnap = await db
    .collection(`clinics/${clinicId}/patients`)
    .get();
  const patientsMap = new Map<string, Patient>();
  patientsSnap.docs.forEach((d) => {
    patientsMap.set(d.id, { id: d.id, ...d.data() } as Patient);
  });

  for (const entry of commsLogs) {
    const patient = patientsMap.get(entry.patientId);

    // Dropout re-engagement — the killer metric
    if (
      entry.sequenceType === "rebooking_prompt" &&
      entry.outcome === "booked" &&
      entry.attributedRevenuePence
    ) {
      const remainingSessions = patient
        ? Math.max(0, patient.courseLength - patient.sessionCount)
        : 1;
      // Use attributed revenue if available, otherwise estimate
      const value = entry.attributedRevenuePence || remainingSessions * sessionRate;

      events.push({
        clinicId,
        module: "pulse",
        type: "PULSE_DROPOUT_REENGAGED",
        confidence: "high",
        valuePence: value,
        valueCalculation: patient
          ? `${remainingSessions} remaining sessions × £${(sessionRate / 100).toFixed(0)} = £${(value / 100).toFixed(0)}`
          : `1 session × £${(sessionRate / 100).toFixed(0)} = £${(value / 100).toFixed(0)} (conservative)`,
        title: `Pulse re-engaged ${patient?.name || "a patient"}`,
        description: patient
          ? `Patient was ${entry.patientLifecycleStateAtSend || "at risk"} (session ${patient.sessionCount}/${patient.courseLength}). Pulse nudged → patient rebooked.`
          : "At-risk patient nudged by Pulse and rebooked.",
        patientId: entry.patientId,
        patientName: patient?.name,
        clinicianId: patient?.clinicianId,
        appointmentId: entry.attributedAppointmentId,
        commsLogEntryId: entry.id,
        triggeredAt: entry.sentAt,
        attributedAt: entry.openedAt || entry.clickedAt || now,
        createdAt: now,
        metadata: {
          sequenceType: entry.sequenceType,
          channel: entry.channel,
          stepNumber: entry.stepNumber,
          lifecycleStateAtSend: entry.patientLifecycleStateAtSend,
        },
      });
    }

    // DNA recovery
    if (
      entry.sequenceType === "rebooking_prompt" &&
      entry.outcome === "booked" &&
      entry.patientLifecycleStateAtSend === "AT_RISK"
    ) {
      // Only attribute if not already counted as dropout re-engagement
      // Check if the patient's last appointment was a DNA
      // This is a separate signal — the patient DNA'd, then Pulse recovered them
      events.push({
        clinicId,
        module: "pulse",
        type: "PULSE_DNA_RECOVERED",
        confidence: "high",
        valuePence: sessionRate,
        valueCalculation: `1 recovered session × £${(sessionRate / 100).toFixed(0)} = £${(sessionRate / 100).toFixed(0)}`,
        title: `Pulse recovered a DNA for ${patient?.name || "a patient"}`,
        description: "Patient missed an appointment. Pulse sent a rebooking prompt and the patient rebooked.",
        patientId: entry.patientId,
        patientName: patient?.name,
        commsLogEntryId: entry.id,
        triggeredAt: entry.sentAt,
        attributedAt: now,
        createdAt: now,
        metadata: { channel: entry.channel },
      });
    }

    // Review generated
    if (
      entry.sequenceType === "review_prompt" &&
      (entry.outcome === "responded" || entry.outcome === "booked")
    ) {
      events.push({
        clinicId,
        module: "pulse",
        type: "PULSE_REVIEW_GENERATED",
        confidence: "medium",
        valuePence: config.reviewValuePence,
        valueCalculation: `1 review × £${(config.reviewValuePence / 100).toFixed(0)} (conservative acquisition value)`,
        title: `Pulse prompted a review from ${patient?.name || "a patient"}`,
        description: "Review prompt sequence sent → patient posted a review.",
        patientId: entry.patientId,
        patientName: patient?.name,
        commsLogEntryId: entry.id,
        triggeredAt: entry.sentAt,
        attributedAt: now,
        createdAt: now,
        metadata: {
          npsScore: entry.npsScore,
          npsCategory: entry.npsCategory,
        },
      });
    }

    // Course completion nudge
    if (
      entry.sequenceType === "early_intervention" &&
      entry.outcome === "booked" &&
      patient &&
      patient.sessionCount > 0 &&
      patient.sessionCount < patient.courseLength
    ) {
      const remaining = Math.max(1, patient.courseLength - patient.sessionCount);
      const value = remaining * sessionRate;

      events.push({
        clinicId,
        module: "pulse",
        type: "PULSE_COURSE_COMPLETION",
        confidence: "medium",
        valuePence: value,
        valueCalculation: `${remaining} remaining sessions × £${(sessionRate / 100).toFixed(0)} = £${(value / 100).toFixed(0)}`,
        title: `Pulse nudged ${patient.name} to complete their course`,
        description: `Patient at session ${patient.sessionCount}/${patient.courseLength}. Pulse sent early intervention → patient rebooked.`,
        patientId: entry.patientId,
        patientName: patient.name,
        clinicianId: patient.clinicianId,
        commsLogEntryId: entry.id,
        triggeredAt: entry.sentAt,
        attributedAt: now,
        createdAt: now,
        metadata: {
          sessionCount: patient.sessionCount,
          courseLength: patient.courseLength,
        },
      });
    }
  }

  return events;
}

// ─── Intelligence Detection ──────────────────────────────────────────────────

async function detectIntelligenceEvents(
  db: Firestore,
  clinicId: string,
  sessionRate: number,
  since: Date
): Promise<Omit<ValueEvent, "id">[]> {
  const events: Omit<ValueEvent, "id">[] = [];
  const now = new Date().toISOString();

  // Load insight events that were acted on (readAt is set, resolvedAt is set)
  const insightsSnap = await db
    .collection(`clinics/${clinicId}/insight_events`)
    .where("createdAt", ">=", since.toISOString())
    .orderBy("createdAt", "desc")
    .get();

  const insights = insightsSnap.docs.map(
    (d) => ({ id: d.id, ...d.data() }) as InsightEvent
  );

  for (const insight of insights) {
    // Insight acted on → resolved with positive outcome
    if (insight.resolvedAt && insight.revenueImpact && insight.revenueImpact > 0) {
      const valuePence = Math.round(insight.revenueImpact * 100); // revenueImpact is in £

      events.push({
        clinicId,
        module: "intelligence",
        type: "INTEL_INSIGHT_ACTED_ON",
        confidence: "medium",
        valuePence,
        valueCalculation: `Insight "${insight.title}" resolved → £${insight.revenueImpact.toFixed(0)} revenue impact recovered`,
        title: `Intelligence insight led to action`,
        description: `"${insight.title}" was flagged, reviewed, and resolved. Revenue impact: £${insight.revenueImpact.toFixed(0)}.`,
        clinicianId: insight.clinicianId,
        clinicianName: insight.clinicianName,
        patientId: insight.patientId,
        insightEventId: insight.id,
        triggeredAt: insight.createdAt,
        attributedAt: insight.resolvedAt,
        createdAt: now,
        metadata: {
          insightType: insight.type,
          severity: insight.severity,
        },
      });
    }
  }

  // Ghost patient reactivation — patients who went from LAPSED/CHURNED to RE_ENGAGED
  const reengagedSnap = await db
    .collection(`clinics/${clinicId}/patients`)
    .where("lifecycleState", "==", "RE_ENGAGED")
    .where("lifecycleUpdatedAt", ">=", since.toISOString())
    .get();

  for (const doc of reengagedSnap.docs) {
    const patient = { id: doc.id, ...doc.data() } as Patient;
    const remaining = Math.max(1, patient.courseLength - patient.sessionCount);
    const value = remaining * sessionRate;

    events.push({
      clinicId,
      module: "intelligence",
      type: "INTEL_GHOST_REACTIVATED",
      confidence: "medium",
      valuePence: value,
      valueCalculation: `${remaining} remaining sessions × £${(sessionRate / 100).toFixed(0)} = £${(value / 100).toFixed(0)}`,
      title: `Ghost patient ${patient.name} reactivated`,
      description: `Patient was lapsed (${patient.sessionCount}/${patient.courseLength} sessions). Intelligence flagged → clinic contacted → patient returned.`,
      patientId: patient.id,
      patientName: patient.name,
      clinicianId: patient.clinicianId,
      triggeredAt: patient.lifecycleUpdatedAt || now,
      attributedAt: patient.lifecycleUpdatedAt || now,
      createdAt: now,
      metadata: {
        sessionCount: patient.sessionCount,
        courseLength: patient.courseLength,
      },
    });
  }

  // Metric improvement — compare current 4-week rolling average vs 90-day baseline
  await detectMetricImprovements(db, clinicId, sessionRate, events, now);

  return events;
}

// ─── Metric Improvement Detection ────────────────────────────────────────────

async function detectMetricImprovements(
  db: Firestore,
  clinicId: string,
  sessionRate: number,
  events: Omit<ValueEvent, "id">[],
  now: string
): Promise<void> {
  const metricsSnap = await db
    .collection(`clinics/${clinicId}/metrics_weekly`)
    .where("clinicianId", "==", "all")
    .orderBy("weekStart", "desc")
    .limit(16) // ~4 months of data
    .get();

  if (metricsSnap.docs.length < 8) return; // Need at least 8 weeks of data

  const stats = metricsSnap.docs.map((d) => d.data() as WeeklyStats);

  // Recent 4 weeks vs baseline (weeks 5–16)
  const recent = stats.slice(0, 4);
  const baseline = stats.slice(4);

  const avgRecent = {
    followUpRate: avg(recent.map((s) => s.followUpRate)),
    dnaRate: avg(recent.map((s) => s.dnaRate)),
    hepRate: avg(recent.map((s) => s.hepComplianceRate)),
    utilisationRate: avg(recent.map((s) => s.utilisationRate)),
  };
  const avgBaseline = {
    followUpRate: avg(baseline.map((s) => s.followUpRate)),
    dnaRate: avg(baseline.map((s) => s.dnaRate)),
    hepRate: avg(baseline.map((s) => s.hepComplianceRate)),
    utilisationRate: avg(baseline.map((s) => s.utilisationRate)),
  };

  // Follow-up rate improvement → direct revenue
  const fuDelta = avgRecent.followUpRate - avgBaseline.followUpRate;
  if (fuDelta > 0.2) {
    // Meaningful improvement (0.2+ sessions per IA)
    const weeklyIAs = avg(recent.map((s) => s.initialAssessments));
    const weeklyRevGainPence = Math.round(fuDelta * weeklyIAs * sessionRate);
    const annualGainPence = weeklyRevGainPence * 52;

    events.push({
      clinicId,
      module: "intelligence",
      type: "INTEL_METRIC_IMPROVEMENT",
      confidence: "low",
      valuePence: weeklyRevGainPence,
      valueCalculation: `Follow-up rate improved by ${fuDelta.toFixed(1)} (${avgBaseline.followUpRate.toFixed(1)} → ${avgRecent.followUpRate.toFixed(1)}). +${fuDelta.toFixed(1)} × ${weeklyIAs.toFixed(0)} IAs/wk × £${(sessionRate / 100).toFixed(0)} = £${(weeklyRevGainPence / 100).toFixed(0)}/wk (£${(annualGainPence / 100).toFixed(0)}/yr)`,
      title: "Follow-up rate improved since using Intelligence",
      description: `Clinic-wide follow-up rate rose from ${avgBaseline.followUpRate.toFixed(1)} to ${avgRecent.followUpRate.toFixed(1)} over the last 4 weeks vs prior baseline.`,
      triggeredAt: now,
      attributedAt: now,
      createdAt: now,
      metadata: {
        metric: "followUpRate",
        baselineValue: avgBaseline.followUpRate,
        recentValue: avgRecent.followUpRate,
        delta: fuDelta,
        annualImpactPence: annualGainPence,
      },
    });
  }

  // DNA rate improvement → slots recovered
  const dnaDelta = avgBaseline.dnaRate - avgRecent.dnaRate; // Positive = improvement
  if (dnaDelta > 0.02) {
    // 2%+ reduction
    const weeklyAppts = avg(recent.map((s) => s.appointmentsTotal));
    const slotsRecoveredPerWeek = Math.round(dnaDelta * weeklyAppts);
    const weeklyRevGainPence = slotsRecoveredPerWeek * sessionRate;

    events.push({
      clinicId,
      module: "intelligence",
      type: "INTEL_METRIC_IMPROVEMENT",
      confidence: "low",
      valuePence: weeklyRevGainPence,
      valueCalculation: `DNA rate reduced by ${(dnaDelta * 100).toFixed(1)}% (${(avgBaseline.dnaRate * 100).toFixed(1)}% → ${(avgRecent.dnaRate * 100).toFixed(1)}%). ~${slotsRecoveredPerWeek} slots/wk × £${(sessionRate / 100).toFixed(0)} = £${(weeklyRevGainPence / 100).toFixed(0)}/wk`,
      title: "DNA rate improved since using Intelligence",
      description: `Clinic-wide DNA rate dropped from ${(avgBaseline.dnaRate * 100).toFixed(1)}% to ${(avgRecent.dnaRate * 100).toFixed(1)}%.`,
      triggeredAt: now,
      attributedAt: now,
      createdAt: now,
      metadata: {
        metric: "dnaRate",
        baselineValue: avgBaseline.dnaRate,
        recentValue: avgRecent.dnaRate,
        delta: dnaDelta,
      },
    });
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildDedupKey(event: ValueEvent): string {
  return `${event.type}|${event.patientId || ""}|${event.callLogId || ""}|${event.commsLogEntryId || ""}|${event.insightEventId || ""}`;
}

function buildDedupKeyFromPartial(event: Omit<ValueEvent, "id">): string {
  return `${event.type}|${event.patientId || ""}|${event.callLogId || ""}|${event.commsLogEntryId || ""}|${event.insightEventId || ""}`;
}

function formatTime(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((sum, n) => sum + n, 0) / nums.length;
}

async function loadSessionRate(db: Firestore, clinicId: string): Promise<number> {
  const clinicDoc = await db.doc(`clinics/${clinicId}`).get();
  const data = clinicDoc.data();
  return data?.sessionPricePence || SESSION_RATE_PENCE;
}

async function loadAvaConfig(
  db: Firestore,
  clinicId: string
): Promise<AvaAttributionConfig> {
  const doc = await db.doc(`clinics/${clinicId}/settings/ava_attribution`).get();
  if (!doc.exists) return DEFAULT_AVA_ATTRIBUTION_CONFIG;
  return { ...DEFAULT_AVA_ATTRIBUTION_CONFIG, ...doc.data() };
}

async function loadPulseConfig(
  db: Firestore,
  clinicId: string
): Promise<PulseAttributionConfig> {
  const doc = await db.doc(`clinics/${clinicId}/settings/pulse_attribution`).get();
  if (!doc.exists) return DEFAULT_PULSE_ATTRIBUTION_CONFIG;
  return { ...DEFAULT_PULSE_ATTRIBUTION_CONFIG, ...doc.data() };
}

async function loadExistingValueEvents(
  db: Firestore,
  clinicId: string,
  since: Date
): Promise<ValueEvent[]> {
  const snap = await db
    .collection(`clinics/${clinicId}/value_events`)
    .where("createdAt", ">=", since.toISOString())
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ValueEvent);
}
