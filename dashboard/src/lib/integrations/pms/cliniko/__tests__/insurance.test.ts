import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  mapInsuranceTemplates,
  buildInsuranceSummary,
  mergeInvoiceExtraInfo,
  discoverClinikoInsuranceFields,
  writeInsuranceToCliniko,
  CLINIKO_FORM_TEMPLATES_KEY,
  type ClinikoFormTemplate,
} from "../insurance";
import type { InsuranceFieldMap, InsuranceRecord } from "@/lib/insurance/types";

const config = { apiKey: "test-key", baseUrl: "https://api.uk2.cliniko.com/v1" };

function record(overrides: Partial<InsuranceRecord> = {}): InsuranceRecord {
  return {
    tenantId: "clinic-1",
    patientRef: "p-42",
    source: "form",
    insurerName: "Bupa",
    scheme: "Comprehensive",
    policyNumber: "AB123456",
    authorisationCode: "AUTH9",
    claimReference: "CLM-1",
    confidence: 1,
    capturedAt: "2026-06-08T09:30:00.000Z",
    capturedBy: "patient",
    reviewStatus: "approved",
    audit: [],
    addressLine1: "1 High Street",
    town: "London",
    postcode: "NW6 1AB",
    country: "United Kingdom",
    ...overrides,
  };
}

const fallbackMap: InsuranceFieldMap = {
  insurerOptions: [],
  templateId: null,
  insurerQuestionName: null,
  policyQuestionName: null,
  fallbackToInvoiceExtraInfo: true,
};

const structuredMap: InsuranceFieldMap = {
  insurerOptions: ["Bupa", "AXA"],
  templateId: "tpl-1",
  insurerQuestionName: "Provider",
  policyQuestionName: "Policy number",
  fallbackToInvoiceExtraInfo: false,
};

// ─── Discovery mapping (matches real Cliniko patient_form_templates shape) ─────

describe("mapInsuranceTemplates", () => {
  const insuranceTemplate: ClinikoFormTemplate = {
    id: "tpl-1",
    name: "Insurance coverage",
    archived_at: null,
    content: {
      sections: [
        {
          name: "Insurance coverage",
          questions: [
            { name: "Provider", type: "radiobuttons", answers: [{ value: "Bupa" }, { value: "AXA" }, { value: "Vitality" }] },
            { name: "Policy number", type: "text" },
          ],
        },
      ],
    },
  };

  it("locates the insurer + policy questions in an insurance template", () => {
    const m = mapInsuranceTemplates([insuranceTemplate]);
    expect(m.templateId).toBe("tpl-1");
    expect(m.insurerQuestionName).toBe("Provider");
    expect(m.policyQuestionName).toBe("Policy number");
    expect(m.fallbackToInvoiceExtraInfo).toBe(false);
  });

  it("extracts insurer dropdown options from the radiobuttons answers", () => {
    expect(mapInsuranceTemplates([insuranceTemplate]).insurerOptions).toEqual(["Bupa", "AXA", "Vitality"]);
  });

  it("accepts answers given as plain strings", () => {
    const t: ClinikoFormTemplate = {
      id: "t2",
      name: "Insurance",
      content: { sections: [{ name: "Insurance", questions: [{ name: "Provider", type: "select", answers: ["Bupa", "AXA"] }, { name: "Membership number", type: "text" }] }] },
    };
    expect(mapInsuranceTemplates([t]).insurerOptions).toEqual(["Bupa", "AXA"]);
  });

  it("skips archived templates", () => {
    const archived = { ...insuranceTemplate, archived_at: "2026-01-01T00:00:00Z" };
    expect(mapInsuranceTemplates([archived]).fallbackToInvoiceExtraInfo).toBe(true);
  });

  it("falls back when no insurance template exists", () => {
    const other: ClinikoFormTemplate = {
      id: "t3",
      name: "Consent to treatment",
      content: { sections: [{ name: "Consent", questions: [{ name: "I agree", type: "text" }] }] },
    };
    const m = mapInsuranceTemplates([other]);
    expect(m.templateId).toBeNull();
    expect(m.insurerOptions).toEqual([]);
    expect(m.fallbackToInvoiceExtraInfo).toBe(true);
  });

  it("falls back on an empty template list", () => {
    expect(mapInsuranceTemplates([]).fallbackToInvoiceExtraInfo).toBe(true);
  });
});

