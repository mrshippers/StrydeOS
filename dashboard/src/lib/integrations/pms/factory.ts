import type { PMSAdapter, PMSIntegrationConfig } from "@/types/pms";
import { createWriteUppAdapter } from "./writeupp/adapter";
import { createClinikoAdapter } from "./cliniko/adapter";
import { createHalaxyAdapter } from "./halaxy/adapter";
import { createZandaAdapter } from "./zanda/adapter";

/** Allowed PMS API domains — reject anything outside this list to prevent SSRF. */
const PMS_DOMAIN_ALLOWLIST = [
  "api.writeupp.com",
  "api.cliniko.com",
  "api.au1.cliniko.com",
  "api.au2.cliniko.com",
  "api.au3.cliniko.com",
  "api.eu1.cliniko.com",
  "api.uk1.cliniko.com",
  "api.ca1.cliniko.com",
  "api.halaxy.com",
  "api.au.halaxy.com",
  "api.uk.halaxy.com",
  "api.powerdiary.com",
];

function validateBaseUrl(baseUrl: string | undefined): void {
  if (!baseUrl) return;
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error(`Invalid PMS baseUrl: ${baseUrl}`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`PMS baseUrl must use HTTPS: ${baseUrl}`);
  }
  if (!PMS_DOMAIN_ALLOWLIST.some((d) => parsed.hostname === d || parsed.hostname.endsWith(`.${d}`))) {
    throw new Error(`PMS baseUrl domain not in allowlist: ${parsed.hostname}`);
  }
}

export function createPMSAdapter(config: PMSIntegrationConfig): PMSAdapter {
  const { provider, apiKey, baseUrl } = config;
  validateBaseUrl(baseUrl);
  switch (provider) {
    case "writeupp":
      return createWriteUppAdapter({ apiKey, baseUrl });
    case "cliniko":
      return createClinikoAdapter({ apiKey, baseUrl });
    case "halaxy":
      return createHalaxyAdapter({ apiKey, baseUrl });
    case "powerdiary":
      return createZandaAdapter({ apiKey, baseUrl });
    case "tm3":
      throw new Error("TM3 adapter not yet implemented");
    case "pps":
      throw new Error("PPS adapter not yet implemented — API docs gated behind docs.pps-api.com (requires PPS Express login)");
    default:
      throw new Error(`Unknown PMS provider: ${provider}`);
  }
}
