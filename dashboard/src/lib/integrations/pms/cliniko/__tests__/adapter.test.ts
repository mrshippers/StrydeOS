import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Cliniko HTTP client so getPatient can be tested in isolation.
const clinikoFetch = vi.fn();
vi.mock("../client", () => ({
  clinikoFetch: (...args: unknown[]) => clinikoFetch(...args),
  clinikoFetchAll: vi.fn(),
  testClinikoConnection: vi.fn(),
}));

import { createClinikoAdapter } from "../adapter";

const adapter = createClinikoAdapter({ apiKey: "k", baseUrl: "https://api.uk3.cliniko.com/v1" });

describe("createClinikoAdapter.getPatient phone extraction", () => {
  beforeEach(() => clinikoFetch.mockReset());

  it("reads the phone from patient_phone_numbers (Cliniko's real field), preferring Mobile", async () => {
    clinikoFetch.mockResolvedValue({
      id: "123",
      first_name: "Test",
      last_name: "Patient",
      email: "t@example.com",
      patient_phone_numbers: [
        { number: "+442045727044", phone_type: "Home" },
        { number: "+447384742532", phone_type: "Mobile" },
      ],
    });
    const p = await adapter.getPatient("123");
    expect(p.phone).toBe("+447384742532");
    expect(p.email).toBe("t@example.com");
  });

  it("falls back to the first number when there is no Mobile", async () => {
    clinikoFetch.mockResolvedValue({
      id: "123",
      patient_phone_numbers: [{ number: "+442045727044", phone_type: "Home" }],
    });
    const p = await adapter.getPatient("123");
    expect(p.phone).toBe("+442045727044");
  });

  it("returns undefined phone when none on file (no crash)", async () => {
    clinikoFetch.mockResolvedValue({ id: "123", patient_phone_numbers: [] });
    const p = await adapter.getPatient("123");
    expect(p.phone).toBeUndefined();
  });

  it("reads the insurer back from concession_type (round-trips writeInsurance)", async () => {
    // writeInsuranceToCliniko writes the insurer to concession_type; getPatient
    // reads it back from the same field, so a write→read returns the insurer.
    clinikoFetch.mockResolvedValue({ id: "123", concession_type: "Bupa" });
    const p = await adapter.getPatient("123");
    expect(p.insurerName).toBe("Bupa");
  });
});
