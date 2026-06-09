import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  deriveSmsSenderId,
  emailDisplayName,
  brandingFromClinicData,
} from "../clinic-branding";

describe("deriveSmsSenderId", () => {
  it("keeps a short single-word name as-is", () => {
    expect(deriveSmsSenderId("Spires")).toBe("Spires");
  });

  it("keeps whole words only, never a broken truncation", () => {
    // "Spires Physiotherapy" -> drop the second word (would exceed 11), keep "Spires"
    expect(deriveSmsSenderId("Spires Physiotherapy")).toBe("Spires");
  });

  it("accumulates multiple short words up to the 11-char limit", () => {
    expect(deriveSmsSenderId("West End")).toBe("West End"); // 8 chars
  });

  it("hard-truncates a single word longer than 11 chars", () => {
    expect(deriveSmsSenderId("Physiotherapy")).toBe("Physiothera"); // 11 chars
  });

  it("strips punctuation and collapses whitespace", () => {
    expect(deriveSmsSenderId("  St. Anne's  ")).toBe("St Anne s");
  });

  it("returns null for an all-numeric name (carriers reject numeric IDs)", () => {
    expect(deriveSmsSenderId("0207 123")).toBeNull();
  });

  it("returns null for empty / whitespace input", () => {
    expect(deriveSmsSenderId("")).toBeNull();
    expect(deriveSmsSenderId("   ")).toBeNull();
  });
});

describe("emailDisplayName", () => {
  it("passes through a plain clinic name", () => {
    expect(emailDisplayName("Spires Physiotherapy")).toBe("Spires Physiotherapy");
  });

  it("strips header-breaking characters", () => {
    expect(emailDisplayName('Spires "Physio" <x>')).toBe("Spires Physio x");
  });

  it("quotes names containing RFC specials", () => {
    expect(emailDisplayName("Smith, Jones & Co")).toBe('"Smith, Jones & Co"');
  });

  it("returns empty string when nothing usable remains", () => {
    expect(emailDisplayName('  "<>"  ')).toBe("");
  });
});

describe("brandingFromClinicData", () => {
  const ORIGINAL_FROM = process.env.RESEND_FROM_EMAIL;
  const ORIGINAL_SMS = process.env.TWILIO_SMS_SENDER;
  beforeEach(() => {
    process.env.RESEND_FROM_EMAIL = "noreply@strydeos.com";
    process.env.TWILIO_SMS_SENDER = "StrydeOS";
  });
  afterEach(() => {
    if (ORIGINAL_FROM === undefined) delete process.env.RESEND_FROM_EMAIL;
    else process.env.RESEND_FROM_EMAIL = ORIGINAL_FROM;
    if (ORIGINAL_SMS === undefined) delete process.env.TWILIO_SMS_SENDER;
    else process.env.TWILIO_SMS_SENDER = ORIGINAL_SMS;
  });

  it("derives sender + From from the clinic name", () => {
    const b = brandingFromClinicData({ name: "Spires Physiotherapy" });
    expect(b.clinicName).toBe("Spires Physiotherapy");
    expect(b.smsSender).toBe("Spires");
    expect(b.emailFromName).toBe("Spires Physiotherapy");
    expect(b.emailFrom).toBe("Spires Physiotherapy <noreply@strydeos.com>");
  });

  it("honours explicit overrides over the derived name", () => {
    const b = brandingFromClinicData({
      name: "Spires Physiotherapy",
      smsSenderId: "SpiresPhys",
      emailFromName: "Spires Clinic",
    });
    expect(b.smsSender).toBe("SpiresPhys");
    expect(b.emailFrom).toBe("Spires Clinic <noreply@strydeos.com>");
  });

  it("falls back to StrydeOS branding when no name is set", () => {
    // No real name -> derive returns null -> global SMS sender; From name -> "StrydeOS".
    const b = brandingFromClinicData({});
    expect(b.clinicName).toBe("Your clinic");
    expect(b.smsSender).toBe("StrydeOS");
    expect(b.emailFromName).toBe("StrydeOS");
  });
});
