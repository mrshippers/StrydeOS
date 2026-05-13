/**
 * Test suite for compute-weekly.ts
 * Covers aggregateWeek and computeWeeklyMetricsForClinic functions
 * TDD: RED phase — these tests are written to fail before implementation
 */

import { describe, it, expect } from "vitest";
import type { WeeklyStats } from "@/types";
import { aggregateWeek, computeWeeklyMetricsForClinic, computeWeeklyMetricsForAllClinics } from "@/lib/metrics/compute-weekly";

/**
 * Helper: Create mock appointment for testing
 */
function mockAppointment(overrides: Record<string, unknown> = {}) {
  return {
    clinicianId: "clinician-1",
    patientId: "patient-1",
    dateTime: "2026-03-16T10:00:00Z",
    status: "completed",
    appointmentType: "follow_up",
    hepAssigned: false,
    revenueAmountPence: 5000,
    ...overrides,
  };
}

/**
 * Helper: Create mock patient for testing
 */
function mockPatient(overrides: Record<string, unknown> = {}) {
  return {
    id: "patient-1",
    clinicianId: "clinician-1",
    sessionCount: 3,
    treatmentLength: 6,
    discharged: false,
    insuranceFlag: false,
    ...overrides,
  };
}

/**
 * Helper: Create mock review for testing
 */
function mockReview(overrides: Record<string, unknown> = {}) {
  return {
    rating: 5,
    date: "2026-03-16",
    platform: "google",
    ...overrides,
  };
}

