import { describe, it, expect } from "vitest";
import { isPatientStale } from "@/lib/pulse/patient-edit-guard";

describe("isPatientStale", () => {
  it("returns false when the record is unchanged since open", () => {
    expect(isPatientStale("2026-06-20T10:00:00Z", "2026-06-20T10:00:00Z")).toBe(false);
  });

  it("returns true when the live record changed under the open editor", () => {
    expect(isPatientStale("2026-06-20T10:00:00Z", "2026-06-20T10:05:00Z")).toBe(true);
  });

  it("allows the save when no opened baseline is known", () => {
    expect(isPatientStale(undefined, "2026-06-20T10:05:00Z")).toBe(false);
  });

  it("allows the save when the live record has no updatedAt", () => {
    expect(isPatientStale("2026-06-20T10:00:00Z", undefined)).toBe(false);
  });

  it("treats two missing timestamps as not-stale", () => {
    expect(isPatientStale(undefined, undefined)).toBe(false);
  });
});
