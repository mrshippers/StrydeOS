import type { PMSAdapter, PMSIntegrationConfig } from "@/types/pms";
import { createWriteUppAdapter } from "./writeupp/adapter";

export function createPMSAdapter(config: PMSIntegrationConfig): PMSAdapter {
  const { provider, apiKey, baseUrl } = config;
  switch (provider) {
    case "writeupp":
      return createWriteUppAdapter({ apiKey, baseUrl });
    case "cliniko":
      throw new Error("Cliniko adapter not yet implemented");
    case "tm3":
      throw new Error("TM3 adapter not yet implemented");
    default:
      throw new Error(`Unknown PMS provider: ${provider}`);
  }
}
