/**
 * Server-proxied UK address lookup for the public intake form (getAddress.io).
 *
 * The form is public, so the getAddress.io key MUST stay server-side — never in
 * the client bundle. Lookups are gated on a valid intake token (ties every paid
 * lookup to a real issued link) and rate-limited to protect the API quota.
 *
 * GET /api/intake/[token]/address-lookup?postcode=NW6+1AB
 *   → { postcode, addresses: [{ line1, line2, town, county, postcode, label }] }
 *   503 when no GETADDRESS_API_KEY is configured (client falls back to manual entry).
 */

import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/auth-guard";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { withRequestLog } from "@/lib/request-logger";
import { verifyIntakeToken } from "@/lib/insurance/intake-token";

interface GetAddressItem {
  line_1?: string;
  line_2?: string;
  line_3?: string;
  line_4?: string;
  town_or_city?: string;
  county?: string;
  formatted_address?: string[];
}

function normalise(item: GetAddressItem, postcode: string) {
  const line2 = [item.line_2, item.line_3, item.line_4].filter(Boolean).join(", ");
  const label =
    (item.formatted_address ?? [])
      .map((p) => p.trim())
      .filter(Boolean)
      .join(", ") || [item.line_1, item.town_or_city].filter(Boolean).join(", ");
  return {
    line1: item.line_1 ?? "",
    line2,
    town: item.town_or_city ?? "",
    county: item.county ?? "",
    postcode,
    label,
  };
}

async function getHandler(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { limited } = await checkRateLimitAsync(request, { limit: 12, windowMs: 60_000 });
  if (limited) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  try {
    const { token } = await params;
    if (!verifyIntakeToken(token, Date.now())) {
      return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 });
    }

    const postcode = (request.nextUrl.searchParams.get("postcode") ?? "").trim();
    if (!postcode) {
      return NextResponse.json({ error: "Postcode is required" }, { status: 400 });
    }

    const apiKey = process.env.GETADDRESS_API_KEY;
    if (!apiKey) {
      // Not configured yet — let the client fall back to manual address entry.
      return NextResponse.json({ error: "Address lookup is not configured" }, { status: 503 });
    }

    const url = `https://api.getAddress.io/find/${encodeURIComponent(postcode)}?api-key=${encodeURIComponent(apiKey)}&expand=true`;
    const res = await fetch(url);

    if (res.status === 404) {
      return NextResponse.json({ postcode, addresses: [] });
    }
    if (!res.ok) {
      return NextResponse.json({ error: "Address lookup failed" }, { status: 502 });
    }

    const data = (await res.json()) as { postcode?: string; addresses?: GetAddressItem[] };
    const resolvedPostcode = (data.postcode || postcode).toUpperCase();
    const addresses = (data.addresses ?? []).map((a) => normalise(a, resolvedPostcode));

    return NextResponse.json({ postcode: resolvedPostcode, addresses });
  } catch (e) {
    return handleApiError(e);
  }
}

export const GET = withRequestLog(getHandler);
