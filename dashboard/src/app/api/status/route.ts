import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { withRequestLog } from "@/lib/request-logger";

type ServiceStatus = "operational" | "degraded" | "down" | "not_configured";

interface ServiceCheck {
  name: string;
  status: ServiceStatus;
  latency: number;
  checkedAt: string;
  uptimeHistory: number[];
  statusSource?: string; // "statuspage" | "ping" | "cached" | "static"
}

interface StatusResponse {
  overall: ServiceStatus;
  checkedAt: string;
  services: Record<string, ServiceCheck>;
}

// Cache for 60s
let cachedResult: StatusResponse | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60_000;
const TIMEOUT = 6000;

// ── Atlassian Statuspage API (used by Vercel, Stripe, Twilio, Sentry, ElevenLabs) ──

interface StatuspageResponse {
  status: { indicator: string; description: string };
  components?: { name: string; status: string }[];
}

function mapStatuspageIndicator(indicator: string): ServiceStatus {
  switch (indicator) {
    case "none":
    case "operational":
      return "operational";
    case "minor":
    case "maintenance":
    case "degraded_performance":
      return "degraded";
    case "major":
    case "critical":
    case "partial_outage":
    case "major_outage":
      return "down";
    default:
      return "operational";
  }
}

async function checkStatuspage(
  name: string,
  statuspageUrl: string,
  history: number[]
): Promise<ServiceCheck> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);

  try {
    const res = await fetch(`${statuspageUrl}/api/v2/status.json`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timer);
    const latency = Date.now() - start;

    if (!res.ok) {
      return { name, status: "degraded", latency, checkedAt: new Date().toISOString(), uptimeHistory: history, statusSource: "statuspage" };
    }

    const data = (await res.json()) as StatuspageResponse;
    const status = mapStatuspageIndicator(data.status.indicator);

    return { name, status, latency, checkedAt: new Date().toISOString(), uptimeHistory: history, statusSource: "statuspage" };
  } catch {
    clearTimeout(timer);
    return { name, status: "down", latency: -1, checkedAt: new Date().toISOString(), uptimeHistory: history, statusSource: "statuspage" };
  }
}

// ── Direct HTTP ping for services without public status pages ──

async function pingService(
  name: string,
  url: string,
  history: number[],
  method: "HEAD" | "GET" = "HEAD"
): Promise<ServiceCheck> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);

  try {
    const res = await fetch(url, {
      method,
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timer);
    const latency = Date.now() - start;

    let status: ServiceStatus = "operational";
    if (res.status >= 500) status = "down";
    else if (res.status >= 400 && res.status !== 400 && res.status !== 401 && res.status !== 403 && res.status !== 404 && res.status !== 405 && res.status !== 422)
      status = "degraded";
    if (latency > 5000 && status === "operational") status = "degraded";

    return { name, status, latency, checkedAt: new Date().toISOString(), uptimeHistory: history, statusSource: "ping" };
  } catch {
    clearTimeout(timer);
    return { name, status: "down", latency: -1, checkedAt: new Date().toISOString(), uptimeHistory: history, statusSource: "ping" };
  }
}

// ── Google Cloud status (Firebase) ──

async function checkFirebaseStatus(history: number[]): Promise<ServiceCheck> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);

  try {
    // Google Cloud status JSON feed
    const res = await fetch("https://status.cloud.google.com/incidents.json", {
      signal: controller.signal,
    });
    clearTimeout(timer);
    const latency = Date.now() - start;

    if (!res.ok) {
      // Fall back to ping
      return pingService("firebase", "https://firestore.googleapis.com", history);
    }

    const incidents = (await res.json()) as Array<{
      service_name: string;
      most_recent_update: { status: string };
      end?: string;
    }>;

    // Check for active Firestore/Firebase incidents
    const activeFirebase = incidents.filter(
      (i) =>
        !i.end &&
        (i.service_name.toLowerCase().includes("firestore") ||
          i.service_name.toLowerCase().includes("firebase") ||
          i.service_name.toLowerCase().includes("cloud datastore"))
    );

    let status: ServiceStatus = "operational";
    if (activeFirebase.length > 0) {
      const severity = activeFirebase[0]?.most_recent_update?.status;
      status = severity === "SERVICE_DISRUPTION" ? "down" : "degraded";
    }

    return { name: "firebase", status, latency, checkedAt: new Date().toISOString(), uptimeHistory: history, statusSource: "statuspage" };
  } catch {
    clearTimeout(timer);
    return pingService("firebase", "https://firestore.googleapis.com", history);
  }
}

