import { NextRequest, NextResponse } from "next/server";
import { verifyApiRequest, handleApiError, requireRole } from "@/lib/auth-guard";
import { createHEPAdapter } from "@/lib/integrations/hep/factory";
import type { HEPIntegrationConfig } from "@/lib/integrations/hep/types";
import { withRequestLog } from "@/lib/request-logger";

async function handler(request: NextRequest) {
  try {
    const user = await verifyApiRequest(request);
    requireRole(user, ["owner", "admin", "superadmin"]);

    const body = await request.json().catch(() => ({}));
    const provider = (body.provider as HEPIntegrationConfig["provider"]) ?? "physitrack";
    const apiKey = body.apiKey as string | undefined;
    if (!apiKey?.trim()) {
      return NextResponse.json({ error: "API key is required" }, { status: 400 });
    }

    const adapter = createHEPAdapter({ provider, apiKey });
    const result = await adapter.testConnection();

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}

export const POST = withRequestLog(handler);
