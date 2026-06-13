import type { PMSAdapter, InsuranceInfo } from "@/types/pms";
import type { AppointmentStatus } from "@/types";
import {
  writeUppFetch,
  writeUppFetchAll,
  testWriteUppConnection,
  type WriteUppConfig,
} from "./client";
import {
  mapWriteUppAppointment,
  mapWriteUppClinician,
  mapWriteUppPatient,
} from "./mappers";
import type {
  WriteUppAppointmentRow,
  WriteUppUserRow,
  WriteUppPatientRow,
  WriteUppLookups,
} from "./mappers";

const READ_ONLY_MESSAGE =
  "WriteUpp Open API v1 is read-only — write operations are not supported. " +
  "Use WriteUpp Online Booking 2.0 / Client Portal for client-initiated changes.";

/** Fetch an id→name lookup from a WriteUpp reference endpoint. */
async function fetchLookup(
  config: WriteUppConfig,
  path: string
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const rows = await writeUppFetchAll<{ id: string | number; name?: string }>(config, path);
    for (const row of rows) {
      if (row?.id != null && typeof row.name === "string") {
        map.set(String(row.id), row.name);
      }
    }
  } catch {
    // Lookups are best-effort: a missing status/type name falls back to the
    // raw value in the mapper rather than failing the whole sync.
  }
  return map;
}

export function createWriteUppAdapter(config: WriteUppConfig): PMSAdapter {
  return {
    provider: "writeupp",

    async testConnection() {
      return testWriteUppConnection(config);
    },

    async getAppointments(params) {
      const { clinicianExternalId, dateFrom, dateTo } = params;

      // Resolve status/type id→name lookups so canonical status mapping works.
      const [statusById, typeById] = await Promise.all([
        fetchLookup(config, "/appointment-statuses"),
        fetchLookup(config, "/appointment-types"),
      ]);
      const lookups: WriteUppLookups = { statusById, typeById };

      const search = new URLSearchParams();
      search.set("from", dateFrom);
      search.set("to", dateTo);
      if (clinicianExternalId) search.set("user_id", clinicianExternalId);

      const rows = await writeUppFetchAll<WriteUppAppointmentRow>(
        config,
        `/appointments?${search.toString()}`,
        { resourceKey: "appointments" }
      );

      return rows.map((row) => mapWriteUppAppointment(row, lookups));
    },

    async getPatient(externalId: string) {
      const data = await writeUppFetch<WriteUppPatientRow>(
        config,
        `/patients/${encodeURIComponent(externalId)}`
      );
      return mapWriteUppPatient(data, externalId);
    },

    async getClinicians() {
      const rows = await writeUppFetchAll<WriteUppUserRow>(config, "/users", {
        resourceKey: "users",
      });
      return rows.map(mapWriteUppClinician);
    },

    async getInsuranceInfo(patientExternalId: string): Promise<InsuranceInfo | null> {
      try {
        const patient = await this.getPatient(patientExternalId);
        if (!patient.insurerName) return null;
        return { hasInsurance: true, insurerName: patient.insurerName };
      } catch {
        return null;
      }
    },

    // ─── Writes: unsupported by the read-only Open API ───────────────────────
    // Implemented to satisfy the PMSAdapter contract; they fail loudly rather
    // than POST/PATCH to endpoints that do not exist in v1.

    async createAppointment(): Promise<{ externalId: string }> {
      throw new Error(READ_ONLY_MESSAGE);
    },

    async updateAppointmentStatus(_externalId: string, _status: AppointmentStatus): Promise<void> {
      throw new Error(READ_ONLY_MESSAGE);
    },
  };
}
