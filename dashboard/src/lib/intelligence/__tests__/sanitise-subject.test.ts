import { describe, it, expect } from "vitest";
import { sanitiseSubject } from "../sanitise-subject";

describe("sanitiseSubject", () => {
  it("normalises an em dash (U+2014) to a hyphen", () => {
    expect(sanitiseSubject("Your clinic this week — Spires")).toBe(
      "Your clinic this week - Spires"
    );
  });

  it("normalises an en dash (U+2013) to a hyphen", () => {
    expect(sanitiseSubject("Ava digest – Spires")).toBe(
      "Ava digest - Spires"
    );
  });

  it("strips a newline (LF) from a subject", () => {
    expect(sanitiseSubject("Subject\nBcc: attacker@evil.com")).toBe(
      "SubjectBcc: attacker@evil.com"
    );
  });

  it("strips a carriage return (CR) from a subject", () => {
    expect(sanitiseSubject("Subject\rBcc: attacker@evil.com")).toBe(
      "SubjectBcc: attacker@evil.com"
    );
  });

  it("strips all ASCII control characters", () => {
    expect(sanitiseSubject("Hello\x00\x01\x1f\x7fWorld")).toBe("HelloWorld");
  });

  it("leaves a clean subject unchanged", () => {
    const clean = "Your clinic this week - Spires";
    expect(sanitiseSubject(clean)).toBe(clean);
  });

  it("handles multiple dashes in one subject", () => {
    expect(sanitiseSubject("Alert — Issue – Clinic")).toBe(
      "Alert - Issue - Clinic"
    );
  });
});