describe("buildInsuranceSummary", () => {
  it("still includes insurer, scheme and policy value", () => {
    const s = buildInsuranceSummary(record());
    expect(s).toContain("Bupa");
    expect(s).toContain("Comprehensive");
    expect(s).toContain("AB123456");
  });

  it("uses Bupa-native field labels the clinic actually types on the invoice", () => {
    const s = buildInsuranceSummary(
      record({ insurerName: "Bupa", policyNumber: "0706547878", authorisationCode: "71206055" }),
    );
    expect(s).toContain("Membership number 0706547878");
    expect(s).toContain("Pre-auth - 71206055");
    expect(s).not.toContain("Policy:");
    expect(s).not.toContain("Auth:");
  });

  it("uses generic labels for non-Bupa insurers", () => {
    const s = buildInsuranceSummary(record({ insurerName: "AXA Health" }));
    expect(s).toContain("Policy: AB123456");
    expect(s).toContain("Auth: AUTH9");
    expect(s).not.toContain("Membership number");
  });

  it("does not leak StrydeOS capture provenance onto the patient-facing field", () => {
    const s = buildInsuranceSummary(record());
    expect(s).not.toContain("captured via StrydeOS");
    expect(s).not.toContain("StrydeOS");
  });
});

describe("mergeInvoiceExtraInfo", () => {
  it("wraps a fresh summary in StrydeOS markers when the field is empty", () => {
    const out = mergeInvoiceExtraInfo(undefined, "Insurer: Bupa");
    expect(out).toContain("Insurer: Bupa");
    expect(out).toContain("[StrydeOS insurance]");
  });

  it("preserves a clinician's hand-typed note above the StrydeOS block", () => {
    const out = mergeInvoiceExtraInfo("Patient prefers morning slots", "Insurer: Bupa");
    expect(out).toContain("Patient prefers morning slots");
    expect(out).toContain("Insurer: Bupa");
    expect(out.indexOf("Patient prefers")).toBeLessThan(out.indexOf("Insurer: Bupa"));
  });

  it("replaces a prior StrydeOS block instead of stacking duplicates (idempotent)", () => {
    const first = mergeInvoiceExtraInfo("hand note", "Insurer: Bupa OLD");
    const second = mergeInvoiceExtraInfo(first, "Insurer: Bupa NEW");
    expect(second).toContain("NEW");
    expect(second).not.toContain("OLD");
    expect(second).toContain("hand note");
    expect(second.match(/\[StrydeOS insurance\]/g)).toHaveLength(1);
  });

  it("strips a legacy unmarked StrydeOS summary (old pipe format) on re-approval", () => {
    const legacy =
      "Insurer: Bupa | Policy: AB123456 | (captured via StrydeOS form, 2026-06-08T09:30:00.000Z)";
    const out = mergeInvoiceExtraInfo(legacy, "Insurer: Bupa\nMembership number AB123456");
    expect(out).not.toContain("captured via StrydeOS");
    expect(out).toContain("Membership number AB123456");
    expect((out.match(/Insurer: Bupa/g) ?? [])).toHaveLength(1);
  });

  it("keeps a clinician's own hand-typed Insurer line that has no StrydeOS tag", () => {
    const out = mergeInvoiceExtraInfo("Insurer: AXA (per phone call)", "Insurer: Bupa");
    expect(out).toContain("Insurer: AXA (per phone call)");
  });
});

// ─── HTTP helpers ──────────────────────────────────────────────────────────────

function fakeResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: "OK",
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  } as Response;
}

interface Captured { url: string; method: string; body: string }

function stubFetch(captured: Captured[], responder: (url: string) => unknown) {
  vi.stubGlobal("fetch", async (url: string, options: RequestInit = {}) => {
    captured.push({
      url: String(url),
      method: (options.method as string) ?? "GET",
      body: typeof options.body === "string" ? options.body : "",
    });
    return fakeResponse(responder(String(url)));
  });
}

