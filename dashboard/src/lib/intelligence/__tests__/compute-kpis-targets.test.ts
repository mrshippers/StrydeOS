/**
 * Unit tests for KPI target resolution in compute-kpis.ts.
 *
 * P0-4: KPI targets (rev/session, NPS, review-conversion, star-rating) must
 * resolve from clinicData.targets when set, or use a clearly-labelled
 * reference fallback when unset. The bare 68/6800p literal must not silently
 * act as the clinic's own benchmark.
 */

import { describe, it, expect } from "vitest";
import {
  resolveKpiTarget,
  REFERENCE_TARGETS,
} from "../compute-kpis";
import type { ClinicTargets } from "@/types";

// ─── resolveKpiTarget ─────────────────────────────────────────────────────────

describe("resolveKpiTarget - revenue-per-session", () => {
  it("returns clinic target when revenuePerSessionPence is set", () => {
    const targets: Partial<ClinicTargets> = { revenuePerSessionPence: 7500 };
    expect(resolveKpiTarget("revenue-per-session", targets)).toBe(7500);
  });

  it("returns reference fallback when revenuePerSessionPence is absent", () => {
    expect(resolveKpiTarget("revenue-per-session", {})).toBe(
      REFERENCE_TARGETS.revenuePerSessionPence
    );
  });

  it("returns reference fallback when targets is undefined", () => {
    expect(resolveKpiTarget("revenue-per-session", undefined)).toBe(
      REFERENCE_TARGETS.revenuePerSessionPence
    );
  });

  it("reference fallback is 6800p (£68 UK PPB 2026 median) — clearly labelled, not silent", () => {
    // This test pins the reference value AND asserts the label exists so it can
    // be surfaced as "reference target" rather than the clinic's own benchmark.
    expect(REFERENCE_TARGETS.revenuePerSessionPence).toBe(6800);
    expect(REFERENCE_TARGETS._label).toBe("reference target");
  });
});

describe("resolveKpiTarget - nps", () => {
  it("returns clinic target when npsTarget is set", () => {
    const targets: Partial<ClinicTargets> = { npsTarget: 60 };
    expect(resolveKpiTarget("nps", targets)).toBe(60);
  });

  it("returns reference fallback when npsTarget is absent", () => {
    expect(resolveKpiTarget("nps", {})).toBe(REFERENCE_TARGETS.npsTarget);
  });

  it("returns reference fallback when targets is undefined", () => {
    expect(resolveKpiTarget("nps", undefined)).toBe(REFERENCE_TARGETS.npsTarget);
  });
});

describe("resolveKpiTarget - google-review-conversion", () => {
  it("returns clinic target when reviewConversionTarget is set", () => {
    const targets: Partial<ClinicTargets> = { reviewConversionTarget: 0.08 };
    expect(resolveKpiTarget("google-review-conversion", targets)).toBe(0.08);
  });

  it("returns reference fallback when reviewConversionTarget is absent", () => {
    expect(resolveKpiTarget("google-review-conversion", {})).toBe(
      REFERENCE_TARGETS.reviewConversionTarget
    );
  });
});

describe("resolveKpiTarget - average-star-rating", () => {
  it("returns clinic target when averageStarRatingTarget is set", () => {
    const targets: Partial<ClinicTargets> = { averageStarRatingTarget: 4.8 };
    expect(resolveKpiTarget("average-star-rating", targets)).toBe(4.8);
  });

  it("returns reference fallback when averageStarRatingTarget is absent", () => {
    expect(resolveKpiTarget("average-star-rating", {})).toBe(
      REFERENCE_TARGETS.averageStarRatingTarget
    );
  });
});

describe("resolveKpiTarget - clinic-configured KPIs (existing behaviour unchanged)", () => {
  it("follow-up-rate: returns clinic target when set", () => {
    const targets: Partial<ClinicTargets> = { followUpRate: 5.0 };
    expect(resolveKpiTarget("follow-up-rate", targets)).toBe(5.0);
  });

  it("follow-up-rate: returns reference fallback when unset", () => {
    expect(resolveKpiTarget("follow-up-rate", {})).toBe(REFERENCE_TARGETS.followUpRate);
  });

  it("hep-compliance: returns clinic target when set", () => {
    const targets: Partial<ClinicTargets> = { hepRate: 0.9 };
    expect(resolveKpiTarget("hep-compliance", targets)).toBe(0.9);
  });

  it("utilisation: returns clinic target when set", () => {
    const targets: Partial<ClinicTargets> = { utilisationRate: 0.8 };
    expect(resolveKpiTarget("utilisation", targets)).toBe(0.8);
  });

  it("dna-rate: returns clinic target when set", () => {
    const targets: Partial<ClinicTargets> = { dnaRate: 0.04 };
    expect(resolveKpiTarget("dna-rate", targets)).toBe(0.04);
  });
});

