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
    .collection(`clinics/${clinicId}/calls`)
    .where("timestamp", ">=", since.toISOString())
    .orderBy("timestamp", "desc")
    .get();

  const calls = callsSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as CallLog);

  for (const call of calls) {
    const callHour = new Date(call.timestamp).getHours() +
      new Date(call.timestamp).getMinutes() / 60;
    const isAfterHours =
      callHour < config.receptionStartHour || callHour >= config.receptionEndHour;
    let generatedBookingEvent = false;

    // After-hours booking — highest confidence
    if (call.outcome === "booked" && isAfterHours) {
      generatedBookingEvent = true;
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
      generatedBookingEvent = true;
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

    // Labour saved — only for NON-booking calls to prevent double-counting.
    // Booking calls already attribute full session value (which exceeds labour saved).
    if (!generatedBookingEvent) {
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

  // Load recent appointments for DNA verification + attribution window checks
  const appointmentsSnap = await db
    .collection(`clinics/${clinicId}/appointments`)
    .where("dateTime", ">=", since.toISOString())
    .orderBy("dateTime", "desc")
    .get();
  const appointmentsByPatient = new Map<string, Appointment[]>();
  for (const d of appointmentsSnap.docs) {
    const appt = { id: d.id, ...d.data() } as Appointment;
    const existing = appointmentsByPatient.get(appt.patientId) || [];
    existing.push(appt);
    appointmentsByPatient.set(appt.patientId, existing);
  }

  // Track which patient+commsEntry combos have been attributed to prevent double-counting
  const attributedCommsEntries = new Set<string>();

  for (const entry of commsLogs) {
    const patient = patientsMap.get(entry.patientId);

    // ── Attribution window check ──
    // Only count if the rebooking happened within the configured window after nudge
    if (entry.outcome === "booked" && entry.attributedAppointmentId) {
      const windowMs = config.attributionWindowDays * 24 * 60 * 60 * 1000;
      const sentTime = new Date(entry.sentAt).getTime();
      const bookedAppt = appointmentsByPatient.get(entry.patientId)?.find(
        (a) => a.id === entry.attributedAppointmentId
      );
      if (bookedAppt) {
        const bookedTime = new Date(bookedAppt.createdAt).getTime();
        if (bookedTime - sentTime > windowMs) {
          // Booking happened outside attribution window — skip
          continue;
        }
      }
    }

    // ── Determine if this was a DNA recovery vs general dropout ──
    // Check if patient's most recent appointment before the nudge was a DNA
    const patientAppts = appointmentsByPatient.get(entry.patientId) || [];
    const apptBeforeNudge = patientAppts
      .filter((a) => new Date(a.dateTime) < new Date(entry.sentAt))
      .sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime())[0];
    const wasDna = apptBeforeNudge?.status === "dna";

    // Dropout re-engagement OR DNA recovery — MUTUALLY EXCLUSIVE
    if (
      entry.sequenceType === "rebooking_prompt" &&
      entry.outcome === "booked" &&
      !attributedCommsEntries.has(entry.id)
    ) {
      attributedCommsEntries.add(entry.id);

      if (wasDna) {
        // DNA recovery — conservative: 1 session only (they missed one, they rebooked one)
        events.push({
          clinicId,
          module: "pulse",
          type: "PULSE_DNA_RECOVERED",
          confidence: "high",
          valuePence: sessionRate,
          valueCalculation: `1 recovered session × £${(sessionRate / 100).toFixed(0)} = £${(sessionRate / 100).toFixed(0)}`,
          title: `Pulse recovered a DNA for ${patient?.name || "a patient"}`,
          description: `Patient DNA'd their last appointment. Pulse sent a rebooking prompt → patient rebooked.`,
          patientId: entry.patientId,
          patientName: patient?.name,
          clinicianId: patient?.clinicianId,
          appointmentId: entry.attributedAppointmentId,
          commsLogEntryId: entry.id,
          triggeredAt: entry.sentAt,
          attributedAt: entry.openedAt || entry.clickedAt || now,
          createdAt: now,
          metadata: {
            channel: entry.channel,
            dnaAppointmentId: apptBeforeNudge?.id,
            lifecycleStateAtSend: entry.patientLifecycleStateAtSend,
          },
        });
      } else {
        // General dropout re-engagement — conservative: MIN(1 session, remaining sessions)
        // Use 1 session as default since we only know they rebooked once, not that they'll
        // complete the full remaining course. The actual revenue will be tracked if they do.
        const conservativeValue = entry.attributedRevenuePence || sessionRate;

        events.push({
          clinicId,
          module: "pulse",
          type: "PULSE_DROPOUT_REENGAGED",
          confidence: "high",
          valuePence: conservativeValue,
          valueCalculation: patient
            ? `1 confirmed rebooked session × £${(sessionRate / 100).toFixed(0)} = £${(conservativeValue / 100).toFixed(0)} (session ${patient.sessionCount}/${patient.courseLength})`
            : `1 session × £${(sessionRate / 100).toFixed(0)} = £${(conservativeValue / 100).toFixed(0)} (conservative)`,
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
    }

    // Review generated — only count actual review responses, not just "responded"
    // to any message. Check npsScore exists (confirms it was an actual review).
    if (
      entry.sequenceType === "review_prompt" &&
      entry.outcome === "responded" &&
      entry.npsScore != null &&
      !attributedCommsEntries.has(entry.id)
    ) {
      attributedCommsEntries.add(entry.id);
      events.push({
        clinicId,
        module: "pulse",
        type: "PULSE_REVIEW_GENERATED",
        confidence: "medium",
        valuePence: config.reviewValuePence,
        valueCalculation: `1 review × £${(config.reviewValuePence / 100).toFixed(0)} (conservative acquisition value)`,
        title: `Pulse prompted a review from ${patient?.name || "a patient"}`,
        description: `Review prompt sent → patient responded with NPS score of ${entry.npsScore}/10.`,
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

    // Course completion nudge — conservative: attribute 1 session, not remaining course
    if (
      entry.sequenceType === "early_intervention" &&
      entry.outcome === "booked" &&
      patient &&
      patient.sessionCount > 0 &&
      patient.sessionCount < patient.courseLength &&
      !attributedCommsEntries.has(entry.id)
    ) {
      attributedCommsEntries.add(entry.id);

      events.push({
        clinicId,
        module: "pulse",
        type: "PULSE_COURSE_COMPLETION",
        confidence: "medium",
        valuePence: sessionRate, // Conservative: 1 session confirmed, not full remaining
        valueCalculation: `1 rebooked session × £${(sessionRate / 100).toFixed(0)} = £${(sessionRate / 100).toFixed(0)} (${patient.courseLength - patient.sessionCount} sessions remaining in course)`,
        title: `Pulse nudged ${patient.name} to continue their course`,
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
  // BUT only attribute to Intelligence if Pulse didn't nudge them (otherwise Pulse gets credit)
  const reengagedSnap = await db
    .collection(`clinics/${clinicId}/patients`)
    .where("lifecycleState", "==", "RE_ENGAGED")
    .where("lifecycleUpdatedAt", ">=", since.toISOString())
    .get();

  // Load recent Pulse comms to check if reactivation was Pulse-driven
  const recentCommsSnap = await db
    .collection(`clinics/${clinicId}/comms_log`)
    .where("sentAt", ">=", since.toISOString())
    .where("outcome", "==", "booked")
    .get();
  const pulseAttributedPatients = new Set(
    recentCommsSnap.docs.map((d) => d.data().patientId as string)
  );

  for (const d of reengagedSnap.docs) {
    const patient = { id: d.id, ...d.data() } as Patient;

    // Skip if Pulse already got credit for this patient's reactivation
    if (pulseAttributedPatients.has(patient.id)) continue;

    // Conservative: 1 session (they came back once, not guaranteed to finish course)
    events.push({
      clinicId,
      module: "intelligence",
      type: "INTEL_GHOST_REACTIVATED",
      confidence: "medium",
      valuePence: sessionRate,
      valueCalculation: `1 reactivated session × £${(sessionRate / 100).toFixed(0)} = £${(sessionRate / 100).toFixed(0)} (session ${patient.sessionCount + 1}/${patient.courseLength})`,
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
  // Only fires once per quarter per metric to prevent repeated attribution
  await detectMetricImprovements(db, clinicId, sessionRate, events, now, since);

  return events;
}

// ─── Metric Improvement Detection ────────────────────────────────────────────

async function detectMetricImprovements(
  db: Firestore,
  clinicId: string,
  sessionRate: number,
  events: Omit<ValueEvent, "id">[],
  now: string,
  since: Date
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

  // Check if we already fired a metric improvement event this quarter.
  // Only fire once per quarter per metric — otherwise it triggers every cycle.
  const quarterStart = getQuarterStart(new Date());
  const existingImprovements = await db
    .collection(`clinics/${clinicId}/value_events`)
    .where("type", "==", "INTEL_METRIC_IMPROVEMENT")
    .where("createdAt", ">=", quarterStart)
    .get();
  const alreadyFiredMetrics = new Set(
    existingImprovements.docs.map((d) => d.data().metadata?.metric as string)
  );

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
  // Only fire if: (a) meaningful delta, (b) not already fired this quarter
  const fuDelta = avgRecent.followUpRate - avgBaseline.followUpRate;
  if (fuDelta > 0.3 && !alreadyFiredMetrics.has("followUpRate")) {
    // Raised threshold to 0.3 (from 0.2) — needs to be a genuine shift, not noise
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
        quarterFired: quarterStart,
      },
    });
  }

  // DNA rate improvement → slots recovered
  const dnaDelta = avgBaseline.dnaRate - avgRecent.dnaRate; // Positive = improvement
  if (dnaDelta > 0.03 && !alreadyFiredMetrics.has("dnaRate")) {
    // Raised threshold to 3% (from 2%) — needs to be genuine, not week-to-week noise
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
        quarterFired: quarterStart,
      },
    });
  }

  // Utilisation improvement → capacity recovered
  const utilDelta = avgRecent.utilisationRate - avgBaseline.utilisationRate;
  if (utilDelta > 0.05 && !alreadyFiredMetrics.has("utilisationRate")) {
    // 5%+ utilisation gain
    const weeklyCapacity = avg(recent.map((s) => s.appointmentsTotal)) / Math.max(avgRecent.utilisationRate, 0.01);
    const slotsGained = Math.round(utilDelta * weeklyCapacity);
    const weeklyRevGainPence = slotsGained * sessionRate;

    events.push({
      clinicId,
      module: "intelligence",
      type: "INTEL_METRIC_IMPROVEMENT",
      confidence: "low",
      valuePence: weeklyRevGainPence,
      valueCalculation: `Utilisation improved by ${(utilDelta * 100).toFixed(1)}% (${(avgBaseline.utilisationRate * 100).toFixed(0)}% → ${(avgRecent.utilisationRate * 100).toFixed(0)}%). ~${slotsGained} extra slots/wk × £${(sessionRate / 100).toFixed(0)} = £${(weeklyRevGainPence / 100).toFixed(0)}/wk`,
      title: "Utilisation rate improved since using Intelligence",
      description: `Clinic-wide utilisation rose from ${(avgBaseline.utilisationRate * 100).toFixed(0)}% to ${(avgRecent.utilisationRate * 100).toFixed(0)}%.`,
      triggeredAt: now,
      attributedAt: now,
      createdAt: now,
      metadata: {
        metric: "utilisationRate",
        baselineValue: avgBaseline.utilisationRate,
        recentValue: avgRecent.utilisationRate,
        delta: utilDelta,
        quarterFired: quarterStart,
      },
    });
  }
}

/** Returns ISO string for the start of the current quarter */
function getQuarterStart(date: Date): string {
  const month = date.getMonth();
  const quarterMonth = month - (month % 3);
  return `${date.getFullYear()}-${String(quarterMonth + 1).padStart(2, "0")}-01`;
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
