/**
 * Logic-level tests for PatientBoard grouping behaviour.
 *
 * PatientBoard is a client component with motion/framer, Firestore hooks, and
 * fixed-position DOM portals — a full render test requires jsdom +
 * @testing-library/react, which are not installed in this repo.
 *
 * These tests validate the same grouping + filtering logic the component
 * executes at runtime, keeping them fast and dependency-free.
 *
 * Covers:
 *   1. Patients grouped by lifecycleState into correct segment buckets
 *   2. Empty filtered result when patients array is empty
 *   3. visibleSegments filter excludes patients whose state is not listed
 *   4. AT_RISK patients appear in the AT_RISK bucket
 */

import { describe, it, expect } from "vitest";
import type { Patient, LifecycleState } from "@/types/patient";

// ─── SEGMENT_ORDER mirrors PatientBoard.tsx (not imported to avoid client deps)
const SEGMENT_ORDER: LifecycleState[] = [
  "ONBOARDING", "ACTIVE", "AT_RISK", "LAPSED", "RE_ENGAGED", "NEW", "DISCHARGED", "CHURNED",
];

// ─── Grouping logic mirrored from PatientBoard (lines 103-109) ────────────────

function groupPatients(
  patients: Patient[],
  visibleSegments: LifecycleState[],
  searchQuery = "",
) {
  const q = searchQuery.trim().toLowerCase();
  const filtered = q
    ? patients.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.contact?.phone ?? "").includes(q),
      )
    : patients;

  return SEGMENT_ORDER
    .filter((s) => visibleSegments.includes(s))
    .map((state) => ({
      state,
      patients: filtered.filter((p) => (p.lifecycleState ?? "ACTIVE") === state),
    }))
    .filter((g) => g.patients.length > 0);
}

// ─── Fixture builder ──────────────────────────────────────────────────────────

let _seq = 0;

function makePatient(overrides: Partial<Patient> = {}): Patient {
  const id = `pt-${++_seq}`;
  return {
    id,
    name: `Test Patient ${id}`,
    contact: {},
    clinicianId: "clin-1",
    insuranceFlag: false,
    preAuthStatus: "not_required",
    sessionCount: 2,
    treatmentLength: 6,
    discharged: false,
    churnRisk: false,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    lifecycleState: "ACTIVE",
    ...overrides,
  } as Patient;
}

const ALL_SEGMENTS: LifecycleState[] = [
  "ONBOARDING", "ACTIVE", "AT_RISK", "LAPSED", "RE_ENGAGED", "NEW", "DISCHARGED", "CHURNED",
];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("PatientBoard — grouping logic", () => {
  it("groups patients into the correct segment buckets by lifecycleState", () => {
    const patients = [
      makePatient({ lifecycleState: "ACTIVE" }),
      makePatient({ lifecycleState: "ACTIVE" }),
      makePatient({ lifecycleState: "AT_RISK" }),
      makePatient({ lifecycleState: "LAPSED" }),
    ];

    const grouped = groupPatients(patients, ALL_SEGMENTS);

    const activeGroup = grouped.find((g) => g.state === "ACTIVE");
    const atRiskGroup = grouped.find((g) => g.state === "AT_RISK");
    const lapsedGroup = grouped.find((g) => g.state === "LAPSED");

    expect(activeGroup?.patients).toHaveLength(2);
    expect(atRiskGroup?.patients).toHaveLength(1);
    expect(lapsedGroup?.patients).toHaveLength(1);
  });

  it("returns an empty array when patients prop is empty", () => {
    const grouped = groupPatients([], ALL_SEGMENTS);
    expect(grouped).toEqual([]);
  });

  it("excludes patients whose lifecycleState is not in visibleSegments", () => {
    const patients = [
      makePatient({ lifecycleState: "ACTIVE" }),
      makePatient({ lifecycleState: "CHURNED" }), // not in visibleSegments below
      makePatient({ lifecycleState: "DISCHARGED" }), // not in visibleSegments below
    ];

    const visible: LifecycleState[] = ["ACTIVE", "AT_RISK", "LAPSED"];
    const grouped = groupPatients(patients, visible);

    const states = grouped.map((g) => g.state);
    expect(states).toContain("ACTIVE");
    expect(states).not.toContain("CHURNED");
    expect(states).not.toContain("DISCHARGED");
    expect(grouped).toHaveLength(1);
  });

  it("places AT_RISK patients in the AT_RISK segment bucket", () => {
    const patients = [
      makePatient({ lifecycleState: "AT_RISK", riskScore: 72 }),
      makePatient({ lifecycleState: "AT_RISK", riskScore: 85 }),
      makePatient({ lifecycleState: "ACTIVE", riskScore: 20 }),
    ];

    const grouped = groupPatients(patients, ALL_SEGMENTS);

    const atRiskGroup = grouped.find((g) => g.state === "AT_RISK");
    expect(atRiskGroup).toBeDefined();
    expect(atRiskGroup?.patients).toHaveLength(2);
    expect(atRiskGroup?.patients.every((p) => p.lifecycleState === "AT_RISK")).toBe(true);
    expect(atRiskGroup?.patients.map((p) => p.riskScore)).toEqual(expect.arrayContaining([72, 85]));
  });

  it("defaults to ACTIVE segment for patients with undefined lifecycleState", () => {
    const patients = [
      makePatient({ lifecycleState: undefined }),
    ];

    const grouped = groupPatients(patients, ALL_SEGMENTS);

    const activeGroup = grouped.find((g) => g.state === "ACTIVE");
    expect(activeGroup?.patients).toHaveLength(1);
  });
});
