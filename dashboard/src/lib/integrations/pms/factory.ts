import type { PMSAdapter, PMSAppointment, PMSIntegrationConfig } from "@/types/pms";
import { createWriteUppAdapter } from "./writeupp/adapter";
import { createClinikoAdapter } from "./cliniko/adapter";
import { createHalaxyAdapter } from "./halaxy/adapter";
import { createZandaAdapter } from "./zanda/adapter";

/** Allowed PMS API domains — reject anything outside this list to prevent SSRF. */
const PMS_DOMAIN_ALLOWLIST = [
  "app.writeupp.com",
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

/**
 * Validates a PMS appointment has the minimum required fields.
 * Filters out appointments with empty IDs that would create ghost data downstream.
 */
function isValidAppointment(appt: PMSAppointment, provider: string): boolean {
  if (!appt.externalId) {
    console.warn(`[PMS:${provider}] Skipping appointment with empty externalId`);
    return false;
  }
  if (!appt.patientExternalId) {
    console.warn(`[PMS:${provider}] Skipping appointment ${appt.externalId}: empty patientExternalId`);
    return false;
  }
  if (!appt.clinicianExternalId) {
    console.warn(`[PMS:${provider}] Skipping appointment ${appt.externalId}: empty clinicianExternalId`);
    return false;
  }
  if (!appt.dateTime) {
    console.warn(`[PMS:${provider}] Skipping appointment ${appt.externalId}: empty dateTime`);
    return false;
  }
  return true;
}

/**
 * Wraps a raw PMS adapter with validation that filters out malformed appointments
 * and catches API errors gracefully, preventing silent data corruption.
 */
function withValidation(adapter: PMSAdapter, provider: string): PMSAdapter {
  return {
    ...adapter,
    async getAppointments(opts) {
      try {
        const raw = await adapter.getAppointments(opts);
        const valid = raw.filter((a) => isValidAppointment(a, provider));
        if (valid.length < raw.length) {
          console.warn(`[PMS:${provider}] Filtered ${raw.length - valid.length} invalid appointments out of ${raw.length}`);
        }
        return valid;
      } catch (err) {
        console.error(`[PMS:${provider}] getAppointments failed:`, err);
        throw err;
      }
    },
    async getPatient(externalId) {
      try {
        return await adapter.getPatient(externalId);
      } catch (err) {
        console.error(`[PMS:${provider}] getPatient(${externalId}) failed:`, err);
        // Return minimal valid patient to prevent downstream crashes
        return { externalId, firstName: "", lastName: "" };
      }
    },
    async createAppointment(appt) {
      if (!adapter.createAppointment) throw new Error(`${provider} does not support createAppointment`);
      const result = await adapter.createAppointment(appt);
      if (!result.externalId) {
        throw new Error(`[PMS:${provider}] createAppointment returned empty externalId`);
      }
      return result;
    },
  };
}

export function createPMSAdapter(config: PMSIntegrationConfig): PMSAdapter {
  const { provider, apiKey, baseUrl } = config;
  validateBaseUrl(baseUrl);

  let raw: PMSAdapter;
  switch (provider) {
    case "writeupp":
      raw = createWriteUppAdapter({ apiKey, baseUrl });
      break;
    case "cliniko":
      raw = createClinikoAdapter({ apiKey, baseUrl });
      break;
    case "halaxy":
      raw = createHalaxyAdapter({ apiKey, baseUrl });
      break;
    case "powerdiary":
      raw = createZandaAdapter({ apiKey, baseUrl });
      break;
    case "tm3":
      throw new Error("TM3 adapter not yet implemented");
    case "pps":
      throw new Error("PPS adapter not yet implemented — API docs gated behind docs.pps-api.com (requires PPS Express login)");
    default:
      throw new Error(`Unknown PMS provider: ${provider}`);
  }

  return withValidation(raw, provider);
}
