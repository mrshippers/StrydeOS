/**
 * Tests for preview-styling.ts — the pure helpers that decide which
 * tint/badge class a column or cell gets in the Rainbow-CSV-style preview.
 * Split out from the component so the styling rules are testable without
 * spinning up jsdom.
 *
 * Run: npx vitest run src/lib/csv-import/__tests__/preview-styling.test.ts
 */

import { describe, it, expect } from "vitest";
import {
  columnTintClass,
  columnStatusClass,
  columnStatusLabel,
} from "../preview-styling";
import type { ColumnSnapshot } from "../failure-snapshot";

function col(overrides: Partial<ColumnSnapshot> = {}): ColumnSnapshot {
  return {
    header: "Col",
    mapped: true,
    canonicalField: "date",
    isRequired: false,
    ...overrides,
  };
}

describe("columnTintClass — alternating column tints (Rainbow-CSV feel)", () => {
  it("uses the palette index modulo palette length", () => {
    const classes = Array.from({ length: 10 }, (_, i) => columnTintClass(i));
    // First 6 should all be different; 7th repeats the 1st
    expect(new Set(classes.slice(0, 6)).size).toBe(6);
    expect(classes[6]).toBe(classes[0]);
  });

  it("returns a non-empty className string for every index", () => {
    for (let i = 0; i < 20; i++) {
      expect(columnTintClass(i)).toMatch(/\S/);
    }
  });
});

describe("columnStatusClass — per-column badge styling", () => {
  it("green for mapped + required", () => {
    const cls = columnStatusClass(col({ mapped: true, isRequired: true }));
    expect(cls).toContain("success");
  });

  it("blue for mapped but not required", () => {
    const cls = columnStatusClass(col({ mapped: true, isRequired: false }));
    expect(cls).toContain("blue");
  });

  it("amber for unmapped", () => {
    const cls = columnStatusClass(
      col({ mapped: false, canonicalField: undefined, isRequired: false }),
    );
    expect(cls).toContain("warn");
  });
});

describe("columnStatusLabel — human-readable column status", () => {
  it("shows canonical field name for mapped columns", () => {
    expect(columnStatusLabel(col({ mapped: true, canonicalField: "practitioner" })))
      .toBe("practitioner");
  });

  it("'required' suffix for required mapped columns", () => {
    expect(
      columnStatusLabel(
        col({ mapped: true, canonicalField: "date", isRequired: true }),
      ),
    ).toBe("date · required");
  });

  it("'unmapped' for unmatched columns", () => {
    expect(
      columnStatusLabel(
        col({ mapped: false, canonicalField: undefined, isRequired: false }),
      ),
    ).toBe("unmapped");
  });
});
