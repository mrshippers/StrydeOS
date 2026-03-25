/**
 * Value Summary Computation
 *
 * Aggregates value_events into period summaries (monthly / quarterly).
 * Written to clinics/{clinicId}/value_summaries/{period}
 *
 * The summary powers the ROI card: "StrydeOS generated £X this month (Y× your subscription)."
 */

import type { Firestore } from "firebase-admin/firestore";
import type {
  ValueEvent,
  ValueSummary,
  ModuleValueSummary,
  ValueModule,
  ValueEventType,
} from "@/types/value-ledger";

// ─── Compute Monthly Summary ─────────────────────────────────────────────────

export async function computeValueSummary(
  db: Firestore,
  clinicId: string,
  year: number,
  month: number
): Promise<ValueSummary> {
  const periodStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const periodEnd = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
  const periodKey = `${year}-${String(month).padStart(2, "0")}`;

  // Load all value events for this period
  const eventsSnap = await db
    .collection(`clinics/${clinicId}/value_events`)
    .where("attributedAt", ">=", periodStart)
    .where("attributedAt", "<", periodEnd)
    .orderBy("attributedAt", "asc")
    .get();

  const events = eventsSnap.docs.map(
    (d) => ({ id: d.id, ...d.data() }) as ValueEvent
  );

  // Load subscription cost from clinic profile
  const clinicDoc = await db.doc(`clinics/${clinicId}`).get();
  const clinicData = clinicDoc.data();
  const subscriptionCostPence = clinicData?.billing?.monthlyPricePence || 40000; // Default £400

  // Build per-module summaries
  const ava = buildModuleSummary("ava", events);
  const pulse = buildModuleSummary("pulse", events);
  const intelligence = buildModuleSummary("intelligence", events);

  const totalValuePence = ava.totalValuePence + pulse.totalValuePence + intelligence.totalValuePence;
  const highConfidenceValuePence =
    ava.highConfidenceValuePence + pulse.highConfidenceValuePence + intelligence.highConfidenceValuePence;

  // Headline stats
  const patientsReengaged = events.filter(
    (e) => e.type === "PULSE_DROPOUT_REENGAGED" || e.type === "PULSE_DNA_RECOVERED"
  ).length;
  const callsHandled = events.filter((e) => e.type === "AVA_CALL_HANDLED").length;
  const bookingsFromAva = events.filter(
    (e) => e.type === "AVA_AFTER_HOURS_BOOKING" || e.type === "AVA_OVERFLOW_BOOKING"
  ).length;
  const reviewsGenerated = events.filter(
    (e) => e.type === "PULSE_REVIEW_GENERATED"
  ).length;
  const insightsActedOn = events.filter(
    (e) => e.type === "INTEL_INSIGHT_ACTED_ON"
  ).length;
  const ghostsReactivated = events.filter(
    (e) => e.type === "INTEL_GHOST_REACTIVATED"
  ).length;

  const summary: ValueSummary = {
    id: periodKey,
    clinicId,
    periodType: "month",
    periodStart,
    periodEnd,
    totalValuePence,
    totalEvents: events.length,
    highConfidenceValuePence,
    ava,
    pulse,
    intelligence,
    subscriptionCostPence,
    roiMultiple: subscriptionCostPence > 0 ? totalValuePence / subscriptionCostPence : 0,
    netValuePence: totalValuePence - subscriptionCostPence,
    patientsReengaged,
    callsHandled,
    bookingsFromAva,
    reviewsGenerated,
    insightsActedOn,
    ghostsReactivated,
    computedAt: new Date().toISOString(),
  };

  // Write to Firestore
  await db
    .doc(`clinics/${clinicId}/value_summaries/${periodKey}`)
    .set(summary);

  return summary;
}

// ─── Compute Quarterly Summary ───────────────────────────────────────────────

