import { describe, it, expect } from "vitest";
import {
  mapWriteUppAppointment,
  mapWriteUppClinician,
  mapWriteUppPatient,
  type WriteUppAppointmentRow,
  type WriteUppLookups,
} from "../mappers";

function apptRow(over: Partial<WriteUppAppointmentRow> = {}): WriteUppAppointmentRow {
  return {
    id: 12,
    patient_id: 77,
    user_id: 5,
    status_id: 2,
    appointment_type_id: 900,
    starts_at: "2026-06-10T09:00:00Z",
    ends_at: "2026-06-10T09:30:00Z",
    cost: 65,
    ...over,
  };
}

const lookups: WriteUppLookups = {
  statusById: new Map([
    ["1", "Booked"],
    ["2", "Complete"],
    ["3", "Did not attend"],
  ]),
  typeById: new Map([["900", "Bupa Follow-up Review"]]),
};

describe("mapWriteUppAppointment", () => {
  it("keeps the type ID in appointmentType and the human name in appointmentTypeName", () => {
    // Regression: the contract was inverted (name landed in appointmentType and
    // appointmentTypeName was dropped to undefined), losing the canonical name.
    const appt = mapWriteUppAppointment(apptRow(), lookups);
    expect(appt.appointmentType).toBe("900");
    expect(appt.appointmentTypeName).toBe("Bupa Follow-up Review");
  });

  it("resolves canonical status via the status lookup", () => {
    expect(mapWriteUppAppointment(apptRow({ status_id: 2 }), lookups).status).toBe("completed");
    expect(mapWriteUppAppointment(apptRow({ status_id: 3 }), lookups).status).toBe("dna");
    expect(mapWriteUppAppointment(apptRow({ status_id: 1 }), lookups).status).toBe("scheduled");
  });

  it("converts cost (pounds float) to integer pence", () => {
    expect(mapWriteUppAppointment(apptRow({ cost: 65 }), lookups).revenueAmountPence).toBe(6500);
    expect(mapWriteUppAppointment(apptRow({ cost: 42.5 }), lookups).revenueAmountPence).toBe(4250);
  });

  it("falls back to the raw appointment_type string when no id/lookup is present", () => {
    const appt = mapWriteUppAppointment(
      apptRow({ appointment_type_id: undefined, appointment_type: "Discharge" }),
      lookups
    );
    expect(appt.appointmentType).toBe("Discharge");
    expect(appt.appointmentTypeName).toBe("Discharge");
  });
});

describe("mapWriteUppClinician", () => {
  it("derives a name from name or first/last and defaults active to true", () => {
    expect(mapWriteUppClinician({ id: 5, name: "Andrew Henry" }).name).toBe("Andrew Henry");
    expect(mapWriteUppClinician({ id: 6, first_name: "Max", last_name: "Lin" }).name).toBe("Max Lin");
    expect(mapWriteUppClinician({ id: 7 }).active).toBe(true);
    expect(mapWriteUppClinician({ id: 8, is_active: false }).active).toBe(false);
  });
});

describe("mapWriteUppPatient", () => {
  it("maps defensive snake/camel fields and uses the fallback id", () => {
    const p = mapWriteUppPatient({ id: 0 as unknown as number, forename: "Jo", surname: "Bloggs", mobile: "07000" }, "99");
    expect(p.firstName).toBe("Jo");
    expect(p.lastName).toBe("Bloggs");
    expect(p.phone).toBe("07000");
  });
});