// ── Placeholder history (no real uptime tracking yet) ──
// Returns empty array — the frontend should handle this gracefully.
// Real uptime tracking requires a cron job writing to Firestore.

function emptyHistory(): number[] {
  return [];
}

// ── Main check ──

async function checkAllServices(): Promise<StatusResponse> {
  const checks = await Promise.allSettled([
    // StrydeOS itself
    pingService("strydeos", process.env.NEXT_PUBLIC_APP_URL ? `${process.env.NEXT_PUBLIC_APP_URL}/login` : "https://portal.strydeos.com/login", emptyHistory()),

    // Firebase — Google Cloud status feed
    checkFirebaseStatus(emptyHistory()),

    // Vercel — Atlassian Statuspage
    checkStatuspage("vercel", "https://www.vercel-status.com", emptyHistory()),

    // Sentry — Atlassian Statuspage
    checkStatuspage("sentry", "https://status.sentry.io", emptyHistory()),

    // ElevenLabs — Atlassian Statuspage (Conversational AI voice agent)
    checkStatuspage("elevenlabs", "https://status.elevenlabs.io", emptyHistory()),

    // Twilio — Atlassian Statuspage (telephony + SMS)
    checkStatuspage("twilio", "https://status.twilio.com", emptyHistory()),

    // Resend — direct ping
    pingService("resend", "https://api.resend.com", emptyHistory()),

    // n8n — direct ping
    pingService("n8n", process.env.N8N_WEBHOOK_BASE_URL || "https://n8n.strydeos.com", emptyHistory()),

    // Stripe — direct ping (status.stripe.com JSON endpoint is 404; /v1/charges returns 401 when alive)
    pingService("stripe", "https://api.stripe.com/v1/charges", emptyHistory(), "GET"),

    // WriteUpp — direct ping
    pingService("writeupp", "https://app.writeupp.com", emptyHistory()),

    // Cliniko — direct ping
    pingService("cliniko", "https://api.au1.cliniko.com/v1", emptyHistory()),

    // Halaxy — not yet integrated
    Promise.resolve({ name: "halaxy", status: "not_configured" as ServiceStatus, latency: 0, checkedAt: new Date().toISOString(), uptimeHistory: [], statusSource: "static" }),

    // Zanda (Power Diary) — not yet integrated
    Promise.resolve({ name: "zanda", status: "not_configured" as ServiceStatus, latency: 0, checkedAt: new Date().toISOString(), uptimeHistory: [], statusSource: "static" }),

    // Physitrack — direct ping
    pingService("physitrack", "https://api.physitrack.com", emptyHistory()),

    // Heidi Health — ping the JWT endpoint; 401 (no key) = alive, 5xx = down
    pingService("heidi", "https://registrar.api.heidihealth.com/api/v2/ml-scribe/open-api/jwt?email=health%40check.invalid", emptyHistory(), "GET"),

    // Google Places — direct ping
    pingService("google_places", "https://places.googleapis.com", emptyHistory()),
  ]);

  const services: Record<string, ServiceCheck> = {};
  let hasDown = false;
  let hasDegraded = false;

  for (const result of checks) {
    if (result.status === "fulfilled") {
      const svc = result.value;
      services[svc.name] = svc;
      // Don't count "not_configured" services toward overall status
      if (svc.status === "down") hasDown = true;
      else if (svc.status === "degraded") hasDegraded = true;
    }
  }

  const overall: ServiceStatus = hasDown ? "down" : hasDegraded ? "degraded" : "operational";

  return { overall, checkedAt: new Date().toISOString(), services };
}

async function handler(request: NextRequest) {
  // Rate limit: 30 requests per IP per 60 seconds (public endpoint)
  const { limited } = checkRateLimit(request, { limit: 30, windowMs: 60_000 });
  if (limited) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const now = Date.now();
  if (cachedResult && now - cacheTimestamp < CACHE_TTL) {
    return NextResponse.json(cachedResult, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  }

  const result = await checkAllServices();
  cachedResult = result;
  cacheTimestamp = now;

  return NextResponse.json(result, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}

export const GET = withRequestLog(handler);

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
