import { describe, it, expect } from "vitest";
import {
  DEFAULT_APPOINTMENT_TYPE_MAP,
  INTEGRATIONS_CONFIG,
  PMS_DOC_ID,
  HEP_DOC_ID,
  PIPELINE_DOC_ID,
  REVIEWS_DOC_ID,
  DEFAULT_TREATMENT_LENGTH,
  BACKFILL_WEEKS,
  INCREMENTAL_WEEKS,
} from "../types";

describe("pipeline types and constants", () => {
  it("maps common PMS appointment names to canonical types", () => {
    expect(DEFAULT_APPOINTMENT_TYPE_MAP["Initial Assessment"]).toBe("initial_assessment");
    expect(DEFAULT_APPOINTMENT_TYPE_MAP["Initial Consultation"]).toBe("initial_assessment");
    expect(DEFAULT_APPOINTMENT_TYPE_MAP["Follow Up"]).toBe("follow_up");
    expect(DEFAULT_APPOINTMENT_TYPE_MAP["Follow-Up"]).toBe("follow_up");
    expect(DEFAULT_APPOINTMENT_TYPE_MAP["Review"]).toBe("review");
    expect(DEFAULT_APPOINTMENT_TYPE_MAP["Discharge"]).toBe("discharge");
  });

  it("uses consistent collection and doc IDs", () => {
    expect(INTEGRATIONS_CONFIG).toBe("integrations_config");
    expect(PMS_DOC_ID).toBe("pms");
    expect(HEP_DOC_ID).toBe("hep");
    expect(PIPELINE_DOC_ID).toBe("pipeline");
    expect(REVIEWS_DOC_ID).toBe("google_reviews");
  });

  it("has sensible defaults for treatment length and sync windows", () => {
    expect(DEFAULT_TREATMENT_LENGTH).toBe(6);
    expect(BACKFILL_WEEKS).toBe(26);
    expect(INCREMENTAL_WEEKS).toBe(4);
    expect(BACKFILL_WEEKS).toBeGreaterThan(INCREMENTAL_WEEKS);
  });
});
