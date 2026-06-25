import { describe, it, expect } from "vitest";
import { DEFAULT_UK_INSURERS, resolveInsurerOptions, requiresPreAuthorisation } from "../insurers";

describe("resolveInsurerOptions", () => {
  it("uses the clinic's discovered options when present", () => {
    expect(resolveInsurerOptions(["Bupa", "AXA"])).toEqual(["Bupa", "AXA"]);
  });

  it("falls back to the default UK insurer list when none discovered", () => {
    expect(resolveInsurerOptions([])).toBe(DEFAULT_UK_INSURERS);
  });

  it("includes the major UK insurers in the default list", () => {
    for (const insurer of ["Aviva", "AXA Health", "Bupa", "Bupa Global", "Vitality", "WPA"]) {
      expect(DEFAULT_UK_INSURERS).toContain(insurer);
    }
  });
});

describe("requiresPreAuthorisation", () => {
  it("requires a pre-auth code for a named PMI insurer", () => {
    expect(requiresPreAuthorisation("Bupa")).toBe(true);
    expect(requiresPreAuthorisation("AXA Health")).toBe(true);
    expect(requiresPreAuthorisation("Vitality")).toBe(true);
  });

  it("does not require a pre-auth code for a self-funding patient", () => {
    expect(requiresPreAuthorisation("Self-funding")).toBe(false);
    expect(requiresPreAuthorisation("self funding")).toBe(false);
    expect(requiresPreAuthorisation("Self-pay")).toBe(false);
  });

  it("does not require a code when no insurer is set", () => {
    expect(requiresPreAuthorisation("")).toBe(false);
    expect(requiresPreAuthorisation("   ")).toBe(false);
  });
});
