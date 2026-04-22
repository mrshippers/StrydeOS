/**
 * Google Places API (v1) client for fetching reviews.
 * Uses the Places API (New) — places.googleapis.com/v1
 */

const PLACES_BASE = "https://places.googleapis.com/v1";

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

    const res = await fetch(url, {
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
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
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
