import { describe, it, expect } from "vitest";
import { computeCaseload } from "../sync-patients";

describe("computeCaseload — per-clinician patient visibility", () => {
  it("includes the primary clinician even with no appointment history", () => {
    expect(computeCaseload([], "clin-a")).toEqual(["clin-a"]);
  });

  it("is just the same clinician when only they have seen the patient", () => {
    expect(computeCaseload(["clin-a"], "clin-a")).toEqual(["clin-a"]);
  });

  it("unions every clinician who has seen the patient (overlap case)", () => {
    const result = computeCaseload(["clin-a", "clin-b"], "clin-a");
    expect(result).toContain("clin-a");
    expect(result).toContain("clin-b");
    expect(result).toHaveLength(2);
  });

  it("adds the primary clinician if appointments did not include them", () => {
    const result = computeCaseload(["clin-b"], "clin-a");
    expect(result).toContain("clin-a");
    expect(result).toContain("clin-b");
  });

  it("dedupes repeated clinician ids", () => {
    expect(computeCaseload(["clin-a", "clin-a"], "clin-a")).toEqual(["clin-a"]);
  });

  it("ignores empty ids and the 'unknown' sentinel", () => {
    expect(computeCaseload(["", "clin-a"], "unknown")).toEqual(["clin-a"]);
  });
});