export async function computeQuarterlyValueSummary(
  db: Firestore,
  clinicId: string,
  year: number,
  quarter: number
): Promise<ValueSummary> {
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = startMonth + 3;
  const periodKey = `${year}-Q${quarter}`;
  const periodStart = `${year}-${String(startMonth).padStart(2, "0")}-01`;
  const endYear = endMonth > 12 ? year + 1 : year;
  const endM = endMonth > 12 ? endMonth - 12 : endMonth;
  const periodEnd = `${endYear}-${String(endM).padStart(2, "0")}-01`;

  // Load monthly summaries for this quarter
  const monthKeys = Array.from({ length: 3 }, (_, i) =>
    `${year}-${String(startMonth + i).padStart(2, "0")}`
  );

  const monthlySummaries: ValueSummary[] = [];
  for (const key of monthKeys) {
    const doc = await db.doc(`clinics/${clinicId}/value_summaries/${key}`).get();
    if (doc.exists) {
      monthlySummaries.push(doc.data() as ValueSummary);
    }
  }

  // Aggregate
  const totalValuePence = monthlySummaries.reduce((s, m) => s + m.totalValuePence, 0);
  const highConfidenceValuePence = monthlySummaries.reduce(
    (s, m) => s + m.highConfidenceValuePence, 0
  );
  const totalEvents = monthlySummaries.reduce((s, m) => s + m.totalEvents, 0);
  const subscriptionCostPence = monthlySummaries.reduce(
    (s, m) => s + m.subscriptionCostPence, 0
  );

  const summary: ValueSummary = {
    id: periodKey,
    clinicId,
    periodType: "quarter",
    periodStart,
    periodEnd,
    totalValuePence,
    totalEvents,
    highConfidenceValuePence,
    ava: mergeModuleSummaries("ava", monthlySummaries.map((m) => m.ava)),
    pulse: mergeModuleSummaries("pulse", monthlySummaries.map((m) => m.pulse)),
    intelligence: mergeModuleSummaries("intelligence", monthlySummaries.map((m) => m.intelligence)),
    subscriptionCostPence,
    roiMultiple: subscriptionCostPence > 0 ? totalValuePence / subscriptionCostPence : 0,
    netValuePence: totalValuePence - subscriptionCostPence,
    patientsReengaged: monthlySummaries.reduce((s, m) => s + m.patientsReengaged, 0),
    callsHandled: monthlySummaries.reduce((s, m) => s + m.callsHandled, 0),
    bookingsFromAva: monthlySummaries.reduce((s, m) => s + m.bookingsFromAva, 0),
    reviewsGenerated: monthlySummaries.reduce((s, m) => s + m.reviewsGenerated, 0),
    insightsActedOn: monthlySummaries.reduce((s, m) => s + m.insightsActedOn, 0),
    ghostsReactivated: monthlySummaries.reduce((s, m) => s + m.ghostsReactivated, 0),
    computedAt: new Date().toISOString(),
  };

  await db
    .doc(`clinics/${clinicId}/value_summaries/${periodKey}`)
    .set(summary);

  return summary;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildModuleSummary(
  module: ValueModule,
  events: ValueEvent[]
): ModuleValueSummary {
  const moduleEvents = events.filter((e) => e.module === module);
  const highConfidence = moduleEvents.filter((e) => e.confidence === "high");

  // Find top event type
  const typeCounts = new Map<ValueEventType, number>();
  for (const e of moduleEvents) {
    typeCounts.set(e.type, (typeCounts.get(e.type) || 0) + 1);
  }
  let topType: ValueEventType = moduleEvents[0]?.type || ("AVA_CALL_HANDLED" as ValueEventType);
  let topCount = 0;
  for (const [type, count] of typeCounts) {
    if (count > topCount) {
      topType = type;
      topCount = count;
    }
  }

  return {
    module,
    totalValuePence: moduleEvents.reduce((s, e) => s + e.valuePence, 0),
    eventCount: moduleEvents.length,
    highConfidenceValuePence: highConfidence.reduce((s, e) => s + e.valuePence, 0),
    highConfidenceCount: highConfidence.length,
    topEventType: topType,
    topEventTypeCount: topCount,
  };
}

function mergeModuleSummaries(
  module: ValueModule,
  summaries: ModuleValueSummary[]
): ModuleValueSummary {
  if (summaries.length === 0) {
    return {
      module,
      totalValuePence: 0,
      eventCount: 0,
      highConfidenceValuePence: 0,
      highConfidenceCount: 0,
      topEventType: "AVA_CALL_HANDLED",
      topEventTypeCount: 0,
    };
  }

  // Find the most common top event type across months
  const typeCounts = new Map<ValueEventType, number>();
  for (const s of summaries) {
    typeCounts.set(
      s.topEventType,
      (typeCounts.get(s.topEventType) || 0) + s.topEventTypeCount
    );
  }
  let topType = summaries[0].topEventType;
  let topCount = 0;
  for (const [type, count] of typeCounts) {
    if (count > topCount) {
      topType = type;
      topCount = count;
    }
  }

  return {
    module,
    totalValuePence: summaries.reduce((s, m) => s + m.totalValuePence, 0),
    eventCount: summaries.reduce((s, m) => s + m.eventCount, 0),
    highConfidenceValuePence: summaries.reduce(
      (s, m) => s + m.highConfidenceValuePence, 0
    ),
    highConfidenceCount: summaries.reduce(
      (s, m) => s + m.highConfidenceCount, 0
    ),
    topEventType: topType,
    topEventTypeCount: topCount,
  };
}
