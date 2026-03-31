/**
 * Tests for Monday week-start calculation used in digest senders.
 *
 * The pattern: given any day, find the preceding Monday.
 * Sunday (getDay()=0) must go back 6 days, not forward 1.
 */

import { describe, it, expect } from "vitest";

/** Canonical week-start calculation — same logic used in notify-owner and send-clinician-digests. */
function getWeekStartMonday(date: Date): Date {
  const result = new Date(date);
  const dayOfWeek = result.getDay();
  result.setDate(result.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  return result;
}

describe("getWeekStartMonday", () => {
  // Week of 2026-03-23 (Mon) to 2026-03-29 (Sun)
  // 2026-03-23=Mon, 24=Tue, 25=Wed, 26=Thu, 27=Fri, 28=Sat, 29=Sun (local, March 29 is Mon in BST)
  // Use a week fully in non-DST to avoid timezone issues: 2026-01-05 (Mon) to 2026-01-11 (Sun)

  it("Monday returns same day", () => {
    const monday = new Date(2026, 0, 5); // Jan 5 2026 = Monday
    expect(monday.getDay()).toBe(1);
    const result = getWeekStartMonday(monday);
    expect(result.getDate()).toBe(5);
  });

  it("Tuesday returns previous Monday", () => {
    const tuesday = new Date(2026, 0, 6);
    expect(tuesday.getDay()).toBe(2);
    const result = getWeekStartMonday(tuesday);
    expect(result.getDate()).toBe(5);
  });

  it("Wednesday returns previous Monday", () => {
    const wed = new Date(2026, 0, 7);
    expect(wed.getDay()).toBe(3);
    const result = getWeekStartMonday(wed);
    expect(result.getDate()).toBe(5);
  });

  it("Friday returns previous Monday", () => {
    const fri = new Date(2026, 0, 9);
    expect(fri.getDay()).toBe(5);
    const result = getWeekStartMonday(fri);
    expect(result.getDate()).toBe(5);
  });

  it("Saturday returns previous Monday", () => {
    const sat = new Date(2026, 0, 10);
    expect(sat.getDay()).toBe(6);
    const result = getWeekStartMonday(sat);
    expect(result.getDate()).toBe(5);
  });

  it("Sunday returns previous Monday (not next Monday)", () => {
    // Critical edge case — Sunday must go BACK 6 days
    const sunday = new Date(2026, 0, 11);
    expect(sunday.getDay()).toBe(0);
    const result = getWeekStartMonday(sunday);
    expect(result.getDate()).toBe(5);
    expect(result.getMonth()).toBe(0); // Still January
  });

  it("handles month boundary (Sunday Feb 1 2026)", () => {
    // 2026-02-01 is a Sunday
    const sunday = new Date(2026, 1, 1);
    expect(sunday.getDay()).toBe(0);
    const result = getWeekStartMonday(sunday);
    expect(result.getDate()).toBe(26); // Jan 26
    expect(result.getMonth()).toBe(0); // January
  });
});
