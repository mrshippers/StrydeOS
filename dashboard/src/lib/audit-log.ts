/**
 * Audit logging utility for tracking all ePHI access and configuration changes.
 * Required for HIPAA compliance and recommended for all jurisdictions.
 */

import type { Firestore } from "firebase-admin/firestore";
import type { AuditLogEntry } from "@/types";

export async function writeAuditLog(
  db: Firestore,
  clinicId: string,
  entry: Omit<AuditLogEntry, "timestamp">
): Promise<void> {
  try {
    const now = new Date().toISOString();
    const auditEntry: AuditLogEntry = {
      ...entry,
      timestamp: now,
    };

    await db
      .collection("clinics")
      .doc(clinicId)
      .collection("audit_logs")
      .add(auditEntry);
  } catch (err) {
    console.error("[audit log write error]", err);
    // Audit log failures must be tracked — silent loss of audit trail is a compliance risk
    try {
      const Sentry = await import("@sentry/nextjs");
      Sentry.captureException(err, { tags: { context: "audit_log_write", clinicId } });
    } catch {
      // Sentry unavailable — console.error above is the last resort
    }
  }
}

export function extractIpFromRequest(request: Request): string | undefined {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  
  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  return undefined;
}
