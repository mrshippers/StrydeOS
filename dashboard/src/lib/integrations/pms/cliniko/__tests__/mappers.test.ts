import { describe, it, expect } from "vitest";
import {
  mapClinikoAppointment,
  buildAppointmentTypeNameMap,
  type ClinikoAppointmentRow,
  type ClinikoAppointmentTypeRow,
} from "../mappers";

function row(over: Partial<ClinikoAppointmentRow> = {}): ClinikoAppointmentRow {
  return {
    id: "a1",
    starts_at: "2026-06-10T09:00:00Z",
    ends_at: "2026-06-10T09:30:00Z",
    patient: { links: { self: "https://api.uk3.cliniko.com/v1/patients/77" } },
    practitioner: { links: { self: "https://api.uk3.cliniko.com/v1/practitioners/5" } },
    appointment_type: { links: { self: "https://api.uk3.cliniko.com/v1/appointment_types/900" } },
    ...over,
  };
}

describe("buildAppointmentTypeNameMap", () => {
  it("maps id → name and skips malformed rows", () => {
    const rows: ClinikoAppointmentTypeRow[] = [
      { id: "900", name: "Bupa Initial Appointment" },
      { id: "901", name: "Video Consultation" },
      { id: "902" }, // no name → skipped
    ];
    const map = buildAppointmentTypeNameMap(rows);
    expect(map.get("900")).toBe("Bupa Initial Appointment");
    expect(map.get("901")).toBe("Video Consultation");
    expect(map.has("902")).toBe(false);
  });
});

describe("mapClinikoAppointment appointment-type name resolution", () => {
  it("resolves the type NAME from the lookup map", () => {
    const map = buildAppointmentTypeNameMap([{ id: "900", name: "Bupa Initial Appointment" }]);
    const appt = mapClinikoAppointment(row(), map);
    expect(appt.appointmentType).toBe("900");
    expect(appt.appointmentTypeName).toBe("Bupa Initial Appointment");
    expect(appt.patientExternalId).toBe("77");
    expect(appt.clinicianExternalId).toBe("5");
  });

  it("leaves the name undefined when no map is supplied", () => {
    const appt = mapClinikoAppointment(row());
    expect(appt.appointmentType).toBe("900");
    expect(appt.appointmentTypeName).toBeUndefined();
  });

  it("leaves the name undefined when the id is not in the map", () => {
    const map = buildAppointmentTypeNameMap([{ id: "999", name: "Other" }]);
    expect(mapClinikoAppointment(row(), map).appointmentTypeName).toBeUndefined();
  });
});
