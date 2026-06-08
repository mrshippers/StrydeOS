import { describe, it, expect } from "vitest";
import { selectAppointmentsForIntake, type IntakeAppointment } from "../auto-send";

const NOW = Date.parse("2026-06-08T09:00:00.000Z");
const inDays = (d: number) => new Date(NOW + d * 86400000).toISOString();

function appt(over: Partial<IntakeAppointment> = {}): IntakeAppointment {
  return { externalId: "a1", patientExternalId: "p1", dateTime: inDays(1), status: "scheduled", ...over };
}

describe("selectAppointmentsForIntake", () => {
  const opts = { nowMs: NOW, windowDays: 3 };

  it("selects an upcoming appointment within the window", () => {
    const out = selectAppointmentsForIntake([appt()], new Set(), opts);
    expect(out).toEqual([{ appointmentId: "a1", patientRef: "p1", dateTime: inDays(1) }]);
  });

  it("skips appointments in the past", () => {
    expect(selectAppointmentsForIntake([appt({ dateTime: inDays(-1) })], new Set(), opts)).toEqual([]);
  });

  it("skips appointments beyond the window", () => {
    expect(selectAppointmentsForIntake([appt({ dateTime: inDays(10) })], new Set(), opts)).toEqual([]);
  });

  it("skips appointments that already have a link", () => {
    expect(selectAppointmentsForIntake([appt()], new Set(["a1"]), opts)).toEqual([]);
  });

  it("skips cancelled / DNA appointments", () => {
    expect(selectAppointmentsForIntake([appt({ status: "cancelled" })], new Set(), opts)).toEqual([]);
    expect(selectAppointmentsForIntake([appt({ status: "dna" })], new Set(), opts)).toEqual([]);
  });

  it("dedupes to one link per patient per run", () => {
    const out = selectAppointmentsForIntake(
      [appt({ externalId: "a1", dateTime: inDays(1) }), appt({ externalId: "a2", dateTime: inDays(2) })],
      new Set(),
      opts,
    );
    expect(out).toHaveLength(1);
    expect(out[0].patientRef).toBe("p1");
  });

  it("skips malformed appointments", () => {
    const out = selectAppointmentsForIntake(
      [
        appt({ externalId: "", }),
        appt({ patientExternalId: "" }),
        appt({ dateTime: "" }),
        appt({ externalId: "ok", patientExternalId: "p9", dateTime: inDays(1) }),
      ],
      new Set(),
      opts,
    );
    expect(out).toEqual([{ appointmentId: "ok", patientRef: "p9", dateTime: inDays(1) }]);
  });
});
