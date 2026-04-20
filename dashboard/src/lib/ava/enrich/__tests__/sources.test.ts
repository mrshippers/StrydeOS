/**
 * Tests for public-source adapters used during clinic onboarding enrichment.
 *
 * Each adapter is pure — it takes a clinic identifier and returns a typed
 * shape (or null if the source has no answer). Network is mocked via a
 * per-test fetch stub; no real HTTP is issued.
 *
 * Run: npx vitest run src/lib/ava/enrich/__tests__/sources.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  fetchPlaces,
  fetchCompaniesHouse,
  fetchWebsite,
  type PlacesResult,
  type CompaniesHouseResult,
  type WebsiteResult,
} from "../sources";

// ── Test helpers ─────────────────────────────────────────────────────────────

type JsonFetchInit = Parameters<typeof fetch>[1];

function mockFetchOnce(response: {
  ok: boolean;
  status?: number;
  json?: unknown;
  text?: string;
}) {
  const r = response;
  return vi.fn().mockResolvedValueOnce({
    ok: r.ok,
    status: r.status ?? (r.ok ? 200 : 500),
    json: async () => r.json ?? {},
    text: async () => r.text ?? "",
    headers: new Headers(),
  });
}

function mockFetchSequence(responses: Array<Parameters<typeof mockFetchOnce>[0]>) {
  const fn = vi.fn();
  for (const r of responses) {
    fn.mockResolvedValueOnce({
      ok: r.ok,
      status: r.status ?? (r.ok ? 200 : 500),
      json: async () => r.json ?? {},
      text: async () => r.text ?? "",
      headers: new Headers(),
    });
  }
  return fn;
}

beforeEach(() => {
  vi.stubEnv("GOOGLE_PLACES_API_KEY", "mock-places-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ── Google Places adapter ────────────────────────────────────────────────────

describe("fetchPlaces", () => {
  it("returns null when GOOGLE_PLACES_API_KEY is not set (graceful degradation)", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "");
    const out = await fetchPlaces({
      clinicName: "Spires Physiotherapy",
      country: "uk",
    });
    expect(out).toBeNull();
  });

  it("returns null when Places text search returns no candidates", async () => {
    const fetchStub = mockFetchOnce({ ok: true, json: { places: [] } });
    const out = await fetchPlaces(
      { clinicName: "Spires Physiotherapy", country: "uk" },
      { fetchImpl: fetchStub as unknown as typeof fetch },
    );
    expect(out).toBeNull();
  });

  it("resolves clinic → website, address, phone, hours from Places v1 API", async () => {
    const fetchStub = mockFetchOnce({
      ok: true,
      json: {
        places: [
          {
            id: "places/mock-1",
            displayName: { text: "Spires Physiotherapy" },
            formattedAddress: "45 Mill Lane, West Hampstead, London NW3 1LB",
            nationalPhoneNumber: "020 7794 0202",
            websiteUri: "https://www.spiresphysiotherapy.com",
            regularOpeningHours: {
              weekdayDescriptions: [
                "Monday: 8:00 AM – 8:00 PM",
                "Tuesday: 8:00 AM – 8:00 PM",
              ],
            },
            rating: 4.9,
            userRatingCount: 128,
          },
        ],
      },
    });

    const out = await fetchPlaces(
      { clinicName: "Spires Physiotherapy", country: "uk" },
      { fetchImpl: fetchStub as unknown as typeof fetch },
    );

    expect(out).not.toBeNull();
    const result = out as PlacesResult;
    expect(result.name).toBe("Spires Physiotherapy");
    expect(result.address).toContain("Mill Lane");
    expect(result.phone).toBe("020 7794 0202");
    expect(result.website).toBe("https://www.spiresphysiotherapy.com");
    expect(result.hours).toHaveLength(2);
    expect(result.hours?.[0]).toContain("Monday");
    expect(result.rating).toBe(4.9);
  });

  it("sends API key in header, not URL", async () => {
    const fetchStub = mockFetchOnce({ ok: true, json: { places: [] } });
    await fetchPlaces(
      { clinicName: "Acme", country: "uk" },
      { fetchImpl: fetchStub as unknown as typeof fetch },
    );
    expect(fetchStub).toHaveBeenCalledTimes(1);
    const [url, init] = fetchStub.mock.calls[0] as [string, JsonFetchInit];
    expect(url).not.toContain("key=");
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers["X-Goog-Api-Key"]).toBe("mock-places-key");
    expect(headers["X-Goog-FieldMask"]).toBeDefined();
  });

  it("biases search to UK when country=uk", async () => {
    const fetchStub = mockFetchOnce({ ok: true, json: { places: [] } });
    await fetchPlaces(
      { clinicName: "Acme", country: "uk" },
      { fetchImpl: fetchStub as unknown as typeof fetch },
    );
    const [, init] = fetchStub.mock.calls[0] as [string, JsonFetchInit];
    const body = JSON.parse(String(init?.body ?? "{}"));
    expect(body.regionCode).toBe("GB");
    expect(body.textQuery).toContain("Acme");
  });

  it("returns null on upstream error (never throws)", async () => {
    const fetchStub = mockFetchOnce({ ok: false, status: 500 });
    const out = await fetchPlaces(
      { clinicName: "Acme", country: "uk" },
      { fetchImpl: fetchStub as unknown as typeof fetch },
    );
    expect(out).toBeNull();
  });
});

// ── Companies House adapter ──────────────────────────────────────────────────

describe("fetchCompaniesHouse", () => {
  it("returns null without API key", async () => {
    vi.stubEnv("COMPANIES_HOUSE_API_KEY", "");
    const out = await fetchCompaniesHouse({ clinicName: "Spires Physiotherapy Ltd" });
    expect(out).toBeNull();
  });

  it("returns company details when search matches", async () => {
    vi.stubEnv("COMPANIES_HOUSE_API_KEY", "mock-ch-key");
    const fetchStub = mockFetchSequence([
      {
        ok: true,
        json: {
          items: [
            {
              company_number: "12345678",
              title: "SPIRES PHYSIOTHERAPY LTD",
              company_status: "active",
              address_snippet: "45 Mill Lane, London",
            },
          ],
        },
      },
      {
        ok: true,
        json: {
          company_number: "12345678",
          company_name: "SPIRES PHYSIOTHERAPY LTD",
          company_status: "active",
          date_of_creation: "2018-04-12",
          sic_codes: ["86900"],
          registered_office_address: {
            address_line_1: "45 Mill Lane",
            locality: "London",
            postal_code: "NW3 1LB",
          },
        },
      },
    ]);

    const out = await fetchCompaniesHouse(
      { clinicName: "Spires Physiotherapy" },
      { fetchImpl: fetchStub as unknown as typeof fetch },
    );

    expect(out).not.toBeNull();
    const r = out as CompaniesHouseResult;
    expect(r.companyNumber).toBe("12345678");
    expect(r.companyName).toBe("SPIRES PHYSIOTHERAPY LTD");
    expect(r.status).toBe("active");
    expect(r.sicCodes).toEqual(["86900"]);
    expect(r.incorporatedOn).toBe("2018-04-12");
  });

  it("uses HTTP Basic auth with API key as username", async () => {
    vi.stubEnv("COMPANIES_HOUSE_API_KEY", "mock-ch-key");
    const fetchStub = mockFetchOnce({ ok: true, json: { items: [] } });
    await fetchCompaniesHouse(
      { clinicName: "Acme" },
      { fetchImpl: fetchStub as unknown as typeof fetch },
    );
    const [, init] = fetchStub.mock.calls[0] as [string, JsonFetchInit];
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers["Authorization"]).toMatch(/^Basic /);
    // Decoded should be "mock-ch-key:"
    const decoded = Buffer.from(
      headers["Authorization"].replace("Basic ", ""),
      "base64",
    ).toString("utf-8");
    expect(decoded).toBe("mock-ch-key:");
  });

  it("returns null when no search results", async () => {
    vi.stubEnv("COMPANIES_HOUSE_API_KEY", "mock-ch-key");
    const fetchStub = mockFetchOnce({ ok: true, json: { items: [] } });
    const out = await fetchCompaniesHouse(
      { clinicName: "NonExistent Clinic" },
      { fetchImpl: fetchStub as unknown as typeof fetch },
    );
    expect(out).toBeNull();
  });

  it("returns null on 404 without throwing", async () => {
    vi.stubEnv("COMPANIES_HOUSE_API_KEY", "mock-ch-key");
    const fetchStub = mockFetchOnce({ ok: false, status: 404 });
    const out = await fetchCompaniesHouse(
      { clinicName: "Acme" },
      { fetchImpl: fetchStub as unknown as typeof fetch },
    );
    expect(out).toBeNull();
  });
});

// ── Website adapter ──────────────────────────────────────────────────────────

describe("fetchWebsite", () => {
  it("returns null for missing URL", async () => {
    const out = await fetchWebsite(undefined);
    expect(out).toBeNull();
  });

  it("rejects non-http(s) URLs to prevent SSRF", async () => {
    const fetchStub = vi.fn();
    const out = await fetchWebsite("file:///etc/passwd", {
      fetchImpl: fetchStub as unknown as typeof fetch,
    });
    expect(out).toBeNull();
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("rejects private/loopback IPs to prevent SSRF", async () => {
    const fetchStub = vi.fn();
    const out = await fetchWebsite("http://127.0.0.1:8080/admin", {
      fetchImpl: fetchStub as unknown as typeof fetch,
    });
    expect(out).toBeNull();
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("fetches homepage and extracts visible text, stripping scripts and styles", async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Spires Physio</title>
          <style>.hidden { display: none }</style>
          <script>var secret = 'leaked'</script>
        </head>
        <body>
          <h1>Welcome to Spires Physiotherapy</h1>
          <p>We treat back pain, sports injuries, and post-surgical rehab.</p>
          <nav>Home About Contact</nav>
        </body>
      </html>
    `;
    const fetchStub = mockFetchOnce({
      ok: true,
      text: html,
    });

    const out = await fetchWebsite("https://www.spiresphysiotherapy.com", {
      fetchImpl: fetchStub as unknown as typeof fetch,
    });

    expect(out).not.toBeNull();
    const r = out as WebsiteResult;
    expect(r.url).toBe("https://www.spiresphysiotherapy.com/");
    expect(r.title).toBe("Spires Physio");
    expect(r.text).toContain("Welcome to Spires Physiotherapy");
    expect(r.text).toContain("back pain");
    expect(r.text).not.toContain("var secret");
    expect(r.text).not.toContain("display: none");
  });

  it("truncates extracted text to a maximum length to cap LLM token cost", async () => {
    const longBody = "<p>" + "payload ".repeat(5000) + "</p>";
    const fetchStub = mockFetchOnce({ ok: true, text: `<html><body>${longBody}</body></html>` });
    const out = await fetchWebsite("https://example.com", {
      fetchImpl: fetchStub as unknown as typeof fetch,
    });
    expect(out).not.toBeNull();
    expect((out as WebsiteResult).text.length).toBeLessThanOrEqual(12_000);
  });

  it("returns null on non-2xx response", async () => {
    const fetchStub = mockFetchOnce({ ok: false, status: 404 });
    const out = await fetchWebsite("https://example.com", {
      fetchImpl: fetchStub as unknown as typeof fetch,
    });
    expect(out).toBeNull();
  });

  it("returns null when fetch throws", async () => {
    const fetchStub = vi.fn().mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const out = await fetchWebsite("https://example.com", {
      fetchImpl: fetchStub as unknown as typeof fetch,
    });
    expect(out).toBeNull();
  });
});
