/**
 * Inbound-email provisioning for the per-clinic CSV ingest inbox.
 *
 * Each clinic has a unique address (`import-{clinicId}@{INGEST_EMAIL_DOMAIN}`).
 * The inbound webhook (/api/pms/import-csv/inbound) will reject senders that
 * are not in `ClinicProfile.allowedInboundSenders` — this route is how owners
 * populate that allowlist during onboarding (and manage it later in Settings).
 *
 * Auth:
 *   GET    → owner | admin | superadmin (read-only config view)
 *   POST   → owner | superadmin         (security-sensitive: who can post CSVs)
 *   DELETE → owner | superadmin         (pauses ingestion entirely)
 *
 * Storage: writes ClinicProfile.allowedInboundSenders on `clinics/{clinicId}`.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { getAdminDb } from "@/lib/firebase-admin";
import {
  verifyApiRequest,
  handleApiError,
  requireRole,
  type VerifiedUser,
} from "@/lib/auth-guard";
import { writeAuditLog, extractIpFromRequest } from "@/lib/audit-log";
import { withRequestLog } from "@/lib/request-logger";

const INGEST_DOMAIN = (process.env.INGEST_EMAIL_DOMAIN ?? "ingest.strydeos.com").trim() || "ingest.strydeos.com";
const MAX_SENDERS = 10;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ProvisionResponse {
  email: string;
  allowedSenders: string[];
  provisioned: boolean;
  domain: string;
}

function buildIngestEmail(clinicId: string): string {
  return `import-${clinicId}@${INGEST_DOMAIN}`;
}

function shape(clinicId: string, allowedSenders: string[]): ProvisionResponse {
  return {
    email: buildIngestEmail(clinicId),
    allowedSenders,
    provisioned: allowedSenders.length > 0,
    domain: INGEST_DOMAIN,
  };
}

function normalise(sender: string): string {
  return sender.trim().toLowerCase();
}

async function loadAllowedSenders(clinicId: string): Promise<string[]> {
  const db = getAdminDb();
  const snap = await db.collection("clinics").doc(clinicId).get();
  if (!snap.exists) return [];
  const data = snap.data() as { allowedInboundSenders?: string[] } | undefined;
  return Array.isArray(data?.allowedInboundSenders) ? data!.allowedInboundSenders! : [];
}

async function persistAllowedSenders(clinicId: string, senders: string[]): Promise<void> {
  const db = getAdminDb();
  await db
    .collection("clinics")
    .doc(clinicId)
    .set(
      {
        allowedInboundSenders: senders,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
}

async function checkRateLimit(request: NextRequest): Promise<NextResponse | null> {
  const { limited, remaining } = await checkRateLimitAsync(request, { limit: 20, windowMs: 60_000 });
  if (limited) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "X-RateLimit-Remaining": String(remaining) } }
    );
  }
  return null;
}

// ─── GET ─────────────────────────────────────────────────────────────────────

async function getHandler(request: NextRequest): Promise<NextResponse> {
  const limited = await checkRateLimit(request);
  if (limited) return limited;

  try {
    const user = await verifyApiRequest(request);
    requireRole(user, ["owner", "admin", "superadmin"]);
    const clinicId = user.clinicId;
    if (!clinicId) return NextResponse.json({ error: "No clinic" }, { status: 400 });

    const senders = await loadAllowedSenders(clinicId);
    return NextResponse.json(shape(clinicId, senders));
  } catch (e) {
    return handleApiError(e);
  }
}

// ─── POST ────────────────────────────────────────────────────────────────────

interface PostBody {
  action?: "add" | "remove" | "replace";
  sender?: string | string[];
}

function parsePostBody(raw: unknown): { action: PostBody["action"]; sender: PostBody["sender"] } {
  const body = (raw ?? {}) as PostBody;
  return { action: body.action, sender: body.sender };
}

function applyAction(
  current: string[],
  action: NonNullable<PostBody["action"]>,
  sender: NonNullable<PostBody["sender"]>
): { ok: true; next: string[]; changed: boolean } | { ok: false; status: number; error: string } {
  if (action === "replace") {
    if (!Array.isArray(sender)) {
      return { ok: false, status: 400, error: "Replace requires an array of senders" };
    }
    const cleaned: string[] = [];
    for (const s of sender) {
      if (typeof s !== "string" || !EMAIL_RE.test(s.trim())) {
        return { ok: false, status: 400, error: "Invalid sender email" };
      }
      const n = normalise(s);
      if (!cleaned.includes(n)) cleaned.push(n);
    }
    if (cleaned.length > MAX_SENDERS) {
      return { ok: false, status: 400, error: `Sender allowlist full (max ${MAX_SENDERS})` };
    }
    return { ok: true, next: cleaned, changed: true };
  }

  if (typeof sender !== "string" || !EMAIL_RE.test(sender.trim())) {
    return { ok: false, status: 400, error: "Invalid sender email" };
  }
  const n = normalise(sender);

  if (action === "add") {
    if (current.includes(n)) {
      return { ok: true, next: current, changed: false };
    }
    if (current.length >= MAX_SENDERS) {
      return { ok: false, status: 400, error: `Sender allowlist full (max ${MAX_SENDERS})` };
    }
    return { ok: true, next: [...current, n], changed: true };
  }

  if (action === "remove") {
    const next = current.filter((entry) => entry !== n);
    if (next.length === 0) {
      return {
        ok: false,
        status: 400,
        error: "Cannot remove the only remaining sender — use DELETE to clear the allowlist",
      };
    }
    return { ok: true, next, changed: next.length !== current.length };
  }

  return { ok: false, status: 400, error: "Invalid action" };
}

async function postHandler(request: NextRequest): Promise<NextResponse> {
  const limited = await checkRateLimit(request);
  if (limited) return limited;

  let user: VerifiedUser;
  try {
    user = await verifyApiRequest(request);
    // Read access for any clinic admin/owner — keeps the GET-style 403 for clinicians.
    requireRole(user, ["owner", "admin", "superadmin"]);
    // Mutations are owner/superadmin only — admins can connect PMS keys but not change who can email in.
    requireRole(user, ["owner", "superadmin"]);
  } catch (e) {
    return handleApiError(e);
  }

  const clinicId = user.clinicId;
  if (!clinicId) return NextResponse.json({ error: "No clinic" }, { status: 400 });

  try {
    const raw = await request.json().catch(() => ({}));
    const { action, sender } = parsePostBody(raw);
    if (!action || !sender) {
      return NextResponse.json({ error: "action and sender are required" }, { status: 400 });
    }

    const current = await loadAllowedSenders(clinicId);
    const result = applyAction(current, action, sender);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    if (result.changed) {
      await persistAllowedSenders(clinicId, result.next);
      await writeAuditLog(getAdminDb(), clinicId, {
        userId: user.uid,
        userEmail: user.email,
        action: "config_change",
        resource: "clinic_profile",
        resourceId: "allowedInboundSenders",
        metadata: { action, count: result.next.length },
        ip: extractIpFromRequest(request),
      });
    }

    return NextResponse.json(shape(clinicId, result.next));
  } catch (e) {
    return handleApiError(e);
  }
}

// ─── DELETE ──────────────────────────────────────────────────────────────────

async function deleteHandler(request: NextRequest): Promise<NextResponse> {
  const limited = await checkRateLimit(request);
  if (limited) return limited;

  try {
    const user = await verifyApiRequest(request);
    requireRole(user, ["owner", "superadmin"]);
    const clinicId = user.clinicId;
    if (!clinicId) return NextResponse.json({ error: "No clinic" }, { status: 400 });

    await persistAllowedSenders(clinicId, []);
    await writeAuditLog(getAdminDb(), clinicId, {
      userId: user.uid,
      userEmail: user.email,
      action: "config_change",
      resource: "clinic_profile",
      resourceId: "allowedInboundSenders",
      metadata: { action: "clear" },
      ip: extractIpFromRequest(request),
    });

    return NextResponse.json(shape(clinicId, []));
  } catch (e) {
    return handleApiError(e);
  }
}

export const GET = withRequestLog(getHandler);
export const POST = withRequestLog(postHandler);
export const DELETE = withRequestLog(deleteHandler);
