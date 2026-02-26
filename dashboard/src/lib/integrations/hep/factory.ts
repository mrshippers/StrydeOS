import type { HEPAdapter, HEPIntegrationConfig } from "./types";
import { createPhysitrackAdapter } from "./physitrack/adapter";

export function createHEPAdapter(config: HEPIntegrationConfig): HEPAdapter {
  switch (config.provider) {
    case "physitrack":
      return createPhysitrackAdapter(config);
    case "physiapp":
      throw new Error("PhysiApp adapter not yet implemented");
    case "rehab_my_patient":
      throw new Error("Rehab My Patient adapter not yet implemented");
    case "physiotec":
      throw new Error("Physiotec adapter not yet implemented");
    default:
      throw new Error(`Unknown HEP provider: ${config.provider}`);
  }
}
