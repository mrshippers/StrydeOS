import type { HEPAdapter, HEPProgramme, HEPIntegrationConfig } from "../types";
import { WibbiClient, testWibbiConnection, type WibbiClientConfig } from "./client";
import { mapWibbiProgramme, type WibbiProgrammeRow } from "./mappers";

/** Normalise Wibbi's variable response shapes into a flat array. */
function normaliseList(data: unknown): WibbiProgrammeRow[] {
  if (Array.isArray(data)) return data as WibbiProgrammeRow[];
  const obj = data as Record<string, unknown> | undefined;
  return (obj?.data ?? obj?.programmes ?? []) as WibbiProgrammeRow[];
}

/** Normalise Wibbi's variable single-item response into a row. */
function normaliseSingle(data: unknown): WibbiProgrammeRow {
  const obj = data as Record<string, unknown>;
  return (obj?.data ?? obj?.programme ?? obj) as WibbiProgrammeRow;
}

export function createWibbiAdapter(config: HEPIntegrationConfig): HEPAdapter {
  const clientConfig: WibbiClientConfig = {
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
  };
  const clinicId = config.clinicId;

  const client = new WibbiClient(clientConfig);

  return {
    provider: "wibbi",

    async testConnection() {
      return testWibbiConnection(clientConfig);
    },

    async getProgrammes(params): Promise<HEPProgramme[]> {
      const { patientExternalId, dateFrom, dateTo } = params;

      const queryParams = new URLSearchParams();
      if (patientExternalId) queryParams.set("patient_id", patientExternalId);
      if (dateFrom) queryParams.set("from", dateFrom);
      if (dateTo) queryParams.set("to", dateTo);
      if (clinicId) queryParams.set("clinic_id", clinicId);

      const qs = queryParams.toString();
      const path = `/api/v1/programmes${qs ? `?${qs}` : ""}`;

      const data = await client.request<unknown>(path);
      return normaliseList(data).map(mapWibbiProgramme);
    },

    async getProgramme(externalId: string): Promise<HEPProgramme> {
      const data = await client.request<unknown>(
        `/api/v1/programmes/${encodeURIComponent(externalId)}`
      );
      return mapWibbiProgramme(normaliseSingle(data));
    },
  };
}
