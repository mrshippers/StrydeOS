import { describe, it, expect } from "vitest";
import { classifyClinikoAppointmentTypeName } from "../classify-appointment-type";

/**
 * Pins the canonical Cliniko appointment-type-name → enum rules that the
 * cliniko poll and the migration script replicate. Uses the real Spires (uk3,
 * June 2026) appointment-type names plus the pipeline's default map keys.
 */
describe("classifyClinikoAppointmentTypeName", () => {
  it("classifies real Spires insurance INITIAL types as initial_assessment", () => {
    for (const name of [
      "Bupa Initial Appointment",
      "AXA Initial",
      "Aviva Initial Assessment",
      "Vitality Initial",
      "WPA Initial Appointment",
    ]) {
      const r = classifyClinikoAppointmentTypeName(name);
      expect(r.appointmentType).toBe("initial_assessment");
      expect(r.isInitialAssessment).toBe(true);
    }
  });

  it("classifies real Spires insurance FOLLOW-UP types as follow_up", () => {
    for (const name of [
      "Bupa Follow-up",
      "AXA Follow Up",
      "Aviva Followup",
      "Vitality Follow-up Appointment",
      "WPA Follow up",
    ]) {
      const r = classifyClinikoAppointmentTypeName(name);
      expect(r.appointmentType).toBe("follow_up");
      expect(r.isInitialAssessment).toBe(false);
    }
  });

  it("classifies the non-insurance Spires types", () => {
    expect(classifyClinikoAppointmentTypeName("1. Initial Appointment")).toEqual({
      appointmentType: "initial_assessment",
      isInitialAssessment: true,
    });
    expect(classifyClinikoAppointmentTypeName("2. Follow up")).toEqual({
      appointmentType: "follow_up",
      isInitialAssessment: false,
    });
    // "Video Consultation" contains "consultation" → initial
    expect(
      classifyClinikoAppointmentTypeName("Video Consultation").appointmentType,
    ).toBe("initial_assessment");
  });

  it("never mis-classifies a follow-up review as initial (order matters)", () => {
    const r = classifyClinikoAppointmentTypeName("Bupa Follow-up Review");
    expect(r.appointmentType).toBe("follow_up");
    expect(r.isInitialAssessment).toBe(false);
  });

  it("maps review and discharge type names", () => {
    expect(classifyClinikoAppointmentTypeName("Progress Review").appointmentType).toBe("review");
    expect(classifyClinikoAppointmentTypeName("Discharge").appointmentType).toBe("discharge");
    expect(classifyClinikoAppointmentTypeName("Final Session").appointmentType).toBe("discharge");
  });

  it("falls back to follow_up for unknown / empty names", () => {
    expect(classifyClinikoAppointmentTypeName(undefined)).toEqual({
      appointmentType: "follow_up",
      isInitialAssessment: false,
    });
    expect(classifyClinikoAppointmentTypeName("Massage")).toEqual({
      appointmentType: "follow_up",
      isInitialAssessment: false,
    });
  });
});