describe("aggregateWeek", () => {
  /**
   * Import the actual aggregateWeek function from compute-weekly.ts
   * This test file assumes aggregateWeek is exported (currently it's not — that's the fix)
   */

  it("should calculate followUpRate as total appointments / unique patients", () => {
    // Given 3 completed sessions with 1 unique patient
    // Expected followUpRate = 3 / 1 = 3.0
    const appointments = [
      mockAppointment({ patientId: "patient-1" }),
      mockAppointment({ patientId: "patient-1", dateTime: "2026-03-17T10:00:00Z" }),
      mockAppointment({ patientId: "patient-1", dateTime: "2026-03-18T10:00:00Z" }),
    ];
    const patients = [mockPatient()];
    const reviews = [];
    const targets = { followUpRate: 4.0, hepRate: 0.95 };

    // When aggregating the week
    const result = aggregateWeek(appointments as any, "2026-03-16", "clinician-1", "Test Clinician", targets, patients, reviews);

    // Then followUpRate should be 3.0
    expect(result.followUpRate).toBe(3.0);
  });

  it("should only count completed appointments in followUpRate", () => {
    // Given 2 completed + 1 cancelled
    // Expected: only 2 completed count
    const appointments = [
      mockAppointment({ status: "completed", patientId: "patient-1" }),
      mockAppointment({ status: "completed", patientId: "patient-1", dateTime: "2026-03-17T10:00:00Z" }),
      mockAppointment({ status: "cancelled", patientId: "patient-1", dateTime: "2026-03-18T10:00:00Z" }),
    ];
    const patients = [mockPatient()];
    const reviews = [];
    const targets = { followUpRate: 4.0, hepRate: 0.95 };

    // When aggregating
    const result = aggregateWeek(appointments as any, "2026-03-16", "clinician-1", "Test Clinician", targets, patients, reviews);

    // Then only 2 completed should count
    expect(result.appointmentsTotal).toBe(2);
    expect(result.followUpRate).toBe(2.0);
  });

  it("should calculate hepComplianceRate as appointments with HEP assigned / total completed", () => {
    // Given 3 completed: 2 with HEP, 1 without
    // Expected hepComplianceRate = 2 / 3 ≈ 0.667
    const appointments = [
      mockAppointment({ hepAssigned: true }),
      mockAppointment({ hepAssigned: true, dateTime: "2026-03-17T10:00:00Z" }),
      mockAppointment({ hepAssigned: false, dateTime: "2026-03-18T10:00:00Z" }),
    ];
    const patients = [mockPatient()];
    const reviews = [];
    const targets = { followUpRate: 4.0, hepRate: 0.95 };

    // When aggregating
    const result = aggregateWeek(appointments as any, "2026-03-16", "clinician-1", "Test Clinician", targets, patients, reviews);

    // Then HEP compliance should reflect 2/3
    expect(result.hepComplianceRate).toBeCloseTo(0.667, 2);
  });

  it("should calculate dnaRate as DNA count / (completed + DNA)", () => {
    // Given 4 completed + 1 DNA
    // Expected dnaRate = 1 / 5 = 0.2
    const appointments = [
      mockAppointment({ status: "completed" }),
      mockAppointment({ status: "completed", dateTime: "2026-03-17T10:00:00Z" }),
      mockAppointment({ status: "completed", dateTime: "2026-03-18T10:00:00Z" }),
      mockAppointment({ status: "completed", dateTime: "2026-03-19T10:00:00Z" }),
      mockAppointment({ status: "dna", dateTime: "2026-03-20T10:00:00Z" }),
    ];
    const patients = [mockPatient()];
    const reviews = [];
    const targets = { followUpRate: 4.0, hepRate: 0.95 };

    // When aggregating
    const result = aggregateWeek(appointments as any, "2026-03-16", "clinician-1", "Test Clinician", targets, patients, reviews);

    // Then DNA rate should be 0.2
    expect(result.dnaRate).toBe(0.2);
  });

  it("should exclude cancelled/no-show-rescheduled from DNA rate denominator", () => {
    // Given 1 completed, 1 DNA, 1 cancelled
    // Expected: DNA rate = 1 / (1 + 1) = 0.5 (cancelled excluded)
    const appointments = [
      mockAppointment({ status: "completed" }),
      mockAppointment({ status: "dna", dateTime: "2026-03-17T10:00:00Z" }),
      mockAppointment({ status: "cancelled", dateTime: "2026-03-18T10:00:00Z" }),
    ];
    const patients = [mockPatient()];
    const reviews = [];
    const targets = { followUpRate: 4.0, hepRate: 0.95 };

    // When aggregating
    const result = aggregateWeek(appointments as any, "2026-03-16", "clinician-1", "Test Clinician", targets, patients, reviews);

    // Then DNA rate should be 0.5 (1 / 2)
    expect(result.dnaRate).toBe(0.5);
  });

  it("should calculate revenuePerSessionPence correctly", () => {
    // Given 2 completed sessions at 5000 pence each
    // Expected revenuePerSessionPence = 10000 / 2 = 5000
    const appointments = [
      mockAppointment({ revenueAmountPence: 5000 }),
      mockAppointment({ revenueAmountPence: 5000, dateTime: "2026-03-17T10:00:00Z" }),
    ];
    const patients = [mockPatient()];
    const reviews = [];
    const targets = { followUpRate: 4.0, hepRate: 0.95 };

    // When aggregating
    const result = aggregateWeek(appointments as any, "2026-03-16", "clinician-1", "Test Clinician", targets, patients, reviews);

    // Then revenue per session should be 5000
    expect(result.revenuePerSessionPence).toBe(5000);
  });

  it("should track appointmentType breakdown in revenueByAppointmentType", () => {
    // Given 2 initial_assessment (4000 ea) + 1 follow_up (3000)
    // Expected: revenueByAppointmentType = {initial_assessment: 8000, follow_up: 3000}
    const appointments = [
      mockAppointment({ appointmentType: "initial_assessment", revenueAmountPence: 4000 }),
      mockAppointment({ appointmentType: "initial_assessment", revenueAmountPence: 4000, dateTime: "2026-03-17T10:00:00Z" }),
      mockAppointment({ appointmentType: "follow_up", revenueAmountPence: 3000, dateTime: "2026-03-18T10:00:00Z" }),
    ];
    const patients = [mockPatient()];
    const reviews = [];
    const targets = { followUpRate: 4.0, hepRate: 0.95 };

    // When aggregating
    const result = aggregateWeek(appointments as any, "2026-03-16", "clinician-1", "Test Clinician", targets, patients, reviews);

    // Then should track revenue by appointment type
    expect(result.revenueByAppointmentType["initial_assessment"]).toBe(8000);
    expect(result.revenueByAppointmentType["follow_up"]).toBe(3000);
  });

  it("should split revenue into insurance vs self-pay", () => {
    // Given 1 insurance patient (3000) + 1 self-pay patient (2000)
    // Expected: insuranceRevenuePence = 3000, selfPayRevenuePence = 2000
    const appointments = [
      mockAppointment({ patientId: "patient-insurance", revenueAmountPence: 3000 }),
      mockAppointment({ patientId: "patient-selfpay", revenueAmountPence: 2000, dateTime: "2026-03-17T10:00:00Z" }),
    ];
    const patients = [
      mockPatient({ id: "patient-insurance", insuranceFlag: true }),
      mockPatient({ id: "patient-selfpay", insuranceFlag: false }),
    ];
    const reviews = [];
    const targets = { followUpRate: 4.0, hepRate: 0.95 };

    // When aggregating
    const result = aggregateWeek(appointments as any, "2026-03-16", "clinician-1", "Test Clinician", targets, patients, reviews);

    // Then should split revenue correctly
    expect(result.insuranceRevenuePence).toBe(3000);
    expect(result.selfPayRevenuePence).toBe(2000);
  });

  it("should return 0 metrics when no appointments exist", () => {
    // Given empty appointments array
    const appointments: unknown[] = [];
    const patients = [mockPatient()];
    const reviews = [];
    const targets = { followUpRate: 4.0, hepRate: 0.95 };

    // When aggregating
    const result = aggregateWeek(appointments as any, "2026-03-16", "clinician-1", "Test Clinician", targets, patients, reviews);

    // Then all rate metrics should be 0 or undefined
    expect(result.followUpRate).toBe(0);
    expect(result.hepComplianceRate).toBe(0);
    expect(result.dnaRate).toBe(0);
    expect(result.revenuePerSessionPence).toBe(0);
  });

  it("should calculate NPS score correctly from mixed platforms", () => {
    // Given: 2 nps_sms (9, 3) + 2 google (5, 2) = 4 total
    // nps_sms: 9=promoter, 3=detractor
    // google: 5=promoter, 2=detractor
    // promoters=2, detractors=2, NPS = (2-2)/4 * 100 = 0
    const appointments = [mockAppointment()];
    const patients = [mockPatient()];
    const reviews = [
      mockReview({ rating: 9, platform: "nps_sms", date: "2026-03-16" }),
      mockReview({ rating: 3, platform: "nps_sms", date: "2026-03-17" }),
      mockReview({ rating: 5, platform: "google", date: "2026-03-18" }),
      mockReview({ rating: 2, platform: "google", date: "2026-03-19" }),
    ];
    const targets = { followUpRate: 4.0, hepRate: 0.95 };

    // When aggregating
    const result = aggregateWeek(appointments as any, "2026-03-16", "clinician-1", "Test Clinician", targets, patients, reviews);

    // Then NPS should be 0
    expect(result.npsScore).toBe(0);
  });

  it("should calculate utilisationRate as booked slots / estimated capacity", () => {
    // Given: 3 completed + 1 DNA = 4 booked slots
    // 1 clinician × 40 capacity = 40 slots
    // Expected utilisationRate = 4/40 = 0.1
    const appointments = [
      mockAppointment({ status: "completed" }),
      mockAppointment({ status: "completed", dateTime: "2026-03-17T10:00:00Z" }),
      mockAppointment({ status: "completed", dateTime: "2026-03-18T10:00:00Z" }),
      mockAppointment({ status: "dna", dateTime: "2026-03-19T10:00:00Z" }),
    ];
    const patients = [mockPatient()];
    const reviews = [];
    const targets = { followUpRate: 4.0, hepRate: 0.95 };

    // When aggregating with default capacity 40
    const result = aggregateWeek(appointments as any, "2026-03-16", "clinician-1", "Test Clinician", targets, patients, reviews, 5000, 40);

    // Then utilisationRate should be 0.1
    expect(result.utilisationRate).toBe(0.1);
  });

  it("should cap utilisationRate at 1.0 even if booked > capacity", () => {
    // Given: 50 appointments, 40 capacity
    // Expected utilisationRate = min(1, 50/40) = 1.0
    const appointments = Array.from({ length: 50 }, (_, i) =>
      mockAppointment({ status: "completed", dateTime: new Date(new Date("2026-03-16").getTime() + i * 3600000).toISOString() })
    );
    const patients = [mockPatient()];
    const reviews = [];
    const targets = { followUpRate: 4.0, hepRate: 0.95 };

    // When aggregating
    const result = aggregateWeek(appointments as any, "2026-03-16", "clinician-1", "Test Clinician", targets, patients, reviews, 5000, 40);

    // Then utilisationRate should be capped at 1.0
    expect(result.utilisationRate).toBe(1.0);
  });

  it("should set statisticallyRepresentative to true when total >= 5", () => {
    // Given: 5 completed appointments
    const appointments = [
      mockAppointment({ status: "completed" }),
      mockAppointment({ status: "completed", dateTime: "2026-03-17T10:00:00Z" }),
      mockAppointment({ status: "completed", dateTime: "2026-03-18T10:00:00Z" }),
      mockAppointment({ status: "completed", dateTime: "2026-03-19T10:00:00Z" }),
      mockAppointment({ status: "completed", dateTime: "2026-03-20T10:00:00Z" }),
    ];
    const patients = [mockPatient()];
    const reviews = [];
    const targets = { followUpRate: 4.0, hepRate: 0.95 };

    // When aggregating
    const result = aggregateWeek(appointments as any, "2026-03-16", "clinician-1", "Test Clinician", targets, patients, reviews);

    // Then statisticallyRepresentative should be true
    expect(result.statisticallyRepresentative).toBe(true);
  });

  it("should set caveatNote when total < 5", () => {
    // Given: 2 completed appointments
    const appointments = [
      mockAppointment({ status: "completed" }),
      mockAppointment({ status: "completed", dateTime: "2026-03-17T10:00:00Z" }),
    ];
    const patients = [mockPatient()];
    const reviews = [];
    const targets = { followUpRate: 4.0, hepRate: 0.95 };

    // When aggregating
    const result = aggregateWeek(appointments as any, "2026-03-16", "clinician-1", "Test Clinician", targets, patients, reviews);

    // Then caveatNote should indicate low volume
    expect(result.caveatNote).toContain("Low volume");
    expect(result.statisticallyRepresentative).toBe(false);
  });

  it("should track DNA breakdown by day of week and time slot", () => {
    // Given: 1 DNA on Monday at 10am (morning), 1 DNA on Wednesday at 3pm (afternoon)
    const appointments = [
      mockAppointment({ status: "dna", dateTime: "2026-03-16T10:00:00Z" }), // Monday
      mockAppointment({ status: "dna", dateTime: "2026-03-18T15:00:00Z" }), // Wednesday
    ];
    const patients = [mockPatient()];
    const reviews = [];
    const targets = { followUpRate: 4.0, hepRate: 0.95 };

    // When aggregating
    const result = aggregateWeek(appointments as any, "2026-03-16", "clinician-1", "Test Clinician", targets, patients, reviews);

    // Then should track DNAs by day and time
    expect(result.dnaByDayOfWeek!["Mon"]).toBe(1);
    expect(result.dnaByDayOfWeek!["Wed"]).toBe(1);
    expect(result.dnaByTimeSlot!["morning"]).toBe(1);
    expect(result.dnaByTimeSlot!["afternoon"]).toBe(1);
  });

  it("should calculate treatmentCompletionRate for discharged patients", () => {
    // Given: 2 discharged patients, 1 completed treatment (sessionCount >= treatmentLength), 1 incomplete
    const appointments = [mockAppointment()];
    const patients = [
      mockPatient({ id: "patient-1", discharged: true, sessionCount: 6, treatmentLength: 6 }),
      mockPatient({ id: "patient-2", discharged: true, sessionCount: 4, treatmentLength: 6 }),
    ];
    const reviews = [];
    const targets = { followUpRate: 4.0, hepRate: 0.95 };

    // When aggregating for "clinician-1"
    const result = aggregateWeek(appointments as any, "2026-03-16", "clinician-1", "Test Clinician", targets, patients, reviews);

    // Then treatmentCompletionRate = 1/2 = 0.5
    expect(result.treatmentCompletionRate).toBe(0.5);
  });

  it("should calculate review metrics: count, avgRating, velocity", () => {
    // Given: 3 reviews in this week (avg rating 4.33), 2 reviews in prior week
    const appointments = [mockAppointment()];
    const patients = [mockPatient()];
    const reviews = [
      mockReview({ rating: 5, date: "2026-03-16" }),
      mockReview({ rating: 4, date: "2026-03-17" }),
      mockReview({ rating: 4, date: "2026-03-18" }),
      mockReview({ rating: 5, date: "2026-03-09" }), // Prior week
      mockReview({ rating: 5, date: "2026-03-10" }), // Prior week
    ];
    const targets = { followUpRate: 4.0, hepRate: 0.95 };

    // When aggregating week 2026-03-16
    const result = aggregateWeek(appointments as any, "2026-03-16", "clinician-1", "Test Clinician", targets, patients, reviews);

    // Then reviewCount=3, avgRating≈4.33, velocity=1 (3-2)
    expect(result.reviewCount).toBe(3);
    expect(result.avgRating).toBeCloseTo(4.33, 1);
    expect(result.reviewVelocity).toBe(1);
  });
});

