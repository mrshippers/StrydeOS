/**
 * Public-source adapters for clinic-onboarding enrichment.
 *
 * Three independent, pure functions that resolve a clinic identifier into
 * structured facts from public data. Each returns `null` on any failure —
 * nothing throws. The orchestrator composes whatever signals came back.
 *
 * SSRF guard: fetchWebsite rejects file://, private RFC-1918 IPs, and
 * loopback addresses before issuing any network request.
 */

// ── Shared types ─────────────────────────────────────────────────────────────

export interface PlacesResult {
  name: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  hours: string[] | null;
  rating: number | null;
  userRatingCount: number | null;
}

export interface CompaniesHouseResult {
  companyNumber: string;
  companyName: string;
  status: string | null;
  incorporatedOn: string | null;
  sicCodes: string[];
  registeredAddress: string | null;
}

export interface WebsiteResult {
  url: string;
  title: string | null;
  text: string;
}

interface InjectableFetch {
  fetchImpl?: typeof fetch;
}

const WEBSITE_TEXT_CAP = 12_000;
const WEBSITE_FETCH_TIMEOUT_MS = 7_000;
const PLACES_FETCH_TIMEOUT_MS = 5_000;
const COMPANIES_HOUSE_FETCH_TIMEOUT_MS = 5_000;

// ── Google Places v1 ─────────────────────────────────────────────────────────

export interface PlacesInput {
  clinicName: string;
  country?: string;
}

export async function fetchPlaces(
  input: PlacesInput,
  opts: InjectableFetch = {},
): Promise<PlacesResult | null> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return null;

  const fetchImpl = opts.fetchImpl ?? fetch;
  const regionCode = (input.country ?? "uk").toLowerCase() === "uk" ? "GB" : "US";
  const textQuery = `${input.clinicName} physiotherapy clinic`;

  const body = JSON.stringify({ textQuery, regionCode, maxResultCount: 1 });

  try {
    const res = await withTimeout(
      fetchImpl("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask":
            "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.regularOpeningHours,places.rating,places.userRatingCount",
        },
        body,
      }),
      PLACES_FETCH_TIMEOUT_MS,
    );

    if (!res.ok) return null;
    const data = (await res.json()) as {
      places?: Array<{
        id?: string;
        displayName?: { text?: string };
        formattedAddress?: string;
        nationalPhoneNumber?: string;
        websiteUri?: string;
        regularOpeningHours?: { weekdayDescriptions?: string[] };
        rating?: number;
        userRatingCount?: number;
      }>;
    };

    const place = data.places?.[0];
    if (!place) return null;

    return {
      name: place.displayName?.text ?? input.clinicName,
      address: place.formattedAddress ?? null,
      phone: place.nationalPhoneNumber ?? null,
      website: place.websiteUri ?? null,
      hours: place.regularOpeningHours?.weekdayDescriptions ?? null,
      rating: typeof place.rating === "number" ? place.rating : null,
      userRatingCount:
        typeof place.userRatingCount === "number" ? place.userRatingCount : null,
    };
  } catch {
    return null;
  }
}

// ── Companies House ──────────────────────────────────────────────────────────

export interface CompaniesHouseInput {
  clinicName: string;
}

export async function fetchCompaniesHouse(
  input: CompaniesHouseInput,
  opts: InjectableFetch = {},
): Promise<CompaniesHouseResult | null> {
  const key = process.env.COMPANIES_HOUSE_API_KEY;
  if (!key) return null;

  const fetchImpl = opts.fetchImpl ?? fetch;
  const authHeader = `Basic ${Buffer.from(`${key}:`).toString("base64")}`;

  try {
    const searchRes = await withTimeout(
      fetchImpl(
        `https://api.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(input.clinicName)}&items_per_page=1`,
        { headers: { Authorization: authHeader } },
      ),
      COMPANIES_HOUSE_FETCH_TIMEOUT_MS,
    );
    if (!searchRes.ok) return null;

    const searchData = (await searchRes.json()) as {
      items?: Array<{ company_number?: string }>;
    };
    const companyNumber = searchData.items?.[0]?.company_number;
    if (!companyNumber) return null;

    const detailRes = await withTimeout(
      fetchImpl(
        `https://api.company-information.service.gov.uk/company/${encodeURIComponent(companyNumber)}`,
        { headers: { Authorization: authHeader } },
      ),
      COMPANIES_HOUSE_FETCH_TIMEOUT_MS,
    );
    if (!detailRes.ok) return null;

    const detail = (await detailRes.json()) as {
      company_number?: string;
      company_name?: string;
      company_status?: string;
      date_of_creation?: string;
      sic_codes?: string[];
      registered_office_address?: {
        address_line_1?: string;
        address_line_2?: string;
        locality?: string;
        postal_code?: string;
      };
    };

    const regAddr = detail.registered_office_address;
    const addressParts = regAddr
      ? [regAddr.address_line_1, regAddr.address_line_2, regAddr.locality, regAddr.postal_code]
          .filter((x): x is string => Boolean(x))
          .join(", ")
      : "";

    return {
      companyNumber: detail.company_number ?? companyNumber,
      companyName: detail.company_name ?? input.clinicName,
      status: detail.company_status ?? null,
      incorporatedOn: detail.date_of_creation ?? null,
      sicCodes: detail.sic_codes ?? [],
      registeredAddress: addressParts || null,
    };
  } catch {
    return null;
  }
}

// ── Website scrape ───────────────────────────────────────────────────────────

export async function fetchWebsite(
  url: string | undefined,
  opts: InjectableFetch = {},
): Promise<WebsiteResult | null> {
  if (!url) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  if (isPrivateOrLoopbackHost(parsed.hostname)) return null;

  const fetchImpl = opts.fetchImpl ?? fetch;
  try {
    const res = await withTimeout(
      fetchImpl(parsed.toString(), {
        method: "GET",
        redirect: "follow",
        headers: {
          "User-Agent": "StrydeOS-ClinicEnrichment/1.0 (+https://strydeos.com)",
          Accept: "text/html,application/xhtml+xml",
        },
      }),
      WEBSITE_FETCH_TIMEOUT_MS,
    );

    if (!res.ok) return null;
    const html = await res.text();

    const title = extractTitle(html);
    const text = extractVisibleText(html);
    const capped = text.length > WEBSITE_TEXT_CAP ? text.slice(0, WEBSITE_TEXT_CAP) : text;

    return { url: parsed.toString(), title, text: capped };
  } catch {
    return null;
  }
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function extractTitle(html: string): string | null {
  const m = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
  return m ? m[1].trim() : null;
}

function extractVisibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function isPrivateOrLoopbackHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost") return true;
  if (h === "::1" || h === "[::1]") return true;

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 0) return true;
  }
  return false;
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
