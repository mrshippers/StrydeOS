/**
 * Google Places API (v1) client for fetching reviews.
 * Uses the Places API (New) — places.googleapis.com/v1
 */

const PLACES_BASE = "https://places.googleapis.com/v1";

const MAX_RETRIES = 3;
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfter(res: Response): number | null {
  const header = res.headers.get("Retry-After");
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const when = Date.parse(header);
  if (!Number.isNaN(when)) return Math.max(0, when - Date.now());
  return null;
}

/**
 * GET with retry on 429/5xx. Places reads are idempotent, so a transient blip
 * (or a quota burst when several clinics sync in the same window) backs off and
 * retries rather than failing the reviews stage outright.
 */
async function fetchWithRetry(url: string, init?: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, init);
    if (RETRY_STATUSES.has(res.status) && attempt < MAX_RETRIES) {
      const retryAfter = parseRetryAfter(res);
      const backoff =
        retryAfter ?? Math.min(8_000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250);
      await res.text().catch(() => "");
      await sleep(backoff);
      continue;
    }
    return res;
  }
}

export interface GoogleReview {
  name: string;
  relativePublishTimeDescription: string;
  rating: number;
  text?: { text: string; languageCode: string };
  originalText?: { text: string; languageCode: string };
  authorAttribution: {
    displayName: string;
    uri?: string;
    photoUri?: string;
  };
  publishTime: string;
}

interface PlaceDetailsResponse {
  displayName?: { text: string; languageCode?: string };
  reviews?: GoogleReview[];
  rating?: number;
  userRatingCount?: number;
}

export interface PlaceSummary {
  displayName: string;
  rating: number | null;
  userRatingCount: number | null;
  reviews: GoogleReview[];
}

export class GooglePlacesClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Fetches the place summary: aggregate rating, total review count, display
   * name, and the (up to 5) most recent reviews Google exposes on its API.
   * The Places API (New) caps reviews per response at 5; the aggregate count
   * is how we surface the "real" 147 total.
   */
  async getPlaceSummary(placeId: string): Promise<PlaceSummary> {
    const url = `${PLACES_BASE}/places/${encodeURIComponent(placeId)}?fields=displayName,reviews,rating,userRatingCount&key=${this.apiKey}`;

    const res = await fetchWithRetry(url, {
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Google Places API ${res.status}: ${body}`);
    }

    const data: PlaceDetailsResponse = await res.json();
    return {
      displayName: data.displayName?.text ?? "",
      rating: typeof data.rating === "number" ? data.rating : null,
      userRatingCount: typeof data.userRatingCount === "number" ? data.userRatingCount : null,
      reviews: data.reviews ?? [],
    };
  }

  /** @deprecated Prefer getPlaceSummary, which returns aggregate stats too. */
  async getPlaceReviews(placeId: string): Promise<GoogleReview[]> {
    const summary = await this.getPlaceSummary(placeId);
    return summary.reviews;
  }

  async testConnection(placeId: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const url = `${PLACES_BASE}/places/${encodeURIComponent(placeId)}?fields=displayName&key=${this.apiKey}`;
      const res = await fetchWithRetry(url, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return { ok: false, error: `API ${res.status}: ${body}` };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
