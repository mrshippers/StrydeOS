import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyApiRequest, handleApiError, requireRole } from "@/lib/auth-guard";
import { createPMSAdapter } from "@/lib/integrations/pms/factory";
import type { PmsProvider } from "@/types";
import { withRequestLog } from "@/lib/request-logger";

async function handler(request: NextRequest) {
  try {
    const user = await verifyApiRequest(request);
    requireRole(user, ["owner", "admin", "superadmin"]);

    const body = await request.json().catch(() => ({}));
    const provider = (body.provider as PmsProvider) ?? "writeupp";
    const apiKey = body.apiKey as string | undefined;
    if (!apiKey?.trim()) {
      return NextResponse.json({ error: "API key is required" }, { status: 400 });
    }

    const adapter = createPMSAdapter({ provider, apiKey });
    const result = await adapter.testConnection();

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, resolvedBase: (result as { resolvedBase?: string }).resolvedBase });
  } catch (e) {
    return handleApiError(e);
  }
}

export const POST = withRequestLog(handler);
