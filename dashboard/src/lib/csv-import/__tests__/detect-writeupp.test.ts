import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { detectSchema } from "../detect";
import { BUILTIN_SCHEMAS } from "../schemas";
import { validateCSV } from "../validate";
import type { CSVSchema, ValidationError } from "../types";

function headersOf(csvPath: string): string[] {
  const content = readFileSync(csvPath, "utf-8");
  const firstLine = content.split(/\r?\n/)[0];
  // Simple split — these fixture files have no quoted commas in their headers.
  return firstLine.split(",").map((h) => h.trim());
}

const ACTIVITY_CSV = join(
  __dirname,
  "../../../../scripts/data/activity-by-date.csv"
);
const INCOME_CSV = join(
  __dirname,
  "../../../../scripts/data/income-by-clinician.csv"
);

describe("detectSchema — WriteUpp canonical exports", () => {
  it("Canonical WriteUpp Activity-by-Date export detects with confidence >= 0.9", () => {
    const headers = headersOf(ACTIVITY_CSV);
    const result = detectSchema(headers, BUILTIN_SCHEMAS, "appointments");

    expect(result).toBeTruthy();
    expect(result!.schema.id).toBe("writeupp");
    expect(result!.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("WriteUpp Income-by-Clinician export detects as WriteUpp with confidence >= 0.7", () => {
    const headers = headersOf(INCOME_CSV);
    const result = detectSchema(headers, BUILTIN_SCHEMAS, "both");

    expect(result).toBeTruthy();
    expect(result!.schema.id).toBe("writeupp");
    expect(result!.confidence).toBeGreaterThanOrEqual(0.7);
  });
});

describe("validateCSV — date_format_mismatch", () => {
  // Minimal Firestore stub — validate.ts only uses .collection().doc().collection().where().limit().get()
  // when `fileContent` is passed. We omit fileContent so this branch never executes.
  const dbStub = {
    collection: () => ({
      doc: () => ({
        collection: () => ({
          where: () => ({
            limit: () => ({
              get: async () => ({ empty: true, docs: [] }),
            }),
          }),
        }),
      }),
    }),
  };

  const writeuppSchema: CSVSchema = BUILTIN_SCHEMAS.find((s) => s.id === "writeupp")!;

  it("surfaces a typed date_format_mismatch error when >50% of failed UK rows look like US M/D/YYYY", async () => {
    // 10 rows: 6 US-format (3/14, 4/15, 5/20, 6/25, 7/30, 8/31 → all fail UK parse with m>12)
    //          2 valid UK rows (14/03, 15/04)
    //          2 malformed rows (unparseable under any format)
    const rows: Record<string, string>[] = [
      { Date: "3/14/2026", With: "Max", Status: "attended" },
      { Date: "4/15/2026", With: "Max", Status: "attended" },
      { Date: "5/20/2026", With: "Max", Status: "attended" },
      { Date: "6/25/2026", With: "Max", Status: "attended" },
      { Date: "7/30/2026", With: "Max", Status: "attended" },
      { Date: "8/31/2026", With: "Max", Status: "attended" },
      { Date: "14/03/2026", With: "Max", Status: "attended" },
      { Date: "15/04/2026", With: "Max", Status: "attended" },
      { Date: "garbage", With: "Max", Status: "attended" },
      { Date: "also-garbage", With: "Max", Status: "attended" },
    ];

    const result = await validateCSV(
      rows,
      writeuppSchema,
      "test-clinic",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dbStub as any
    );

    const mismatch = result.errors.find(
      (e: ValidationError) => e.type === "date_format_mismatch"
    );
    expect(mismatch).toBeTruthy();
    expect(mismatch!.message).toContain("US-format dates");
    expect(mismatch!.message).toContain("3/14/2026");
    expect(mismatch!.message).toContain("14/03/2026");
    expect(mismatch!.message).toContain("WriteUpp");

    const details = mismatch!.details as {
      expected: string;
      detected: string;
      sampleBadDates: string[];
    };
    expect(details.expected).toBe("uk");
    expect(details.detected).toBe("us");
    expect(details.sampleBadDates).toHaveLength(3);
    for (const sample of details.sampleBadDates) {
      expect(typeof sample).toBe("string");
    }
  });

  it("does NOT raise date_format_mismatch when most failed rows are simply malformed", async () => {
    const rows: Record<string, string>[] = [
      { Date: "14/03/2026", With: "Max", Status: "attended" },
      { Date: "15/04/2026", With: "Max", Status: "attended" },
      { Date: "16/05/2026", With: "Max", Status: "attended" },
      { Date: "garbage-1", With: "Max", Status: "attended" },
      { Date: "garbage-2", With: "Max", Status: "attended" },
      { Date: "garbage-3", With: "Max", Status: "attended" },
    ];

    const result = await validateCSV(
      rows,
      writeuppSchema,
      "test-clinic",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dbStub as any
    );

    const mismatch = result.errors.find(
      (e: ValidationError) => e.type === "date_format_mismatch"
    );
    expect(mismatch).toBeFalsy();
  });
});