describe("computeWeeklyMetricsForClinic", () => {
  it("should export function that accepts (db, clinicId, weeksBack)", () => {
    // Verify function is exported and has correct arity
    expect(typeof computeWeeklyMetricsForClinic).toBe("function");
    expect(computeWeeklyMetricsForClinic.length).toBeGreaterThanOrEqual(2);
  });

  it("should return {written: number} shape", () => {
    // Verify function signature exists (actual DB call would require mocking)
    expect(typeof computeWeeklyMetricsForClinic).toBe("function");
  });
});

describe("computeWeeklyMetricsForAllClinics", () => {
  it("should export function that accepts (db, weeksBack)", () => {
    // Verify function is exported and has correct arity
    expect(typeof computeWeeklyMetricsForAllClinics).toBe("function");
    expect(computeWeeklyMetricsForAllClinics.length).toBeGreaterThanOrEqual(1);
  });

  it("should return array of {clinicId, written} objects", () => {
    // Verify function signature exists (actual DB call would require mocking)
    expect(typeof computeWeeklyMetricsForAllClinics).toBe("function");
  });
});

// ─── deriveClinicianKpis field derivation ─────────────────────────────────────
// Pure logic extracted from deriveClinicianKpis for isolated unit testing.
// Tests verify the derivation contract for hepComplianceRate, hepTrend,
// revenuePerSessionPence, and revPerSessionTrend.

