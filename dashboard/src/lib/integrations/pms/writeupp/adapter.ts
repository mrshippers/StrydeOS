import type { PMSAdapter, PMSAppointment, PMSPatient, PMSClinician, InsuranceInfo } from "@/types/pms";
import type { AppointmentStatus } from "@/types";
import { writeUppFetch, testWriteUppConnection, type WriteUppConfig } from "./client";
import { mapWriteUppAppointment, mapWriteUppClinician } from "./mappers";
import type { WriteUppAppointmentRow, WriteUppPractitionerRow } from "./mappers";

export function createWriteUppAdapter(config: WriteUppConfig): PMSAdapter {
  return {
    provider: "writeupp",

    async testConnection() {
      return testWriteUppConnection(config);
    },

    async getAppointments(params) {
      const { clinicianExternalId, dateFrom, dateTo } = params;
      const path = "/appointments";
      const search = new URLSearchParams();
      search.set("from", dateFrom);
      search.set("to", dateTo);
      if (clinicianExternalId) search.set("practitioner_id", clinicianExternalId);
      const data = await writeUppFetch<{ data?: WriteUppAppointmentRow[]; appointments?: WriteUppAppointmentRow[] }>(
        config,
        `${path}?${search.toString()}`
      );
      const rows = Array.isArray(data) ? data : data?.data ?? data?.appointments ?? [];
      return (Array.isArray(rows) ? rows : []).map(mapWriteUppAppointment);
    },

    async getPatient(externalId: string) {
      const data = await writeUppFetch<{
        id: string;
        first_name?: string;
        last_name?: string;
        email?: string;
        phone?: string;
        date_of_birth?: string;
        insurer_name?: string;
      }>(config, `/patients/${encodeURIComponent(externalId)}`);
      const firstName = data?.first_name ?? (data as { firstName?: string }).firstName ?? "";
      const lastName = data?.last_name ?? (data as { lastName?: string }).lastName ?? "";
      return {
        externalId: String(data?.id ?? externalId),
        firstName,
        lastName,
        email: data?.email ?? (data as { email?: string }).email,
        phone: data?.phone ?? (data as { phone?: string }).phone,
        dob: data?.date_of_birth ?? (data as { dob?: string }).dob,
        insurerName: data?.insurer_name ?? (data as { insurerName?: string }).insurerName,
      };
    },

    async createAppointment(params) {
      const body = {
        patient_id: params.patientExternalId,
        practitioner_id: params.clinicianExternalId,
        start_time: params.dateTime,
        end_time: params.endTime,
        appointment_type: params.appointmentType,
        notes: params.notes,
      };
      const data = await writeUppFetch<{ id: string }>(config, "/appointments", {
        method: "POST",
        body: JSON.stringify(body),
      });
      return { externalId: String(data?.id ?? (data as { externalId?: string }).externalId ?? "") };
    },

    async updateAppointmentStatus(externalId: string, status: AppointmentStatus) {
      await writeUppFetch(config, `/appointments/${encodeURIComponent(externalId)}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
    },

    async getClinicians() {
      const data = await writeUppFetch<WriteUppPractitionerRow[] | { data?: WriteUppPractitionerRow[] }>(
        config,
        "/practitioners"
      );
      const rows = Array.isArray(data) ? data : data?.data ?? [];
      return (Array.isArray(rows) ? rows : []).map(mapWriteUppClinician);
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
  };
}
