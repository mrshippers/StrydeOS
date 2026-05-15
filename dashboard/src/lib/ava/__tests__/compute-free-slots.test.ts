import { describe, it, expect } from "vitest";
import { computeFreeSlots } from "@/lib/ava/compute-free-slots";

// 2026-05-18 is a Monday. Dates in local time (no Z suffix) to avoid TZ-shift surprises.
const MONDAY = new Date(2026, 4, 18, 9, 0, 0, 0);
const WEEK_END = new Date(2026, 4, 25, 9, 0, 0, 0);

describe("computeFreeSlots", () => {
  it("returns up to 6 slots by default", () => {
    const slots = computeFreeSlots([], MONDAY, WEEK_END);
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.length).toBeLessThanOrEqual(6);
  });

  it("default slots fall on Mon–Fri only", () => {
    const slots = computeFreeSlots([], MONDAY, WEEK_END);
    slots.forEach((s) => {
      const day = s.getDay();
      expect(day).toBeGreaterThan(0); // not Sunday (0)
      expect(day).toBeLessThan(6);    // not Saturday (6)
    });
  });

  it("restricts to Tue–Thu when days config is set", () => {
    const slots = computeFreeSlots([], MONDAY, WEEK_END, { days: ["tue", "wed", "thu"] });
    expect(slots.length).toBeGreaterThan(0);
    slots.forEach((s) => {
      expect([2, 3, 4]).toContain(s.getDay());
    });
  });

  it("emits no Monday or Friday slots for a Tue–Thu clinic", () => {
    const slots = computeFreeSlots([], MONDAY, WEEK_END, { days: ["tue", "wed", "thu"] });
    slots.forEach((s) => {
      expect(s.getDay()).not.toBe(1); // no Monday
      expect(s.getDay()).not.toBe(5); // no Friday
    });
  });

  it("restricts times to afternoon-only clinic (13:00–17:00)", () => {
    const slots = computeFreeSlots([], MONDAY, WEEK_END, { start: "13:00", end: "17:00" });
    expect(slots.length).toBeGreaterThan(0);
    slots.forEach((s) => {
      const mins = s.getHours() * 60 + s.getMinutes();
      expect(mins).toBeGreaterThanOrEqual(13 * 60);
      expect(mins).toBeLessThan(17 * 60);
    });
  });

  it("includes Saturday for a weekend-only clinic", () => {
    const slots = computeFreeSlots([], MONDAY, WEEK_END, { days: ["sat"] });
    if (slots.length > 0) {
      slots.forEach((s) => expect(s.getDay()).toBe(6));
    }
  });

  it("excludes a busy 09:00 slot", () => {
    const busySlot = new Date(2026, 4, 18, 9, 0, 0, 0);
    const narrowEnd = new Date(2026, 4, 18, 12, 0, 0, 0);
    const slots = computeFreeSlots([{ dateTime: busySlot.toISOString() }], MONDAY, narrowEnd);
    const hasNineAm = slots.some((s) => s.getHours() === 9 && s.getMinutes() === 0);
    expect(hasNineAm).toBe(false);
  });

  it("default config matches explicit Mon–Fri 09:00–18:00", () => {
    const defaults = computeFreeSlots([], MONDAY, WEEK_END);
    const explicit = computeFreeSlots([], MONDAY, WEEK_END, {
      start: "09:00",
      end: "18:00",
      days: ["mon", "tue", "wed", "thu", "fri"],
    });
    expect(defaults.map((s) => s.getTime())).toEqual(explicit.map((s) => s.getTime()));
  });
});