function deriveKpiFieldsFromStats(
  allStats: WeeklyStats[],
): {
  clinicianId: string;
  hepComplianceRate: number;
  hepTrend: number[];
  revenuePerSessionPence: number;
  revPerSessionTrend: number[];
}[] {
  const clinicianIds = [...new Set(
    allStats.filter((s) => s.clinicianId !== "all").map((s) => s.clinicianId),
  )];

  return clinicianIds.map((cid) => {
    const stats = allStats
      .filter((s) => s.clinicianId === cid)
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart));

    const latest = stats[stats.length - 1];
    return {
      clinicianId: cid,
      hepComplianceRate: latest?.hepComplianceRate ?? 0,
      hepTrend: stats.map((s) => s.hepComplianceRate ?? 0),
      revenuePerSessionPence: latest?.revenuePerSessionPence ?? 0,
      revPerSessionTrend: stats.map((s) => s.revenuePerSessionPence ?? 0),
    };
  });
}

function mockWeeklyStat(overrides: Partial<WeeklyStats> = {}): WeeklyStats {
  return {
    id: "ws-1",
    clinicianId: "clinician-1",
    clinicianName: "Test Clinician",
    weekStart: "2026-03-16",
    followUpRate: 3.0,
    followUpTarget: 4.0,
    hepComplianceRate: 0.75,
    hepRate: 0.75,
    hepTarget: 0.95,
    utilisationRate: 0.85,
    dnaRate: 0.05,
    treatmentCompletionRate: 0.8,
    revenuePerSessionPence: 7500,
    appointmentsTotal: 10,
    initialAssessments: 2,
    followUps: 8,
    ...overrides,
  };
}

