/**
 * Voice-channel KPIs derived from /clinics/{id}/call_facts (AVA_CALL_ENDED).
 * These are clinic-wide counters — not per-clinician — but are stamped on
 * every WeeklyStats doc so a single read of metrics_weekly surfaces them in
 * the dashboard.
 *
 * Contract: empty input → all three KPIs `null` (absence of Ava data is
 * meaningfully different from a zero rate). Any non-empty input → numeric.
 */

import { describe, it, expect } from "vitest";
import { computeVoiceKpis, type CallFactLike } from "@/lib/metrics/compute-weekly";

function endedFact(overrides: Partial<CallFactLike["payload"]> = {}): CallFactLike {
  return {
    type: "AVA_CALL_ENDED",
    payload: {
      booked: false,
      transferred: false,
      endedAt: "2026-05-04T10:00:00Z",
      ...overrides,
    },
  };
}

describe("computeVoiceKpis", () => {
  it("returns null for all three KPIs when call_facts is empty", () => {
    const result = computeVoiceKpis([]);
    expect(result.voiceBookingConversionRate).toBeNull();
    expect(result.voiceCallVolume).toBeNull();
    expect(result.voiceTransferRate).toBeNull();
  });

  it("computes 0.5 conversion when 5 of 10 facts are booked", () => {
    const facts: CallFactLike[] = [
      ...Array.from({ length: 5 }, () => endedFact({ booked: true })),
      ...Array.from({ length: 5 }, () => endedFact({ booked: false })),
    ];
    const result = computeVoiceKpis(facts);
    expect(result.voiceBookingConversionRate).toBe(0.5);
    expect(result.voiceCallVolume).toBe(10);
  });

  it("computes 0.2 transfer rate when 2 of 10 facts are transferred", () => {
    const facts: CallFactLike[] = [
      ...Array.from({ length: 2 }, () => endedFact({ transferred: true })),
      ...Array.from({ length: 8 }, () => endedFact({ transferred: false })),
    ];
    const result = computeVoiceKpis(facts);
    expect(result.voiceTransferRate).toBe(0.2);
    expect(result.voiceCallVolume).toBe(10);
  });

  it("includes facts with absent type (defensive) but excludes other event types", () => {
    // AVA_BOOKING_ATTEMPTED / AVA_CALL_ABANDONED would otherwise distort the
    // ratios — only AVA_CALL_ENDED rows define the denominator.
    const facts: CallFactLike[] = [
      endedFact({ booked: true }),
      endedFact({ booked: true }),
      { type: "AVA_BOOKING_ATTEMPTED", payload: { booked: true, transferred: false } },
      { type: "AVA_CALL_ABANDONED", payload: { booked: false, transferred: true } },
    ];
    const result = computeVoiceKpis(facts);
    expect(result.voiceCallVolume).toBe(2);
    expect(result.voiceBookingConversionRate).toBe(1);
    expect(result.voiceTransferRate).toBe(0);
  });
});
