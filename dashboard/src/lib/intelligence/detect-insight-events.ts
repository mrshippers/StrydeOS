import type { Firestore } from "firebase-admin/firestore";
import type { InsightEvent, InsightConfig } from "@/types/insight-events";
import { DEFAULT_INSIGHT_CONFIG, OWNER_EVENTS } from "@/types/insight-events";

interface DetectionResult {
  clinicId: string;
  eventsCreated: number;
  eventsSkipped: number;
  errors: string[];
}

// Firestore document shape — superset of fields we access
type FsDoc = Record<string, unknown> & { id: string };

/**
 * Detect insight events for a single clinic.
 * Reads metrics_weekly, patients, clinicians, and reviews.
 * Writes new InsightEvent documents with deduplication.
 */
export async function detectInsightEvents(
  db: Firestore,
  clinicId: string
): Promise<DetectionResult> {
  const result: DetectionResult = {
    clinicId,
    eventsCreated: 0,
    eventsSkipped: 0,
    errors: [],
  };

  // Load config (or defaults)
  const configDoc = await db
    .doc(`clinics/${clinicId}/settings/insight_config`)
    .get();
  const config: InsightConfig = configDoc.exists
    ? { ...DEFAULT_INSIGHT_CONFIG, ...(configDoc.data() as Partial<InsightConfig>) }
    : DEFAULT_INSIGHT_CONFIG;

  if (!config.enabled) return result;

  // Load current and previous week metrics
  const metricsSnap = await db
    .collection(`clinics/${clinicId}/metrics_weekly`)
    .orderBy("weekStart", "desc")
    .limit(20)
    .get();

  const allMetrics: FsDoc[] = metricsSnap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));

  // Load clinicians
  const cliniciansSnap = await db
    .collection(`clinics/${clinicId}/clinicians`)
    .where("active", "==", true)
    .get();
  const clinicians = cliniciansSnap.docs.map((d) => ({
    id: d.id,
    name: d.data().name as string,
  }));

  // Load active (non-discharged) patients only — discharged patients are skipped by all checks
  const patientsSnap = await db
    .collection(`clinics/${clinicId}/patients`)
    .where("discharged", "==", false)
    .get();
  const patients: FsDoc[] = patientsSnap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));

  // Load recent appointments (last 14 days for DNA streak)
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const appointmentsSnap = await db
    .collection(`clinics/${clinicId}/appointments`)
    .where("dateTime", ">=", fourteenDaysAgo.toISOString())
    .get();
  const recentAppointments: FsDoc[] = appointmentsSnap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));

  // Load recent NPS reviews for detractor detection
  const reviewsSnap = await db
    .collection(`clinics/${clinicId}/reviews`)
    .orderBy("date", "desc")
    .limit(20)
    .get();
  const recentReviews: FsDoc[] = reviewsSnap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));

  // Load existing events for deduplication (last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const existingEventsSnap = await db
    .collection(`clinics/${clinicId}/insight_events`)
    .where("createdAt", ">=", sevenDaysAgo.toISOString())
    .get();
  const existingEvents: FsDoc[] = existingEventsSnap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));

  const newEvents: Omit<InsightEvent, "id">[] = [];

  // ── Per-clinician metrics checks ─────────────────────────────────────────

  for (const clinician of clinicians) {
    const clinicianMetrics = allMetrics.filter(
      (m) => m.clinicianId === clinician.id
    );
    if (clinicianMetrics.length === 0) continue;

    const current = clinicianMetrics[0]; // most recent (desc order)
    const previous = clinicianMetrics.length > 1 ? clinicianMetrics[1] : null;

    // 1. CLINICIAN_FOLLOWUP_DROP
    if (previous) {
      const curRate = Number(current.followUpRate ?? 0);
      const prevRate = Number(previous.followUpRate ?? 0);
      if (prevRate > 0) {
        const drop = (prevRate - curRate) / prevRate;
        if (drop >= config.followUpDropThreshold) {
          newEvents.push({
            type: "CLINICIAN_FOLLOWUP_DROP",
            clinicId,
            clinicianId: clinician.id,
            clinicianName: clinician.name,
            severity: drop >= 0.20 ? "critical" : "warning",
            title: `${clinician.name}'s follow-up rate dropped ${Math.round(drop * 100)}% this week (from ${prevRate.toFixed(1)} to ${curRate.toFixed(1)})`,
            description: `Week-on-week decline exceeds your ${Math.round(config.followUpDropThreshold * 100)}% threshold. This could indicate scheduling gaps or discharge decisions changing.`,
            suggestedAction: `Review ${clinician.name}'s schedule for this week. Check if recent discharges were premature or if patients are being lost between sessions.`,
            observationalNote: `This is an observation, not a judgement. There may be good clinical reasons — e.g. a run of single-session cases or planned discharges. Worth a conversation.`,
            actionTarget: "owner",
            createdAt: new Date().toISOString(),
            metadata: { currentRate: curRate, previousRate: prevRate, dropPercent: Math.round(drop * 100) },
          });
        }
      }
    }

    // 2. HIGH_DNA_STREAK
    const clinicianDNAs = recentAppointments.filter(
      (a) => a.clinicianId === clinician.id && a.status === "dna"
    );
    if (clinicianDNAs.length >= config.dnaStreakThreshold) {
      newEvents.push({
        type: "HIGH_DNA_STREAK",
        clinicId,
        clinicianId: clinician.id,
        clinicianName: clinician.name,
        severity: clinicianDNAs.length >= 5 ? "critical" : "warning",
        title: `${clinician.name} had ${clinicianDNAs.length} DNAs in the last 14 days`,
        description: `${clinicianDNAs.length} no-shows in a rolling 14-day window exceeds your threshold of ${config.dnaStreakThreshold}. Pattern may indicate reminder gaps or scheduling friction.`,
        suggestedAction: `Check if SMS reminders are being sent to ${clinician.name}'s patients. Review the specific time slots — DNAs often cluster around early morning or late afternoon.`,
        observationalNote: `DNAs are rarely the clinician's fault. This is flagged so you can check whether reminders are firing and whether specific slots are problematic.`,
        actionTarget: "owner",
        createdAt: new Date().toISOString(),
        metadata: { dnaCount: clinicianDNAs.length, period: "14d" },
      });
    }

    // 3. UTILISATION_BELOW_TARGET
    if (clinicianMetrics.length >= 2) {
      const recentTwo = clinicianMetrics.slice(0, 2);
      const bothBelow = recentTwo.every(
        (m) => Number(m.utilisationRate ?? 0) < config.utilisationFloor
      );
      if (bothBelow) {
        const curUtil = Number(current.utilisationRate ?? 0);
        newEvents.push({
          type: "UTILISATION_BELOW_TARGET",
          clinicId,
          clinicianId: clinician.id,
          clinicianName: clinician.name,
          severity: curUtil < 0.60 ? "critical" : "warning",
          title: `${clinician.name}'s utilisation has been below ${Math.round(config.utilisationFloor * 100)}% for 2+ consecutive weeks (currently ${Math.round(curUtil * 100)}%)`,
          description: `Sustained low utilisation means available appointment slots aren't being filled. This directly impacts revenue.`,
          suggestedAction: `Review ${clinician.name}'s availability against demand. Consider adjusting their schedule or running a reactivation campaign for lapsed patients.`,
          actionTarget: "owner",
          createdAt: new Date().toISOString(),
          metadata: { currentUtilisation: curUtil, threshold: config.utilisationFloor },
        });
      }
    }

    // 4. COURSE_COMPLETION_WIN (positive)
    const curCompletion = Number(current.courseCompletionRate ?? 0);
    if (curCompletion >= config.courseCompletionCelebrate) {
      newEvents.push({
        type: "COURSE_COMPLETION_WIN",
        clinicId,
        clinicianId: clinician.id,
        clinicianName: clinician.name,
        severity: "positive",
        title: `${clinician.name} hit ${Math.round(curCompletion * 100)}% course completion this week`,
        description: `Course completion above ${Math.round(config.courseCompletionCelebrate * 100)}% means patients are completing their treatment plans. Great clinical outcomes and revenue retention.`,
        suggestedAction: `Acknowledge ${clinician.name}'s performance. Consider what's working well in their approach that could be shared across the team.`,
        actionTarget: "owner",
        createdAt: new Date().toISOString(),
        metadata: { completionRate: curCompletion },
      });
    }
  }

  // ── Clinic-wide checks ───────────────────────────────────────────────────

  // 5. HEP_COMPLIANCE_LOW (clinic-wide "all" aggregates)
  const allClinicMetrics = allMetrics.filter((m) => m.clinicianId === "all");
  if (allClinicMetrics.length > 0) {
    const latestAll = allClinicMetrics[0];
    const hepRate = Number(latestAll.hepComplianceRate ?? latestAll.hepRate ?? 0);
    if (hepRate > 0 && hepRate < config.hepComplianceFloor) {
      newEvents.push({
        type: "HEP_COMPLIANCE_LOW",
        clinicId,
        severity: hepRate < 0.30 ? "critical" : "warning",
        title: `Clinic-wide HEP compliance is at ${Math.round(hepRate * 100)}% — below your ${Math.round(config.hepComplianceFloor * 100)}% target`,
        description: `Fewer than half of patients are being assigned exercise programmes. This impacts outcomes, treatment duration, and patient satisfaction.`,
        suggestedAction: `Review which clinicians are consistently assigning HEP. Set a team-wide goal and discuss during your next clinical meeting.`,
        actionTarget: "owner",
        createdAt: new Date().toISOString(),
        metadata: { hepRate, threshold: config.hepComplianceFloor },
      });
    }
  }

  // 6. REVENUE_LEAK_DETECTED
  const midProgrammeDropouts = patients.filter((p) => {
    if (p.discharged) return false;
    if (!p.lastSessionDate) return false;
    const sessionCount = Number(p.sessionCount ?? 0);
    if (sessionCount >= config.maxProgrammeLength) return false; // completed
    if (sessionCount < 1) return false; // never started
    if (p.nextSessionDate) return false; // has future booking

    const daysSinceLastSession = Math.floor(
      (Date.now() - new Date(p.lastSessionDate as string).getTime()) / 86400000
    );
    return daysSinceLastSession > config.dropoutRiskDays;
  });

  if (midProgrammeDropouts.length > 0) {
    const totalLeaked = midProgrammeDropouts.reduce((sum, p) => {
      const sessionsCompleted = Number(p.sessionCount ?? 0);
      const remaining = Math.max(0, config.maxProgrammeLength - sessionsCompleted);
      return sum + remaining * config.revenuePerSession;
    }, 0);

    const leakedRounded = Math.floor(totalLeaked); // round DOWN (conservative)

    if (leakedRounded > 0) {
      // Group by clinician for the title
      const byClinician = new Map<string, number>();
      for (const p of midProgrammeDropouts) {
        const cId = p.clinicianId as string;
        byClinician.set(cId, (byClinician.get(cId) ?? 0) + 1);
      }

      // Find clinician name for the largest group
      let topClinicianName = "your clinicians";
      let topCount = 0;
      for (const [cId, count] of byClinician) {
        if (count > topCount) {
          topCount = count;
          const c = clinicians.find((cl) => cl.id === cId);
          if (c) topClinicianName = c.name;
        }
      }

      newEvents.push({
        type: "REVENUE_LEAK_DETECTED",
        clinicId,
        severity: leakedRounded > 500 ? "critical" : "warning",
        title: `${midProgrammeDropouts.length} mid-programme patients didn't rebook this week — roughly £${leakedRounded.toLocaleString()} in estimated leaked revenue`,
        description: `${topClinicianName} has the most (${topCount}) patients who started treatment but haven't booked their next session within ${config.dropoutRiskDays} days.`,
        suggestedAction: `Review the patient board in Pulse for churn-risk patients. Consider enabling the rebooking prompt sequence to automate follow-up.`,
        actionTarget: "owner",
        revenueImpact: leakedRounded,
        createdAt: new Date().toISOString(),
        metadata: {
          dropoutCount: midProgrammeDropouts.length,
          leakedRevenue: leakedRounded,
          byClinician: Object.fromEntries(byClinician),
        },
      });
    }
  }

  // ── Patient-actionable events ────────────────────────────────────────────

  // 7. PATIENT_DROPOUT_RISK
  for (const patient of patients) {
    if (patient.discharged) continue;
    if (!patient.lastSessionDate) continue;
    const sessionCount = Number(patient.sessionCount ?? 0);
    if (sessionCount < 1) continue;
    if (sessionCount >= config.maxProgrammeLength) continue;
    if (patient.nextSessionDate) continue;

    const daysSince = Math.floor(
      (Date.now() - new Date(patient.lastSessionDate as string).getTime()) / 86400000
    );
    if (daysSince <= config.dropoutRiskDays) continue;

    const clinicianName = clinicians.find((c) => c.id === patient.clinicianId)?.name ?? "Unknown";

    newEvents.push({
      type: "PATIENT_DROPOUT_RISK",
      clinicId,
      clinicianId: patient.clinicianId as string,
      clinicianName,
      patientId: patient.id,
      patientName: (patient.name as string) ?? undefined,
      severity: daysSince > 14 ? "critical" : "warning",
      title: `${patient.name} hasn't rebooked in ${daysSince} days (${clinicianName}'s patient)`,
      description: `Mid-programme patient with ${sessionCount} of ${patient.courseLength ?? config.maxProgrammeLength} sessions completed. No future appointment booked.`,
      suggestedAction: `Send a rebooking nudge via Pulse or contact the patient directly.`,
      actionTarget: "patient",
      createdAt: new Date().toISOString(),
      metadata: {
        daysSinceLastSession: daysSince,
        sessionCount,
        courseLength: patient.courseLength ?? config.maxProgrammeLength,
      },
    });
  }

  // 8. NPS_DETRACTOR_ALERT
  for (const review of recentReviews) {
    if (review.platform !== "nps_sms") continue;
    const rating = Number(review.rating ?? 10);
    if (rating > 6) continue; // Not a detractor

    // Check if this review was already alerted in the last 7 days
    const alreadyAlerted = existingEvents.some(
      (e) => e.type === "NPS_DETRACTOR_ALERT" && e.metadata &&
        (e.metadata as Record<string, unknown>).reviewId === review.id
    );
    if (alreadyAlerted) continue;

    // Resolve treating clinician — prefer clinicianId written to review by callback,
    // fall back to patient record lookup (patient may be discharged and excluded from
    // the active patients query, so the review field is the reliable source).
    const patientId = (review.patientId as string) ?? undefined;
    let detractorClinicianId: string | undefined = (review.clinicianId as string) ?? undefined;
    let detractorClinicianName: string | undefined;
    if (!detractorClinicianId && patientId) {
      const patient = patients.find((p) => p.id === patientId);
      if (patient) {
        detractorClinicianId = patient.clinicianId as string;
      }
    }
    if (detractorClinicianId) {
      detractorClinicianName = clinicians.find((c) => c.id === detractorClinicianId)?.name;
    }

    const clinicianContext = detractorClinicianName
      ? ` (${detractorClinicianName}'s patient)`
      : "";

    newEvents.push({
      type: "NPS_DETRACTOR_ALERT",
      clinicId,
      clinicianId: detractorClinicianId,
      clinicianName: detractorClinicianName,
      patientId,
      severity: "critical",
      title: `NPS detractor alert — patient scored ${rating}/10${clinicianContext}`,
      description: `A patient responded with a score of ${rating} to your NPS survey. Detractor scores (≤6) need fast human follow-up to understand the issue and prevent churn or negative reviews.`,
      suggestedAction: detractorClinicianName
        ? `Reach out to the patient within 24 hours. A personal call from ${detractorClinicianName} or the clinic owner is most effective.`
        : `Reach out to the patient within 24 hours. A personal call from the clinic owner or their treating clinician is most effective.`,
      actionTarget: "patient",
      createdAt: new Date().toISOString(),
      metadata: {
        reviewId: review.id,
        npsScore: rating,
        reviewDate: review.date,
        clinicianId: detractorClinicianId ?? null,
      },
    });
  }

  // ── Deduplicate and write ────────────────────────────────────────────────

  const eventsRef = db.collection(`clinics/${clinicId}/insight_events`);

  for (const event of newEvents) {
    // Dedup key: type + clinicianId + patientId
    const isDuplicate = existingEvents.some((e) => {
      if (e.type !== event.type) return false;
      if ((e.clinicianId ?? "") !== (event.clinicianId ?? "")) return false;
      if ((e.patientId ?? "") !== (event.patientId ?? "")) return false;
      // Allow re-alert if metric worsened (for clinician events)
      if (OWNER_EVENTS.includes(event.type)) {
        const existingRev = Number((e as Record<string, unknown>).revenueImpact ?? 0);
        const newRev = event.revenueImpact ?? 0;
        if (newRev > existingRev) return false; // metric worsened, allow re-alert
      }
      return true;
    });

    if (isDuplicate) {
      result.eventsSkipped++;
      continue;
    }

    try {
      await eventsRef.add({
        ...event,
        readAt: null,
        dismissedAt: null,
        pulseActionId: null,
        resolvedAt: null,
        resolution: null,
        lastNotifiedAt: new Date().toISOString(),
      });
      result.eventsCreated++;
    } catch (err) {
      result.errors.push(
        `Failed to write ${event.type}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return result;
}