describe("discoverClinikoInsuranceFields", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("fetches form templates and returns a populated, non-fallback map", async () => {
    const captured: Captured[] = [];
    stubFetch(captured, () => ({
      [CLINIKO_FORM_TEMPLATES_KEY]: [
        {
          id: "tpl-1",
          name: "Insurance coverage",
          content: { sections: [{ name: "Insurance coverage", questions: [
            { name: "Provider", type: "radiobuttons", answers: [{ value: "Bupa" }, { value: "AXA" }] },
            { name: "Policy number", type: "text" },
          ] }] },
        },
      ],
      links: {},
    }));

    const map = await discoverClinikoInsuranceFields(config);
    expect(map.templateId).toBe("tpl-1");
    expect(map.insurerOptions).toEqual(["Bupa", "AXA"]);
    expect(map.fallbackToInvoiceExtraInfo).toBe(false);
    expect(captured[0].url).toContain("/patient_form_templates");
    expect(captured[0].method).toBe("GET");
  });
});

describe("writeInsuranceToCliniko", () => {
  let captured: Captured[];
  beforeEach(() => { captured = []; });
  afterEach(() => vi.unstubAllGlobals());

  it("reads the patient first, then PATCHes the merged billing info", async () => {
    stubFetch(captured, () => ({ invoice_extra_information: "" }));
    const res = await writeInsuranceToCliniko(config, record(), structuredMap);

    expect(res.ok).toBe(true);
    expect(res.wroteBillingInfo).toBe(true);
    expect(res.usedFallback).toBe(false);
    expect(res.onboardingTaskNeeded).toBe(false);

    const get = captured.find((c) => c.method === "GET");
    const patch = captured.find((c) => c.method === "PATCH");
    expect(get?.url).toContain("/patients/p-42");
    expect(patch?.url).toContain("/patients/p-42");
    expect(patch?.body).toContain("invoice_extra_information");
    expect(patch?.body).toContain("AB123456");
    // address is written back to the patient profile
    expect(patch?.body).toContain("post_code");
    expect(patch?.body).toContain("NW6 1AB");
    expect(patch?.body).toContain("address_1");
    // Round-trip alignment: insurer is written to concession_type (the field
    // getPatient reads back from), not only the summary string.
    expect(patch?.body).toContain("concession_type");
    expect(JSON.parse(patch!.body).concession_type).toBe("Bupa");
  });

  it("preserves the clinician's existing hand-typed invoice note", async () => {
    stubFetch(captured, () => ({ invoice_extra_information: "BUPA IA agreed at £45" }));
    await writeInsuranceToCliniko(config, record(), structuredMap);
    const patch = captured.find((c) => c.method === "PATCH");
    expect(JSON.parse(patch!.body).invoice_extra_information).toContain("BUPA IA agreed at £45");
  });

  it("maps county to the Cliniko state field", async () => {
    stubFetch(captured, () => ({ invoice_extra_information: "" }));
    await writeInsuranceToCliniko(config, record({ county: "Greater London" }), structuredMap);
    const patch = captured.find((c) => c.method === "PATCH");
    expect(JSON.parse(patch!.body).state).toBe("Greater London");
  });

  it("flags an onboarding task when no insurance form is configured (still writes the summary)", async () => {
    stubFetch(captured, () => ({ invoice_extra_information: "" }));
    const res = await writeInsuranceToCliniko(config, record(), fallbackMap);

    expect(res.ok).toBe(true);
    expect(res.wroteBillingInfo).toBe(true);
    expect(res.usedFallback).toBe(true);
    expect(res.onboardingTaskNeeded).toBe(true);
    expect(captured.some((c) => c.body.includes("invoice_extra_information"))).toBe(true);
  });

  it("returns ok:false and never leaks the policy number on an API error", async () => {
    // GET succeeds; the PATCH write fails — the error must still be redacted.
    vi.stubGlobal("fetch", async (_url: string, options: RequestInit = {}) => {
      const method = (options.method as string) ?? "GET";
      if (method === "PATCH") {
        return fakeResponse("Validation failed for value AB123456", { ok: false, status: 422 });
      }
      return fakeResponse({ invoice_extra_information: "" });
    });
    const res = await writeInsuranceToCliniko(config, record(), structuredMap);
    expect(res.ok).toBe(false);
    expect(res.error).toBeDefined();
    expect(res.error).not.toContain("AB123456");
  });
});
