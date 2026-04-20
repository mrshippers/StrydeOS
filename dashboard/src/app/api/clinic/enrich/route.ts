/**
 * POST /api/clinic/enrich
 *
 * Auto-populate the Ava knowledge base from public sources during onboarding.
 *
 * Flow:
 *   1. verify auth + owner/admin/superadmin role
 *   2. load clinic doc → clinic name
 *   3. run orchestrator (Places + Companies House + website → Haiku synth)
 *   4. merge with existing knowledge: preserve manual entries, replace prior auto
 *   5. persist to clinics/{id}.ava.knowledge[]
 *
 * The writes go to the same Firestore path that KnowledgeBaseEditor reads from,
 * so any subsequent edit on the receptionist page automatically syncs through
 * the existing useAvaKnowledge hook.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyApiRequest, requireRole, handleApiError } from "@/lib/auth-guard";
import { enrichClinic } from "@/lib/ava/enrich/orchestrator";
import { withRequestLog } from "@/lib/request-logger";
import type { KnowledgeEntry } from "@/lib/ava/ava-knowledge";

async function handler(req: NextRequest) {
  // Rate limit: 3 per IP per 10 min — enrichment is expensive and per-signup
  const { limited, remaining } = checkRateLimit(req, {
    limit: 3,
    windowMs: 10 * 60 * 1000,
  });
  if (limited) {
    return NextResponse.json(
      { error: "Too many enrichment requests. Please try again later." },
      { status: 429, headers: { "X-RateLimit-Remaining": String(remaining) } },
    );
  }

  try {
    const user = await verifyApiRequest(req);
    requireRole(user, ["owner", "admin", "superadmin"]);

    const clinicId = user.clinicId;
    if (!clinicId) {
      return NextResponse.json(
        { error: "No clinic associated with user" },
        { status: 400 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      website?: string;
      country?: string;
    };

    const db = getAdminDb();
    const clinicRef = db.collection("clinics").doc(clinicId);
    const clinicSnap = await clinicRef.get();

    if (!clinicSnap.exists) {
      return NextResponse.json({ error: "Clinic not found" }, { status: 404 });
    }

    const clinicData = clinicSnap.data() ?? {};
    const clinicName = typeof clinicData.name === "string" ? clinicData.name.trim() : "";

    if (!clinicName) {
      return NextResponse.json(
        { error: "Clinic name is missing — complete signup first" },
        { status: 400 },
      );
    }

    const country =
      body.country ??
      (typeof clinicData.compliance?.jurisdiction === "string"
        ? clinicData.compliance.jurisdiction
        : "uk");

    const result = await enrichClinic({
      clinicName,
      country,
      explicitWebsite: body.website?.trim() || undefined,
    });

    // Merge: keep manual entries, drop prior auto entries, add new auto entries
    const existingKnowledge: KnowledgeEntry[] =
      Array.isArray(clinicData.ava?.knowledge) ? clinicData.ava.knowledge : [];
    const manualKept = existingKnowledge.filter((e) => e.source !== "auto");
    const merged: KnowledgeEntry[] = [...manualKept, ...result.entries];

    const now = new Date().toISOString();
    await clinicRef.update({
      "ava.knowledge": merged,
      "ava.enrichment": {
        lastRunAt: now,
        sources: result.sources,
        autoEntriesCount: result.entries.length,
      },
      updatedAt: now,
    });

    return NextResponse.json({
      ok: true,
      entriesCount: result.entries.length,
      entries: result.entries,
      sources: result.sources,
      resolved: {
        places: result.resolved.places
          ? {
              address: result.resolved.places.address,
              phone: result.resolved.places.phone,
              website: result.resolved.places.website,
            }
          : null,
        companiesHouse: result.resolved.companiesHouse
          ? {
              companyNumber: result.resolved.companiesHouse.companyNumber,
              companyName: result.resolved.companiesHouse.companyName,
            }
          : null,
        website: result.resolved.website
          ? { url: result.resolved.website.url, title: result.resolved.website.title }
          : null,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export const POST = withRequestLog(handler);
