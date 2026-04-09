import { NextRequest, NextResponse } from "next/server";
import { verifyApiRequest, handleApiError, requireRole } from "@/lib/auth-guard";
import { validateApiKey } from "@/lib/integrations/heidi/client";
import { withRequestLog } from "@/lib/request-logger";

const VALID_REGIONS = ["uk", "au", "us", "eu"] as const;

async function handler(request: NextRequest) {
  try {
    const user = await verifyApiRequest(request);
    requireRole(user, ["owner", "admin", "superadmin"]);

    const body = await request.json().catch(() => ({}));
    const apiKey = body.apiKey as string | undefined;
    const email = body.email as string | undefined;
    const region = (body.region as string) ?? "uk";

    if (!apiKey?.trim()) {
      return NextResponse.json({ error: "API key is required" }, { status: 400 });
    }
    if (!email?.trim()) {
      return NextResponse.json({ error: "Clinician email is required" }, { status: 400 });
    }
    if (!VALID_REGIONS.includes(region as (typeof VALID_REGIONS)[number])) {
      return NextResponse.json(
        { error: `Invalid region — must be one of: ${VALID_REGIONS.join(", ")}` },
        { status: 400 },
      );
    }

    const valid = await validateApiKey(
      { apiKey: apiKey.trim(), region: region as (typeof VALID_REGIONS)[number] },
      email.trim(),
    );

    if (!valid) {
      return NextResponse.json(
        { error: "Invalid API key — could not authenticate with Heidi" },
        { status: 401 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}

export const POST = withRequestLog(handler);
