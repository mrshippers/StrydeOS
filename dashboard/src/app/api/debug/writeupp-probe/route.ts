import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyApiRequest, requireRole, requireClinic, handleApiError } from "@/lib/auth-guard";
import type { PMSIntegrationConfig } from "@/types/pms";
import { writeUppFetch } from "@/lib/integrations/pms/writeupp/client";

/**
 * POST /api/debug/writeupp-probe
 *
 * Admin-only diagnostic endpoint to validate WriteUpp REST API field names.
 * Fires a live GET /appointments call and returns raw JSON key shape (top 3, keys only)
 * so we can confirm actual response structure before fixing mappers.
 *
 * Body: { clinicId: string }
 * Auth: Bearer token — owner, admin, or superadmin. Non-superadmin can only probe own clinic.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await verifyApiRequest(request);
    requireRole(user, ["owner", "admin", "superadmin"]);

    const body = await request.json().catch(() => ({}));
    const clinicId = body.clinicId as string | undefined;
    if (!clinicId?.trim()) {
      return NextResponse.json({ error: "Missing clinicId in body" }, { status: 400 });
    }

    requireClinic(user, clinicId);

    const db = getAdminDb();
    const configSnap = await db
      .collection("clinics")
      .doc(clinicId)
      .collection("integrations_config")
      .doc("pms")
      .get();

    const config = configSnap.data() as PMSIntegrationConfig | undefined;
    if (!config?.apiKey?.trim() || config.provider !== "writeupp") {
      return NextResponse.json(
        { error: "Clinic does not have WriteUpp API configured" },
        { status: 400 }
      );
    }

    // 7-day window
    const now = new Date();
    const dateTo = now.toISOString().slice(0, 10);
    const dateFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const path = `/appointments?from=${encodeURIComponent(dateFrom)}&to=${encodeURIComponent(dateTo)}`;

    let rawResponse: unknown = null;
    let httpStatus: number | null = null;
    let parseError: string | null = null;

    try {
      rawResponse = await writeUppFetch<unknown>(
        { apiKey: config.apiKey, baseUrl: config.baseUrl },
        path
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      parseError = msg;
      if (msg.includes("401")) httpStatus = 401;
      else if (msg.includes("403")) httpStatus = 403;
      else if (msg.includes("404")) httpStatus = 404;
    }

    // Extract rows from response (could be { data: [] }, { appointments: [] }, or direct array)
    const rawRows: unknown[] = Array.isArray(rawResponse)
      ? rawResponse
      : (rawResponse as Record<string, unknown>)?.["data"] ?? (rawResponse as Record<string, unknown>)?.["appointments"] ?? [];

    const arr = Array.isArray(rawRows) ? rawRows : [];

    // Return keys-only shape for first 3 results (no PHI)
    const top3 = arr.slice(0, 3);
    const keyShape = top3.map((row) => {
      if (row === null || typeof row !== "object") return { keys: [], sample: null };
      const obj = row as Record<string, unknown>;
      const keys = Object.keys(obj);
      const sample: Record<string, string> = {};
      for (const k of keys) {
        const v = obj[k];
        if (v === null) sample[k] = "null";
        else if (Array.isArray(v)) sample[k] = "array";
        else if (typeof v === "object") sample[k] = "object";
        else sample[k] = typeof v;
      }
      return { keys, sample };
    });

    const summary = {
      dateFrom,
      dateTo,
      totalReturned: arr.length,
      keyShape,
      parseError: parseError ?? undefined,
      httpStatus: httpStatus ?? undefined,
      confirmedFields: keyShape[0]?.keys ?? [],
    };

    return NextResponse.json({
      ok: !parseError,
      summary,
      message: parseError
        ? "WriteUpp API call failed — use summary.parseError and summary.httpStatus to fix."
        : "Use summary.keyShape to confirm field names for mappers.",
    });
  } catch (e) {
    return handleApiError(e);
  }
}
