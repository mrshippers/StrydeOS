import type { PMSAdapter, PMSIntegrationConfig } from "@/types/pms";
import { createWriteUppAdapter } from "./writeupp/adapter";
import { createClinikoAdapter } from "./cliniko/adapter";
import { createHalaxyAdapter } from "./halaxy/adapter";
import { createZandaAdapter } from "./zanda/adapter";

export function createPMSAdapter(config: PMSIntegrationConfig): PMSAdapter {
  const { provider, apiKey, baseUrl } = config;
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
