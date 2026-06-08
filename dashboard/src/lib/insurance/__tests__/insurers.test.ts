import { describe, it, expect } from "vitest";
import { DEFAULT_UK_INSURERS, resolveInsurerOptions } from "../insurers";

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