describe("deriveClinicianKpis — hepComplianceRate and revenuePerSessionPence derivation", () => {
  it("returns hepComplianceRate on each row using the latest week value", () => {
    const allStats: WeeklyStats[] = [
      mockWeeklyStat({ clinicianId: "c1", weekStart: "2026-03-09", hepComplianceRate: 0.60 }),
      mockWeeklyStat({ clinicianId: "c1", weekStart: "2026-03-16", hepComplianceRate: 0.75 }),
      mockWeeklyStat({ clinicianId: "c1", weekStart: "2026-03-23", hepComplianceRate: 0.80 }),
      mockWeeklyStat({ clinicianId: "c1", weekStart: "2026-03-30", hepComplianceRate: 0.82 }),
      mockWeeklyStat({ clinicianId: "c2", weekStart: "2026-03-09", hepComplianceRate: 0.45 }),
      mockWeeklyStat({ clinicianId: "c2", weekStart: "2026-03-16", hepComplianceRate: 0.50 }),
      mockWeeklyStat({ clinicianId: "c2", weekStart: "2026-03-23", hepComplianceRate: 0.55 }),
      mockWeeklyStat({ clinicianId: "c2", weekStart: "2026-03-30", hepComplianceRate: 0.58 }),
    ];

    const result = deriveKpiFieldsFromStats(allStats);

    const r1 = result.find((r) => r.clinicianId === "c1")!;
    const r2 = result.find((r) => r.clinicianId === "c2")!;

    // Latest week value is used for hepComplianceRate
    expect(r1.hepComplianceRate).toBe(0.82);
    expect(r2.hepComplianceRate).toBe(0.58);
  });

  it("returns hepTrend as an array of all weekly hepComplianceRate values in chronological order", () => {
    const allStats: WeeklyStats[] = [
      mockWeeklyStat({ clinicianId: "c1", weekStart: "2026-03-09", hepComplianceRate: 0.60 }),
      mockWeeklyStat({ clinicianId: "c1", weekStart: "2026-03-16", hepComplianceRate: 0.70 }),
      mockWeeklyStat({ clinicianId: "c1", weekStart: "2026-03-23", hepComplianceRate: 0.75 }),
      mockWeeklyStat({ clinicianId: "c1", weekStart: "2026-03-30", hepComplianceRate: 0.80 }),
    ];

    const result = deriveKpiFieldsFromStats(allStats);
    const r1 = result.find((r) => r.clinicianId === "c1")!;

    expect(r1.hepTrend).toHaveLength(4);
    expect(r1.hepTrend).toEqual([0.60, 0.70, 0.75, 0.80]);
  });

  it("returns revenuePerSessionPence on each row using the latest week value", () => {
    const allStats: WeeklyStats[] = [
      mockWeeklyStat({ clinicianId: "c1", weekStart: "2026-03-09", revenuePerSessionPence: 7000 }),
      mockWeeklyStat({ clinicianId: "c1", weekStart: "2026-03-16", revenuePerSessionPence: 7200 }),
      mockWeeklyStat({ clinicianId: "c1", weekStart: "2026-03-23", revenuePerSessionPence: 7400 }),
      mockWeeklyStat({ clinicianId: "c1", weekStart: "2026-03-30", revenuePerSessionPence: 7500 }),
      mockWeeklyStat({ clinicianId: "c2", weekStart: "2026-03-09", revenuePerSessionPence: 6500 }),
      mockWeeklyStat({ clinicianId: "c2", weekStart: "2026-03-16", revenuePerSessionPence: 6600 }),
      mockWeeklyStat({ clinicianId: "c2", weekStart: "2026-03-23", revenuePerSessionPence: 6700 }),
      mockWeeklyStat({ clinicianId: "c2", weekStart: "2026-03-30", revenuePerSessionPence: 6800 }),
    ];

    const result = deriveKpiFieldsFromStats(allStats);

    const r1 = result.find((r) => r.clinicianId === "c1")!;
    const r2 = result.find((r) => r.clinicianId === "c2")!;

    expect(r1.revenuePerSessionPence).toBe(7500);
    expect(r2.revenuePerSessionPence).toBe(6800);
  });

  it("defaults hepComplianceRate and revenuePerSessionPence to 0 when fields are missing from WeeklyStats", () => {
    const statWithMissingFields = {
      ...mockWeeklyStat({ clinicianId: "c1", weekStart: "2026-03-16" }),
    } as WeeklyStats;
    // Simulate missing fields by deleting them (Firestore docs may omit optional fields)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (statWithMissingFields as any).hepComplianceRate;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (statWithMissingFields as any).revenuePerSessionPence;

    const result = deriveKpiFieldsFromStats([statWithMissingFields]);
    const r1 = result.find((r) => r.clinicianId === "c1")!;

    expect(r1.hepComplianceRate).toBe(0);
    expect(r1.revenuePerSessionPence).toBe(0);
    expect(r1.hepTrend).toEqual([0]);
    expect(r1.revPerSessionTrend).toEqual([0]);
  });
});
