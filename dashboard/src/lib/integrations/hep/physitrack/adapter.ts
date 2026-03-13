import type {
  HEPAdapter,
  HEPProgramme,
  HEPIntegrationConfig,
  HEPAdherenceResult,
  HEPPatientRef,
  HEPPromResult,
} from "../types";
import {
  PhysitrackClient,
  type PhysitrackClientRow,
  type PhysitrackPromResultsResponse,
} from "./client";

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

    async getAdherence(patientExternalId: string, programmeCode: string): Promise<HEPAdherenceResult | null> {
      try {
        const data = await client.getProgramAdherence(patientExternalId, programmeCode);
        const pct = data.adherence_percent ?? data.adherencePercent ?? 0;
        const sessions = data.sessions_completed ?? data.sessionsCompleted ?? 0;
        const last = data.last_session_at ?? data.lastSessionAt;
        return {
          adherencePercent: typeof pct === "number" ? pct : 0,
          sessionsCompleted: typeof sessions === "number" ? sessions : 0,
          lastSessionAt: typeof last === "string" ? last : undefined,
        };
      } catch {
        return null;
      }
    },

    async getPatients(): Promise<HEPPatientRef[]> {
      try {
        const data = await client.getClients();
        const rows = data.data ?? data.clients ?? [];
        return rows.map((row: PhysitrackClientRow) => {
          const name =
            row.name ??
            ([row.first_name, row.last_name].filter(Boolean).join(" ") ||
            "Unknown");
          return {
            physitrackId: String(row.id),
            patientName: name,
          };
        });
      } catch {
        return [];
      }
    },

    async getPromResults(
      _patientExternalId: string,
      _programmeCode: string
    ): Promise<HEPPromResult[]> {
      try {
        const programList = await client.getClientPrograms(_patientExternalId);
        const programs = programList.data ?? programList.programs ?? [];
        const program = programs.find(
          (p) => String((p as { access_code?: string }).access_code ?? (p as { id?: string }).id) === _programmeCode
        );
        const promIds = (program as { prom_ids?: string[] })?.prom_ids ?? [];
        const results: HEPPromResult[] = [];

        for (const promId of promIds) {
          const res = await client.getPromResults(
            _patientExternalId,
            _programmeCode,
            promId
          );
          const rows = res.data ?? res.results ?? [];
          for (const row of rows) {
            const type = row.type ?? row.prom_type ?? "unknown";
            const score = typeof row.score === "number" ? row.score : 0;
            const recordedAt = row.recorded_at ?? row.recordedAt ?? new Date().toISOString();
            results.push({ type, score, recordedAt });
          }
        }

        return results;
      } catch {
        return [];
      }
    },
  };
}
