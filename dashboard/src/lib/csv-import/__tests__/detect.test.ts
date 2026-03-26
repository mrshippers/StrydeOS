import { describe, it, expect } from "vitest";
import { detectSchema } from "../detect";
import { BUILTIN_SCHEMAS } from "../schemas";

describe("detectSchema", () => {
  it("detects WriteUpp with confidence > 0.7 from typical headers", () => {
    const headers = [
      "Appointment Date",
      "Appointment Time",
      "End Date",
      "End Time",
      "Patient ID",
      "Patient First Name",
      "Patient Last Name",
      "Patient Email",
      "Patient Phone",
      "Date of Birth",
      "Practitioner",
      "Practitioner ID",
      "Appointment Type",
      "Status",
      "Price",
      "Duration",
      "Notes",
    ];

    const result = detectSchema(headers, BUILTIN_SCHEMAS, "appointments");
    expect(result).toBeTruthy();
    expect(result!.schema.id).toBe("writeupp");
    expect(result!.confidence).toBeGreaterThan(0.7);
  });

  it("detects Cliniko from Cliniko-style headers", () => {
    const headers = [
      "starts_at",
      "ends_at",
      "patient.first_name",
      "patient.last_name",
      "patient.email",
      "practitioner.display_name",
      "appointment_type.name",
      "attendance",
      "patient.id",
      "id",
    ];

    const result = detectSchema(headers, BUILTIN_SCHEMAS, "appointments");
    expect(result).toBeTruthy();
    expect(result!.schema.id).toBe("cliniko");
  });

  it("detects TM3 from TM3-style headers", () => {
    const headers = [
      "Forename",
      "Surname",
      "Email Address",
      "Therapist",
      "Date",
      "Time",
      "End Time",
      "Type",
      "Status",
      "Client Ref",
      "Amount",
    ];

    const result = detectSchema(headers, BUILTIN_SCHEMAS, "appointments");
    expect(result).toBeTruthy();
    expect(result!.schema.id).toBe("tm3");
  });

  it("returns null for unrecognised headers", () => {
    const headers = [
      "Foo",
      "Bar",
      "Baz",
      "Something Random",
      "Another Column",
    ];

    const result = detectSchema(headers, BUILTIN_SCHEMAS, "appointments");
    expect(result).toBe(null);
  });

  it("returns higher-priority schema when headers produce equal scores", () => {
    // These headers match TM3 and Jane with similar canonical field coverage.
    // Both share: patientFirst, patientLast, practitioner, date, time, endTime,
    // type, status, price. When scores are equal, lower priority number wins.
    // TM3 (priority 30) should beat Jane (priority 40).
    const headers = [
      "Forename",    // TM3: patientFirst
      "Surname",     // TM3: patientLast
      "Therapist",   // TM3: practitioner
      "Date",        // TM3: date (also Jane)
      "Time",        // TM3: time
      "End Time",    // TM3: endTime (also Jane)
      "Type",        // TM3: type
      "Status",      // TM3: status (also Jane)
      "Amount",      // TM3: price (also Jane)
      "Client Ref",  // TM3: patientId
      "Email Address", // TM3: patientEmail
    ];

    const result = detectSchema(headers, BUILTIN_SCHEMAS, "appointments");
    expect(result).toBeTruthy();
    expect(result!.schema.id).toBe("tm3");
  });
});
