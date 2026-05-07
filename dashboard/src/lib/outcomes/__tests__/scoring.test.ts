/**
 * Outcome measure scoring tests. Each measure is exercised with at least
 * one published-literature baseline + current pair, checked against both
 * the score formula and the direction-aware MCID gate.
 */

import { describe, it, expect } from "vitest";
import {
  scoreNPRS,
  scorePSFS,
  scoreQuickDASH,
  scoreODI,
  scoreNDI,
  isMcidImprovement,
} from "@/lib/outcomes/scoring";

describe("scoreNPRS", () => {
  it("returns the raw value for in-range integers", () => {
    expect(scoreNPRS(7)).toEqual({ score: 7, valid: true });
    expect(scoreNPRS(0)).toEqual({ score: 0, valid: true });
    expect(scoreNPRS(10)).toEqual({ score: 10, valid: true });
  });

  it("rejects out-of-range values", () => {
    expect(scoreNPRS(11).valid).toBe(false);
    expect(scoreNPRS(-1).valid).toBe(false);
    expect(scoreNPRS(NaN).valid).toBe(false);
  });

  it("flags MCID improvement when pain drops by ≥ 2 (Farrar et al. 2001)", () => {
    // NPRS 7 → 4 = 3-point drop. MCID = 2 → improvement.
    expect(isMcidImprovement("nprs", 7, 4)).toBe(true);
    // NPRS 7 → 6 = 1-point drop, below MCID.
    expect(isMcidImprovement("nprs", 7, 6)).toBe(false);
  });
});

describe("scorePSFS", () => {
  it("returns the mean of exactly 3 activities", () => {
    expect(scorePSFS([5, 6, 7])).toEqual({ score: 6, valid: true });
    expect(scorePSFS([0, 0, 0])).toEqual({ score: 0, valid: true });
  });

  it("rejects when the activity count is not exactly 3", () => {
    expect(scorePSFS([5, 6]).valid).toBe(false);
    expect(scorePSFS([5, 6, 7, 8]).valid).toBe(false);
    expect(scorePSFS([]).valid).toBe(false);
  });

  it("rejects out-of-range activity scores", () => {
    expect(scorePSFS([5, 6, 11]).valid).toBe(false);
    expect(scorePSFS([5, 6, -1]).valid).toBe(false);
  });

  it("flags MCID improvement when mean increases by ≥ 2 (Stratford et al. 1995)", () => {
    // Baseline 4 → current 6 = 2-point increase. PSFS = higher better.
    expect(isMcidImprovement("psfs", 4, 6)).toBe(true);
    expect(isMcidImprovement("psfs", 4, 5)).toBe(false);
  });
});

describe("scoreQuickDASH", () => {
  it("computes ((mean - 1) * 25) for 11 valid items", () => {
    // All items at 3 → mean=3 → (3-1)*25 = 50
    const items = Array(11).fill(3);
    expect(scoreQuickDASH(items)).toEqual({ score: 50, valid: true });
  });

  it("accepts up to one missing item (≥ 10 of 11 answered)", () => {
    const items = [1, 2, 3, 1, 2, 3, 1, 2, 3, 1, NaN]; // 10 valid + 1 missing
    const result = scoreQuickDASH(items);
    expect(result.valid).toBe(true);
    // mean of the 10 = (1+2+3+1+2+3+1+2+3+1)/10 = 19/10 = 1.9
    expect(result.score).toBeCloseTo((1.9 - 1) * 25, 5);
  });

  it("rejects when fewer than 10 items are answered", () => {
    const items = [1, 2, 3, NaN, NaN, NaN, NaN, NaN, NaN, NaN, NaN];
    expect(scoreQuickDASH(items).valid).toBe(false);
  });

  it("rejects out-of-range items (must be 1-5)", () => {
    const items = [1, 2, 3, 1, 2, 3, 1, 2, 3, 1, 6];
    expect(scoreQuickDASH(items).valid).toBe(false);
  });

  it("flags MCID improvement when score drops by ≥ 8 (Mintken et al. 2009)", () => {
    expect(isMcidImprovement("quickdash", 50, 41)).toBe(true);  // 9-point drop
    expect(isMcidImprovement("quickdash", 50, 45)).toBe(false); // 5-point drop
  });
});

describe("scoreODI", () => {
  it("computes (sum / (n*5)) * 100 for 10 sections", () => {
    // All sections at 2 → sum=20, n=10, max=5 → 20/50 * 100 = 40
    const sections = Array(10).fill(2);
    expect(scoreODI(sections)).toEqual({ score: 40, valid: true });
  });

  it("drops missing sections from numerator and denominator", () => {
    // 5 sections at 2, 5 missing → sum=10, n=5, max=5 → 10/25 * 100 = 40
    const sections = [2, 2, 2, 2, 2, NaN, NaN, NaN, NaN, NaN];
    const result = scoreODI(sections);
    expect(result.valid).toBe(true);
    expect(result.score).toBe(40);
  });

  it("rejects out-of-range sections (must be 0-5)", () => {
    const sections = [0, 1, 2, 3, 4, 5, 0, 1, 2, 6];
    expect(scoreODI(sections).valid).toBe(false);
  });

  it("flags MCID improvement when score drops by ≥ 10 (Ostelo et al. 2008)", () => {
    expect(isMcidImprovement("odi", 50, 38)).toBe(true);  // 12-point drop
    expect(isMcidImprovement("odi", 50, 45)).toBe(false); // 5-point drop
  });
});

describe("scoreNDI", () => {
  it("uses the same 0-100 formula as ODI", () => {
    const sections = Array(10).fill(3);
    // sum=30, n=10, max=5 → 30/50 * 100 = 60
    expect(scoreNDI(sections)).toEqual({ score: 60, valid: true });
  });

  it("flags MCID improvement when score drops by ≥ 7 (Young et al. 2009)", () => {
    expect(isMcidImprovement("ndi", 40, 32)).toBe(true);  // 8-point drop
    expect(isMcidImprovement("ndi", 40, 35)).toBe(false); // 5-point drop
  });
});

describe("isMcidImprovement direction handling", () => {
  it("treats NPRS / QuickDASH / ODI / NDI as 'lower is better'", () => {
    // Worsening (score went up) is never an improvement.
    expect(isMcidImprovement("nprs", 4, 7)).toBe(false);
    expect(isMcidImprovement("quickdash", 30, 50)).toBe(false);
    expect(isMcidImprovement("odi", 30, 50)).toBe(false);
    expect(isMcidImprovement("ndi", 30, 50)).toBe(false);
  });

  it("treats PSFS as 'higher is better'", () => {
    expect(isMcidImprovement("psfs", 6, 4)).toBe(false); // dropped → worse
    expect(isMcidImprovement("psfs", 4, 6)).toBe(true);  // rose by MCID
  });
});
