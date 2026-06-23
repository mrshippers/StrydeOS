import { describe, it, expect } from "vitest";
import { expectedProviderFromBaseUrl, detectPmsProviderMismatch } from "../factory";
import type { PMSIntegrationConfig } from "@/types/pms";

const cfg = (provider: string, baseUrl?: string): PMSIntegrationConfig =>
  ({ provider: provider as PMSIntegrationConfig["provider"], apiKey: "k", baseUrl });

describe("expectedProviderFromBaseUrl", () => {
  it("maps known hosts to providers", () => {
    expect(expectedProviderFromBaseUrl("https://api.uk3.cliniko.com/v1")).toBe("cliniko");
    expect(expectedProviderFromBaseUrl("https://api.writeupp.com")).toBe("writeupp");
    expect(expectedProviderFromBaseUrl("https://app.halaxy.com/api")).toBe("halaxy");
  });
  it("returns null for unknown or empty hosts", () => {
    expect(expectedProviderFromBaseUrl("https://example.com")).toBeNull();
    expect(expectedProviderFromBaseUrl(undefined)).toBeNull();
  });
});

describe("detectPmsProviderMismatch", () => {
  it("flags the exact Spires drift: writeupp provider on a cliniko endpoint", () => {
    const msg = detectPmsProviderMismatch(cfg("writeupp", "https://api.uk3.cliniko.com/v1"));
    expect(msg).toBeTruthy();
    expect(msg).toContain("cliniko");
    expect(msg).toContain("writeupp");
  });
  it("returns null when provider matches the endpoint", () => {
    expect(detectPmsProviderMismatch(cfg("cliniko", "https://api.uk3.cliniko.com/v1"))).toBeNull();
    expect(detectPmsProviderMismatch(cfg("writeupp", "https://api.writeupp.com"))).toBeNull();
  });
  it("does not block when the host is unrecognised", () => {
    expect(detectPmsProviderMismatch(cfg("cliniko", "https://proxy.internal.local"))).toBeNull();
    expect(detectPmsProviderMismatch(cfg("cliniko", undefined))).toBeNull();
  });
});
