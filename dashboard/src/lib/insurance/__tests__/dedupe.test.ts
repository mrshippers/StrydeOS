import { describe, it, expect } from "vitest";
import {
  evaluateIntakeSuppression,
  INTAKE_RESEND_COOLDOWN_MS,
  INTAKE_SUBMITTED_VALIDITY_MS,
  type IntakeLinkLike,
} from "../dedupe";

const NOW = Date.parse("2026-06-09T12:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3600_000).toISOString();
const daysAgo = (d: number) => new Date(NOW - d * 86400_000).toISOString();

describe("evaluateIntakeSuppression", () => {
  it("allows a first-ever send (no prior links)", () => {
    const r = evaluateIntakeSuppression([], NOW);
    expect(r.suppress).toBe(false);
    expect(r.reason).toBeNull();
  });

  it("suppresses when a link was issued within the cooldown window", () => {
    const links: IntakeLinkLike[] = [{ status: "issued", createdAt: hoursAgo(2) }];
    const r = evaluateIntakeSuppression(links, NOW);
    expect(r.suppress).toBe(true);
    expect(r.reason).toBe("recently_sent");
    expect(r.lastSentAt).toBe(hoursAgo(2));
  });

  it("allows a re-send once the cooldown has elapsed", () => {
    const links: IntakeLinkLike[] = [{ status: "issued", createdAt: hoursAgo(30) }];
    const r = evaluateIntakeSuppression(links, NOW);
    expect(r.suppress).toBe(false);
  });

  it("suppresses when the patient already submitted within the validity window", () => {
    const links: IntakeLinkLike[] = [
      { status: "submitted", createdAt: daysAgo(40), submittedAt: daysAgo(40) },
    ];
    const r = evaluateIntakeSuppression(links, NOW);
    expect(r.suppress).toBe(true);
    expect(r.reason).toBe("already_submitted");
    expect(r.lastSentAt).toBe(daysAgo(40));
  });

  it("re-asks once a submission is older than the validity window", () => {
    const links: IntakeLinkLike[] = [
      { status: "submitted", createdAt: daysAgo(120), submittedAt: daysAgo(120) },
    ];
    const r = evaluateIntakeSuppression(links, NOW);
    expect(r.suppress).toBe(false);
  });

  it("prioritises already_submitted over recently_sent", () => {
    // Submitted recently AND an even more recent issued link — submitted wins.
    const links: IntakeLinkLike[] = [
      { status: "submitted", createdAt: daysAgo(2), submittedAt: daysAgo(2) },
      { status: "issued", createdAt: hoursAgo(1) },
    ];
    const r = evaluateIntakeSuppression(links, NOW);
    expect(r.reason).toBe("already_submitted");
  });

  it("reflects the real Spires case: 3 links, one submitted today -> suppressed", () => {
    const links: IntakeLinkLike[] = [
      { status: "issued", createdAt: hoursAgo(18) },
      { status: "submitted", createdAt: hoursAgo(17), submittedAt: hoursAgo(15) },
      { status: "issued", createdAt: hoursAgo(16) },
    ];
    const r = evaluateIntakeSuppression(links, NOW);
    expect(r.suppress).toBe(true);
    expect(r.reason).toBe("already_submitted");
  });

  it("honours custom thresholds", () => {
    const links: IntakeLinkLike[] = [{ status: "issued", createdAt: hoursAgo(2) }];
    expect(evaluateIntakeSuppression(links, NOW, { cooldownMs: 3600_000 }).suppress).toBe(false);
  });

  it("uses the documented default thresholds", () => {
    expect(INTAKE_RESEND_COOLDOWN_MS).toBe(24 * 60 * 60 * 1000);
    expect(INTAKE_SUBMITTED_VALIDITY_MS).toBe(90 * 24 * 60 * 60 * 1000);
  });
});
