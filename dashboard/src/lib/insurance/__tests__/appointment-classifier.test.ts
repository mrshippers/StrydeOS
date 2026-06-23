import { describe, it, expect } from "vitest";
import {
  classifyAppointmentType,
  evaluateInsurerClaim,
  INSURERS,
  INSURER_SPECS,
} from "../appointment-classifier";

// The 13 real Cliniko appointment-type names at Spires (uk3, June 2026):
// 5 insurers × {Initial, Follow-up} = 10 insurance types, plus 3 non-insurance.
const INSURANCE_TYPES: Array<[string, string, boolean]> = [
  ["AXA Initial Appointment", "AXA", true],
  ["AXA Follow up", "AXA", false],
  ["Aviva Initial Appointment", "Aviva", true],
  ["Aviva Follow up", "Aviva", false],
  ["Bupa Initial Appointment", "Bupa", true],
  ["Bupa Follow up", "Bupa", false],
  ["Vitality Initial Appointment", "Vitality", true],
  ["Vitality Follow up", "Vitality", false],
  ["WPA Initial Appointment", "WPA", true],
  ["WPA Follow up", "WPA", false],
];

const NON_INSURANCE_TYPES = [
  "1. Initial Appointment",
  "2. Follow up",
  "Video Consultation",
];

describe("classifyAppointmentType — real Spires insurance types", () => {
  it.each(INSURANCE_TYPES)(
    "%s → insurer %s, isInsurance true, isInitial=%s",
    (typeName, insurer, isInitial) => {
      const c = classifyAppointmentType(typeName);
      expect(c.insurer).toBe(insurer);
      expect(c.isInsurance).toBe(true);
      expect(c.isInitial).toBe(isInitial);
    },
  );
});

describe("classifyAppointmentType — real Spires non-insurance types", () => {
  it.each(NON_INSURANCE_TYPES)("%s → not an insurance type", (typeName) => {
    const c = classifyAppointmentType(typeName);
    expect(c.insurer).toBeNull();
    expect(c.isInsurance).toBe(false);
  });

  it("derives initial vs follow-up on generic names too", () => {
    expect(classifyAppointmentType("1. Initial Appointment").isInitial).toBe(true);
    expect(classifyAppointmentType("2. Follow up").isInitial).toBe(false);
    // No initial/follow-up signal in the name → null.
    expect(classifyAppointmentType("Video Consultation").isInitial).toBeNull();
  });
});

describe("classifyAppointmentType — edge cases", () => {
  it("is case-insensitive", () => {
    expect(classifyAppointmentType("bupa FOLLOW-UP").insurer).toBe("Bupa");
    expect(classifyAppointmentType("vitality initial").insurer).toBe("Vitality");
  });

  it("matches insurer as a substring (e.g. AXA Health, AXA PPP)", () => {
    expect(classifyAppointmentType("AXA Health Initial").insurer).toBe("AXA");
    expect(classifyAppointmentType("AXA PPP Follow up").insurer).toBe("AXA");
  });

  it("handles followup / follow-up / follow up spellings", () => {
    expect(classifyAppointmentType("Bupa Followup").isInitial).toBe(false);
    expect(classifyAppointmentType("Bupa Follow-up").isInitial).toBe(false);
    expect(classifyAppointmentType("Bupa Follow up").isInitial).toBe(false);
    expect(classifyAppointmentType("Bupa Review").isInitial).toBe(false);
  });

  it("treats empty / null / undefined as non-insurance (gate fails safe)", () => {
    for (const v of ["", "   ", null, undefined]) {
      const c = classifyAppointmentType(v);
      expect(c.isInsurance).toBe(false);
      expect(c.insurer).toBeNull();
    }
  });

  it("does not classify an unrelated self-pay name as insurance", () => {
    const c = classifyAppointmentType("Sports Massage 30 min");
    expect(c.isInsurance).toBe(false);
    expect(c.insurer).toBeNull();
  });

  it("exposes the 5 canonical insurers", () => {
    expect(INSURERS).toEqual(["AXA", "Aviva", "Bupa", "Vitality", "WPA"]);
    expect(INSURER_SPECS).toHaveLength(5);
  });
});

describe("evaluateInsurerClaim — wrong-insurer safety net", () => {
  it("no claim → no flag, derived insurer kept authoritative", () => {
    for (const claim of [undefined, null, "", "   "]) {
      const r = evaluateInsurerClaim("Bupa", claim);
      expect(r.insurer).toBe("Bupa");
      expect(r.insurerMismatch).toBe(false);
      expect(r.claimedInsurer).toBeUndefined();
    }
  });

  it("claim == derived (case-insensitive) → no flag", () => {
    expect(evaluateInsurerClaim("Bupa", "Bupa").insurerMismatch).toBe(false);
    expect(evaluateInsurerClaim("Bupa", "bupa").insurerMismatch).toBe(false);
    expect(evaluateInsurerClaim("AXA", "  axa  ").insurerMismatch).toBe(false);
  });

  it("claim != derived → flag set, BOTH values stored, derived stays authoritative", () => {
    const r = evaluateInsurerClaim("Bupa", "AXA");
    expect(r.insurer).toBe("Bupa"); // authoritative value never overwritten
    expect(r.insurerMismatch).toBe(true);
    expect(r.claimedInsurer).toBe("AXA");
  });

  it("never overwrites the derived insurer with the claimed one", () => {
    expect(evaluateInsurerClaim("Vitality", "WPA").insurer).toBe("Vitality");
  });
});
