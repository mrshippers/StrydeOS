import type { PMSAdapter, PMSAppointment, PMSPatient, PMSClinician, InsuranceInfo } from "@/types/pms";
import type { AppointmentStatus } from "@/types";
import { zandaFetch, zandaFetchAll, testZandaConnection, type ZandaConfig } from "./client";
import {
  mapZandaAppointment,
  mapZandaPractitioner,
  mapZandaClient,
  type ZandaAppointmentRow,
  type ZandaPractitionerRow,
  type ZandaClientRow,
} from "./mappers";

export function createZandaAdapter(config: ZandaConfig): PMSAdapter {
  return {
    provider: "powerdiary",

    async testConnection() {
      return testZandaConnection(config);
    },

    async getAppointments(params): Promise<PMSAppointment[]> {
      const { clinicianExternalId, dateFrom, dateTo } = params;

      const query = new URLSearchParams({
        "filter[start_time][gte]": dateFrom,
        "filter[start_time][lte]": dateTo,
        per_page: "100",
      });

      if (clinicianExternalId) {
        query.set("filter[practitioner_id]", clinicianExternalId);
      }

      const rows = await zandaFetchAll<ZandaAppointmentRow>(
        config,
        `/appointments?${query.toString()}`
      );

      return rows.map(mapZandaAppointment);
    },

    async getPatient(externalId: string): Promise<PMSPatient> {
      // Zanda calls patients "clients"
      const data = await zandaFetch<{ data?: ZandaClientRow } | ZandaClientRow>(
        config,
        `/clients/${encodeURIComponent(externalId)}`
      );

      // Handle both wrapped { data: {...} } and direct object responses
      const row = (data as { data?: ZandaClientRow }).data ?? (data as ZandaClientRow);
      if (!row?.id) throw new Error(`Zanda returned invalid patient data for ID ${externalId}`);
      return mapZandaClient(row);
    },

    async createAppointment(params) {
      // Zanda API is currently read-only (beta) — write endpoints are in development
      // This will throw until Zanda releases POST support
      try {
        const body = {
          start_time: params.dateTime,
          end_time: params.endTime,
          practitioner_id: params.clinicianExternalId,
          client_id: params.patientExternalId,
          notes: params.notes,
        };

        const data = await zandaFetch<{ data?: { id: string } } | { id: string }>(
          config,
          "/appointments",
          {
            method: "POST",
            body: JSON.stringify(body),
          }
        );

        const id =
          (data as { data?: { id: string } }).data?.id ??
          (data as { id: string }).id ??
          "";
        return { externalId: String(id) };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(`Zanda appointment creation not yet available (API in beta): ${msg}`);
      }
    },

    async updateAppointmentStatus(externalId: string, status: AppointmentStatus) {
      // Zanda API write endpoints are in beta — no-op with silent fail
      try {
        await zandaFetch(
          config,
          `/appointments/${encodeURIComponent(externalId)}`,
          {
            method: "PATCH",
            body: JSON.stringify({ status }),
          }
        );
      } catch {
        // No-op until Zanda write API is stable
      }
    },

    async getClinicians(): Promise<PMSClinician[]> {
      const rows = await zandaFetchAll<ZandaPractitionerRow>(
        config,
        "/practitioners?per_page=100"
      );
      return rows.map(mapZandaPractitioner);
    },

    async getInsuranceInfo(_patientExternalId: string): Promise<InsuranceInfo | null> {
      // Zanda does not expose insurance/coverage data via the current beta API
      return null;
    },
  };
}
