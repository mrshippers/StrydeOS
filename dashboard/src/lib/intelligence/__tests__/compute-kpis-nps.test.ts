/**
 * Unit tests for NPS and average-star-rating computation in compute-kpis.ts.
 *
 * P0-10: NPS must use ONLY true 0-10 nps_sms scores.
 * P0-11: 1-5 star ratings are a SEPARATE average-rating metric.
 */

import { describe, it, expect } from "vitest";
import {
  computeRollingNpsOnly,
  computeRollingAverageStarRating,
  computeRollingFollowUpRate,
  computePatientFollowUpRate,
} from "../compute-kpis";
import type { Review } from "@/types";

// ─── computeRollingFollowUpRate ──────────────────────────────────────────────
describe("computeRollingFollowUpRate", () => {
  const wk = (daysAgo: number, followUps: number, initialAssessments: number) => ({
    weekStart: new Date(Date.now() - daysAgo * 86400_000).toISOString().slice(0, 10),
    followUps,
    initialAssessments,
  });

  it("aggregates totals over the window, not per-week ratios", () => {
    // 24 follow-ups ÷ 8 initial assessments = 3.0 across the window, even though
    // one week alone had zero initial assessments (which would read 0 per-week).
    const stats = [wk(5, 10, 0), wk(12, 8, 5), wk(40, 6, 3)];
    expect(computeRollingFollowUpRate(stats, 90)).toBe(3);
  });

  it("returns null (no data) when the window has no initial assessments", () => {
    expect(computeRollingFollowUpRate([wk(5, 10, 0), wk(12, 4, 0)], 90)).toBeNull();
  });

  it("excludes weeks outside the window", () => {
    // The 200-day-old week is excluded; only 6 ÷ 3 = 2 remains.
    const stats = [wk(10, 6, 3), wk(200, 100, 1)];
    expect(computeRollingFollowUpRate(stats, 90)).toBe(2);
  });
});

// ─── computePatientFollowUpRate ──────────────────────────────────────────────
describe("computePatientFollowUpRate", () => {
  const recent = new Date(Date.now() - 10 * 86400_000).toISOString().slice(0, 10);
  const old = new Date(Date.now() - 200 * 86400_000).toISOString().slice(0, 10);

  it("averages follow-ups (sessionCount-1) over patients active in the window", () => {
    // sessions 3,2,1 → follow-ups 2,1,0 → mean = 1.0
    const patients = [
      { sessionCount: 3, lastSessionDate: recent },
      { sessionCount: 2, lastSessionDate: recent },
      { sessionCount: 1, lastSessionDate: recent },
    ];
    expect(computePatientFollowUpRate(patients, 90)).toBe(1);
  });

  it("excludes never-seen (sessionCount 0) and patients outside the window", () => {
    const patients = [
      { sessionCount: 5, lastSessionDate: recent }, // 4 follow-ups, counts
      { sessionCount: 0, lastSessionDate: recent }, // never seen, excluded
      { sessionCount: 9, lastSessionDate: old },    // stale, excluded
    ];
    expect(computePatientFollowUpRate(patients, 90)).toBe(4);
  });

  it("returns null when no patient was seen in the window", () => {
    expect(computePatientFollowUpRate([{ sessionCount: 4, lastSessionDate: old }], 90)).toBeNull();
  });
});

// Helper to build a Review stub
function makeReview(
  platform: "nps_sms" | "google" | "trustpilot",
  rating: number,
  daysAgo = 1
): Review {
  const d = new Date(Date.now() - daysAgo * 86400_000);
  return {
    id: `r-${Math.random()}`,
    platform,
    rating,
    date: d.toISOString().slice(0, 10),
    clinicId: "test-clinic",
    patientId: null,
    reviewText: null,
    language: null,
    sentiment: null,
    publishedAt: null,
    respondedAt: null,
  } as unknown as Review;
}

// ─── computeRollingNpsOnly ────────────────────────────────────────────────────

