import type { PMSAdapter, InsuranceInfo } from "@/types/pms";
import type { AppointmentStatus } from "@/types";
import { clinikoFetch, clinikoFetchAll, testClinikoConnection, type ClinikoConfig } from "./client";
import { mapClinikoAppointment, mapClinikoClinician } from "./mappers";
import type { ClinikoAppointmentRow, ClinikoPractitionerRow } from "./mappers";
import { discoverClinikoInsuranceFields, writeInsuranceToCliniko } from "./insurance";
import type { InsuranceFieldMap, InsuranceRecord } from "@/lib/insurance/types";

export function createClinikoAdapter(config: ClinikoConfig): PMSAdapter {
  return {
    provider: "cliniko",

    async testConnection() {
      return testClinikoConnection(config);
    },

    async getAppointments(params) {
      const { clinicianExternalId, dateFrom, dateTo } = params;
      
      // Build query filters using Cliniko's q[] array syntax.
      // Cliniko requires full UTC timestamps, not plain date strings.
      const filters: string[] = [
        `starts_at:>=${dateFrom}T00:00:00Z`,
        `starts_at:<=${dateTo}T23:59:59Z`,
      ];
      
      if (clinicianExternalId) {
        filters.push(`practitioner_id:=${clinicianExternalId}`);
      }
      
      // Build query string: ?q[]=filter1&q[]=filter2
      const queryParams = filters.map((f) => `q[]=${encodeURIComponent(f)}`).join("&");
      const path = `/individual_appointments?${queryParams}&per_page=100`;
      
      const rows = await clinikoFetchAll<ClinikoAppointmentRow>(
        config,
        path,
        "individual_appointments"
      );
      
      return rows.map(mapClinikoAppointment);
    },

    async getPatient(externalId: string) {
      const data = await clinikoFetch<{
        id: string;
        first_name?: string;
        last_name?: string;
        email?: string;
        patient_phone_numbers?: Array<{ number?: string; phone_type?: string }>;
        date_of_birth?: string;
        dva_card_number?: string;
        concession_type?: string;
      }>(config, `/patients/${encodeURIComponent(externalId)}`);

      // Cliniko returns phones under `patient_phone_numbers` (not `phone_numbers`).
      // Prefer a Mobile number for SMS, else fall back to the first on file.
      const phones = data?.patient_phone_numbers ?? [];
      const phone = (phones.find((p) => p.phone_type === "Mobile") ?? phones[0])?.number;
      
      return {
        externalId: String(data?.id ?? externalId),
        firstName: data?.first_name ?? "",
        lastName: data?.last_name ?? "",
        email: data?.email,
        phone,
        dob: data?.date_of_birth,
        insurerName: data?.dva_card_number ? "DVA" : data?.concession_type,
      };
    },

    async createAppointment(params) {
      const body = {
        patient_id: params.patientExternalId,
        practitioner_id: params.clinicianExternalId,
        appointment_type_id: params.appointmentType,
        starts_at: params.dateTime,
        ends_at: params.endTime,
        notes: params.notes,
      };
      
      const data = await clinikoFetch<{ id: string }>(
        config,
        "/individual_appointments",
        {
          method: "POST",
          body: JSON.stringify(body),
        }
      );
      
      return { externalId: String(data?.id ?? "") };
    },

    async updateAppointmentStatus(externalId: string, status: AppointmentStatus) {
      // Cliniko only exposes POST /individual_appointments/{id}/cancel for cancellation
      // Other status changes (arrived, did_not_arrive) require PATCH on the appointment
      if (status === "cancelled") {
        try {
          await clinikoFetch(
            config,
            `/individual_appointments/${encodeURIComponent(externalId)}/cancel`,
            { method: "POST" }
          );
        } catch {
          // No-op if endpoint fails
        }
      } else if (status === "completed") {
        // Mark as arrived
        try {
          await clinikoFetch(
            config,
            `/individual_appointments/${encodeURIComponent(externalId)}`,
            {
              method: "PATCH",
              body: JSON.stringify({ patient_arrived: true }),
            }
          );
        } catch {
          // No-op if endpoint fails
        }
      } else if (status === "dna") {
        // Mark as did not arrive
        try {
          await clinikoFetch(
            config,
            `/individual_appointments/${encodeURIComponent(externalId)}`,
            {
              method: "PATCH",
              body: JSON.stringify({ did_not_arrive: true }),
            }
          );
        } catch {
          // No-op if endpoint fails
        }
      }
      // Other statuses: no-op
    },

    async getClinicians() {
      const rows = await clinikoFetchAll<ClinikoPractitionerRow>(
        config,
        "/practitioners?per_page=100",
        "practitioners"
      );
      
      return rows.map(mapClinikoClinician);
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

    // ─── Insurance Intake (Stream B) ─────────────────────────────────────────

    discoverInsuranceFields(): Promise<InsuranceFieldMap> {
      return discoverClinikoInsuranceFields(config);
    },

    writeInsurance(record: InsuranceRecord, fieldMap: InsuranceFieldMap) {
      return writeInsuranceToCliniko(config, record, fieldMap);
    },
  };
}
