import { describe, it, expect } from "vitest";
import { matchClinician } from "../clinician-match";

describe("matchClinician", () => {
  it("(a) exact match wins with confidence 1.0", () => {
    const result = matchClinician({
      practitionerName: "Andrew Henry",
      clinicians: [
        { id: "c-andrew", name: "Andrew Henry" },
        { id: "c-max", name: "Max Hubbard" },
      ],
    });

    expect(result.clinicianId).toBe("c-andrew");
    expect(result.confidence).toBe(1.0);
    expect(result.alternatives).toEqual([]);
    expect(result.matchType).toBe("exact");
  });

  it("(b) first-name-only match for unique first name returns confidence 1.0", () => {
    const result = matchClinician({
      practitionerName: "Jamal",
      clinicians: [
        { id: "c-jamal", name: "Jamal" },
        { id: "c-andrew", name: "Andrew Henry" },
      ],
    });

    expect(result.clinicianId).toBe("c-jamal");
    expect(result.confidence).toBe(1.0);
    expect(result.alternatives).toEqual([]);
  });

  it("(b2) first-name-only input matches multi-token clinician by unique first-name token", () => {
    const result = matchClinician({
      practitionerName: "Andrew",
      clinicians: [
        { id: "c-andrew", name: "Andrew Henry" },
        { id: "c-max", name: "Max Hubbard" },
      ],
    });

    expect(result.clinicianId).toBe("c-andrew");
    expect(result.confidence).toBe(1.0);
    expect(result.matchType).toBe("firstName");
  });

  it("(c) Levenshtein near-match returns single candidate above threshold", () => {
    const result = matchClinician({
      practitionerName: "Andy Henry",
      clinicians: [
        { id: "c-andrew", name: "Andrew Henry" },
      ],
    });

    expect(result.clinicianId).toBe("c-andrew");
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    expect(result.confidence).toBeLessThanOrEqual(0.95);
    expect(result.alternatives).toEqual([]);
    expect(result.matchType).toBe("fuzzy");
  });

  it("(d) ambiguous first-name match returns alternatives", () => {
    const result = matchClinician({
      practitionerName: "John",
      clinicians: [
        { id: "c-john-s", name: "John Smith" },
        { id: "c-john-p", name: "John Pemberton" },
      ],
    });

    expect(result.clinicianId).toBeNull();
    expect(result.confidence).toBe(0);
    expect(result.alternatives).toHaveLength(2);
    const ids = result.alternatives.map((a) => a.id).sort();
    expect(ids).toEqual(["c-john-p", "c-john-s"]);
  });

  it("(e) no match against unrelated clinicians", () => {
    const result = matchClinician({
      practitionerName: "Susan O'Brien",
      clinicians: [
        { id: "c-andrew", name: "Andrew Henry" },
        { id: "c-max", name: "Max Hubbard" },
      ],
    });

    expect(result.clinicianId).toBeNull();
    expect(result.confidence).toBe(0);
    expect(result.alternatives).toEqual([]);
    expect(result.matchType).toBe("none");
  });

  it("(f) PMS external ID match wins over name match", () => {
    const result = matchClinician({
      practitionerName: "Different Person",
      practitionerId: "andy-1",
      clinicians: [
        { id: "c-andrew", name: "Andrew Henry", pmsExternalId: "andy-1" },
        { id: "c-max", name: "Max Hubbard", pmsExternalId: "max-1" },
      ],
    });

    expect(result.clinicianId).toBe("c-andrew");
    expect(result.confidence).toBe(1.0);
    expect(result.alternatives).toEqual([]);
    expect(result.matchType).toBe("pmsExternalId");
  });

  it("filters out inactive clinicians from name matching", () => {
    const result = matchClinician({
      practitionerName: "Andrew Henry",
      clinicians: [
        { id: "c-andrew-old", name: "Andrew Henry", active: false },
        { id: "c-max", name: "Max Hubbard", active: true },
      ],
    });

    // The only exact-name match is inactive, so no active-set match is found
    expect(result.clinicianId).toBeNull();
    expect(result.matchType).toBe("none");
  });
});
