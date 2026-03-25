/**
 * POST /api/admin/run-migrations
 *
 * Superadmin-only endpoint to apply pending schema migrations.
 *
 * Body: { clinicId?: string }
 *   - If clinicId provided, runs migrations for that clinic only.
 *   - If omitted, runs migrations for every clinic.
 *
 * Returns: { results: MigrationResult[] }
 */

import { NextRequest, NextResponse } from "next/server";
import {
  verifyApiRequest,
  requireRole,
  handleApiError,
} from "@/lib/auth-guard";
import { getAdminDb } from "@/lib/firebase-admin";
import { runMigrations, MIGRATIONS } from "@/lib/migrations";
import type { MigrationResult } from "@/lib/migrations";
import { withRequestLog } from "@/lib/request-logger";

async function handler(request: NextRequest) {
  try {
    const user = await verifyApiRequest(request);
    requireRole(user, ["superadmin"]);

    const body = await request.json().catch(() => ({}));
    const { clinicId } = body as { clinicId?: string };

    const db = getAdminDb();
    const results: MigrationResult[] = [];

    if (clinicId) {
      // Verify the clinic exists
      const clinicSnap = await db.collection("clinics").doc(clinicId).get();
      if (!clinicSnap.exists) {
        return NextResponse.json(
          { error: `Clinic ${clinicId} not found` },
          { status: 404 }
        );
      }
      results.push(await runMigrations(db, clinicId, MIGRATIONS));
    } else {
      // Run for all clinics
      const clinicsSnap = await db.collection("clinics").get();
      for (const doc of clinicsSnap.docs) {
        results.push(await runMigrations(db, doc.id, MIGRATIONS));
      }
    }

    const totalApplied = results.reduce((n, r) => n + r.applied.length, 0);
    const totalErrors = results.reduce((n, r) => n + r.errors.length, 0);

    return NextResponse.json({
      summary: {
        clinicsProcessed: results.length,
        totalApplied,
        totalErrors,
      },
      results,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export const POST = withRequestLog(handler);
