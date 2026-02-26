import type { HEPAdapter, HEPProgramme, HEPIntegrationConfig } from "../types";
import { PhysitrackClient } from "./client";

interface PhysitrackProgrammeRow {
  id: string;
  patient_id?: string;
  name?: string;
  exercise_count?: number;
  assigned_at?: string;
  completion_percent?: number;
  last_accessed_at?: string;
  [key: string]: unknown;
}

function mapProgramme(row: PhysitrackProgrammeRow): HEPProgramme {
  return {
    externalId: String(row.id),
    patientExternalId: String(row.patient_id ?? ""),
    name: (row.name as string) ?? "Unnamed Programme",
    exerciseCount: typeof row.exercise_count === "number" ? row.exercise_count : 0,
    assignedAt: (row.assigned_at as string) ?? new Date().toISOString(),
    completionPercent: typeof row.completion_percent === "number" ? row.completion_percent : 0,
    lastAccessedAt: row.last_accessed_at as string | undefined,
  };
}

export function createPhysitrackAdapter(config: HEPIntegrationConfig): HEPAdapter {
  const client = new PhysitrackClient({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
  });

  return {
    provider: "physitrack",

    async testConnection() {
      try {
        const ok = await client.testConnection();
        return { ok, error: ok ? undefined : "Could not authenticate with Physitrack" };
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    },

    async getProgrammes(params) {
      const query = new URLSearchParams();
      if (params.patientExternalId) query.set("patient_id", params.patientExternalId);
      if (params.dateFrom) query.set("from", params.dateFrom);
      if (params.dateTo) query.set("to", params.dateTo);

      const qs = query.toString();
      const path = `/programmes${qs ? `?${qs}` : ""}`;
      const data = await client.request<{ data: PhysitrackProgrammeRow[] }>(path);
      return (data.data ?? []).map(mapProgramme);
    },

    async getProgramme(externalId) {
      const data = await client.request<PhysitrackProgrammeRow>(`/programmes/${externalId}`);
      return mapProgramme(data);
    },
  };
}