// ─── evaluateStatus RAG boundary tests ───────────────────────────────────────

import { evaluateKpiStatus } from "../compute-kpis";

describe("evaluateKpiStatus - revenue-per-session boundaries", () => {
  it("ok when value >= ok threshold", () => {
    expect(evaluateKpiStatus("revenue-per-session", 6800)).toBe("ok");
    expect(evaluateKpiStatus("revenue-per-session", 7000)).toBe("ok");
  });

  it("warn when value < ok but >= warn threshold", () => {
    expect(evaluateKpiStatus("revenue-per-session", 5500)).toBe("warn");
    expect(evaluateKpiStatus("revenue-per-session", 6000)).toBe("warn");
  });

  it("danger when value < warn threshold", () => {
    expect(evaluateKpiStatus("revenue-per-session", 5000)).toBe("danger");
    expect(evaluateKpiStatus("revenue-per-session", 0)).toBe("danger");
  });
});

describe("evaluateKpiStatus - nps boundaries (higher is better)", () => {
  it("ok when value >= ok threshold", () => {
    expect(evaluateKpiStatus("nps", 70)).toBe("ok");
    expect(evaluateKpiStatus("nps", 80)).toBe("ok");
  });

  it("warn when value < ok but >= warn threshold", () => {
    expect(evaluateKpiStatus("nps", 40)).toBe("warn");
    expect(evaluateKpiStatus("nps", 60)).toBe("warn");
  });

  it("danger when value < warn threshold", () => {
    expect(evaluateKpiStatus("nps", 39)).toBe("danger");
    expect(evaluateKpiStatus("nps", -100)).toBe("danger");
  });
});

describe("evaluateKpiStatus - dna-rate boundaries (lower is better)", () => {
  it("ok when value <= ok threshold", () => {
    expect(evaluateKpiStatus("dna-rate", 0.05)).toBe("ok");
    expect(evaluateKpiStatus("dna-rate", 0.0)).toBe("ok");
  });

  it("warn when value > ok but <= warn threshold", () => {
    expect(evaluateKpiStatus("dna-rate", 0.07)).toBe("warn");
    expect(evaluateKpiStatus("dna-rate", 0.10)).toBe("warn");
  });

  it("danger when value > warn threshold", () => {
    expect(evaluateKpiStatus("dna-rate", 0.11)).toBe("danger");
    expect(evaluateKpiStatus("dna-rate", 0.20)).toBe("danger");
  });
});

// ─── targetIsReference flag ───────────────────────────────────────────────────

import { resolveKpiTargetWithFlag } from "../compute-kpis";

describe("resolveKpiTargetWithFlag - targetIsReference flag", () => {
  it("sets targetIsReference=false when clinic has revenue-per-session target", () => {
    const targets: Partial<ClinicTargets> = { revenuePerSessionPence: 7500 };
    const result = resolveKpiTargetWithFlag("revenue-per-session", targets);
    expect(result.target).toBe(7500);
    expect(result.targetIsReference).toBe(false);
  });

  it("sets targetIsReference=true when revenue-per-session falls back to reference", () => {
    const result = resolveKpiTargetWithFlag("revenue-per-session", {});
    expect(result.target).toBe(REFERENCE_TARGETS.revenuePerSessionPence);
    expect(result.targetIsReference).toBe(true);
  });

  it("sets targetIsReference=true when targets is undefined", () => {
    const result = resolveKpiTargetWithFlag("nps", undefined);
    expect(result.target).toBe(REFERENCE_TARGETS.npsTarget);
    expect(result.targetIsReference).toBe(true);
  });

  it("sets targetIsReference=false when clinic has nps target", () => {
    const targets: Partial<ClinicTargets> = { npsTarget: 65 };
    const result = resolveKpiTargetWithFlag("nps", targets);
    expect(result.target).toBe(65);
    expect(result.targetIsReference).toBe(false);
  });

  it("sets targetIsReference=true for dna-rate reference fallback", () => {
    const result = resolveKpiTargetWithFlag("dna-rate", {});
    expect(result.targetIsReference).toBe(true);
  });

  it("sets targetIsReference=false when clinic has dna-rate target", () => {
    const targets: Partial<ClinicTargets> = { dnaRate: 0.04 };
    const result = resolveKpiTargetWithFlag("dna-rate", targets);
    expect(result.targetIsReference).toBe(false);
  });
});