describe("computeRollingNpsOnly", () => {
  it("returns null for empty window", () => {
    expect(computeRollingNpsOnly([], 90)).toBeNull();
  });

  it("returns null when window contains only star reviews (no nps_sms)", () => {
    const reviews = [
      makeReview("google", 5),
      makeReview("trustpilot", 4),
    ];
    expect(computeRollingNpsOnly(reviews, 90)).toBeNull();
  });

  it("computes NPS from 0-10 nps_sms only - all promoters", () => {
    const reviews = [
      makeReview("nps_sms", 10),
      makeReview("nps_sms", 9),
      makeReview("nps_sms", 10),
    ];
    // 3 promoters, 0 detractors: NPS = 100
    expect(computeRollingNpsOnly(reviews, 90)).toBe(100);
  });

  it("computes NPS from 0-10 nps_sms only - all detractors", () => {
    const reviews = [
      makeReview("nps_sms", 0),
      makeReview("nps_sms", 3),
      makeReview("nps_sms", 6),
    ];
    // 0 promoters, 3 detractors: NPS = -100
    expect(computeRollingNpsOnly(reviews, 90)).toBe(-100);
  });

  it("computes NPS from single nps_sms review (promoter)", () => {
    const reviews = [makeReview("nps_sms", 9)];
    // 1 promoter / 1 total = +100
    expect(computeRollingNpsOnly(reviews, 90)).toBe(100);
  });

  it("computes NPS correctly with mix of promoters, passives, and detractors", () => {
    const reviews = [
      makeReview("nps_sms", 10), // promoter
      makeReview("nps_sms", 9),  // promoter
      makeReview("nps_sms", 8),  // passive
      makeReview("nps_sms", 7),  // passive
      makeReview("nps_sms", 6),  // detractor
    ];
    // 2 promoters, 1 detractor, 5 total: (2-1)/5 * 100 = 20
    expect(computeRollingNpsOnly(reviews, 90)).toBe(20);
  });

  it("ignores star reviews when mixed with nps_sms reviews", () => {
    const reviews = [
      makeReview("nps_sms", 10), // promoter
      makeReview("nps_sms", 9),  // promoter
      makeReview("google", 1),   // must NOT count towards NPS
      makeReview("google", 2),   // must NOT count towards NPS
    ];
    // Only the 2 nps_sms reviews count: 2 promoters, 0 detractors = 100
    expect(computeRollingNpsOnly(reviews, 90)).toBe(100);
  });

  it("excludes reviews outside the window", () => {
    const reviews = [
      makeReview("nps_sms", 10, 1),   // inside 7-day window
      makeReview("nps_sms", 0, 100),  // outside 7-day window
    ];
    // Only the recent review counts: 1 promoter, 0 detractors = 100
    expect(computeRollingNpsOnly(reviews, 7)).toBe(100);
  });
});

// ─── computeRollingAverageStarRating ─────────────────────────────────────────

describe("computeRollingAverageStarRating", () => {
  it("returns null for empty window", () => {
    expect(computeRollingAverageStarRating([], 90)).toBeNull();
  });

  it("returns null when window contains only nps_sms reviews (no star reviews)", () => {
    const reviews = [
      makeReview("nps_sms", 8),
      makeReview("nps_sms", 9),
    ];
    expect(computeRollingAverageStarRating(reviews, 90)).toBeNull();
  });

  it("computes average star rating from google reviews only", () => {
    const reviews = [
      makeReview("google", 5),
      makeReview("google", 4),
      makeReview("google", 3),
    ];
    // (5 + 4 + 3) / 3 = 4.0
    expect(computeRollingAverageStarRating(reviews, 90)).toBeCloseTo(4.0, 1);
  });

  it("ignores nps_sms reviews when computing star rating", () => {
    const reviews = [
      makeReview("google", 5),
      makeReview("nps_sms", 10), // must NOT count towards star rating
    ];
    // Only google: 5/1 = 5.0
    expect(computeRollingAverageStarRating(reviews, 90)).toBeCloseTo(5.0, 1);
  });

  it("excludes reviews outside the window", () => {
    const reviews = [
      makeReview("google", 5, 1),   // inside 7-day window
      makeReview("google", 1, 100), // outside 7-day window
    ];
    expect(computeRollingAverageStarRating(reviews, 7)).toBeCloseTo(5.0, 1);
  });

  it("rounds to one decimal place", () => {
    const reviews = [
      makeReview("google", 5),
      makeReview("google", 4),
      makeReview("google", 4),
    ];
    // (5 + 4 + 4) / 3 = 4.333... rounds to 4.3
    expect(computeRollingAverageStarRating(reviews, 90)).toBeCloseTo(4.3, 1);
  });
});
