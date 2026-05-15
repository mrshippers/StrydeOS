/**
 * GET /api/ava/digest
 *
 * On-demand Ava call summary email digest for clinic owners and admins.
 * Reads the last 24h (or ?since=ISO) of call_log entries, aggregates by
 * outcome, and sends a formatted email digest via Resend.
 *
 * Auth: session cookie — owner / admin / superadmin only.
 * Returns: { sent: boolean, summary: { booked, callbacks, escalated, info, voicemail, total } }
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyApiRequest, requireRole, requireClinic, handleApiError } from "@/lib/auth-guard";
import { sendAvaDigestEmail } from "@/lib/intelligence/emails/ava-digest";
import type { AvaDigestCall, AvaDigestSummary } from "@/lib/intelligence/emails/ava-digest";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await verifyApiRequest(req);
    requireRole(user, ["owner", "admin", "superadmin"]);

    const { clinicId } = user;
    const sinceParam = req.nextUrl.searchParams.get("since");
    const since = sinceParam
      ? new Date(sinceParam)
      : new Date(Date.now() - 24 * 60 * 60 * 1000);

    if (isNaN(since.getTime())) {
      return NextResponse.json({ error: "Invalid since parameter" }, { status: 400 });
    }

    const db = getAdminDb();

    const [clinicSnap, callLogSnap] = await Promise.all([
      db.collection("clinics").doc(clinicId).get(),
      db
        .collection("clinics")
        .doc(clinicId)
        .collection("call_log")
        .orderBy("startTimestamp", "desc")
        .limit(100)
        .get(),
    ]);

    const clinicData = clinicSnap.data();
    const clinicEmail = clinicData?.email as string | undefined;
    const clinicName = (clinicData?.name as string) || "Your clinic";

    if (!clinicEmail) {
      return NextResponse.json(
        { error: "No email address configured for this clinic" },
        { status: 422 },
      );
    }

    const sinceMs = since.getTime();
    const callDocs = callLogSnap.docs.filter((d) => {
      const ts = d.data().startTimestamp;
      if (!ts) return false;
      const ms = typeof ts === "string" ? new Date(ts).getTime() : ts.toMillis?.() ?? 0;
      return ms >= sinceMs;
    });

    const summary: AvaDigestSummary = {
      booked: 0, callbacks: 0, escalated: 0, info: 0, voicemail: 0, total: callDocs.length,
    };

    const calls: AvaDigestCall[] = callDocs.map((d) => {
      const data = d.data();
      const outcome = (data.outcome as string) || "unknown";

      switch (outcome) {
        case "booked": summary.booked++; break;
        case "follow_up_required": summary.callbacks++; break;
        case "escalated": summary.escalated++; break;
        case "voicemail": summary.voicemail++; break;
        default: summary.info++;
      }

      const tsRaw = data.startTimestamp;
      const time = typeof tsRaw === "string"
        ? tsRaw
        : tsRaw?.toDate?.()?.toISOString?.() ?? new Date().toISOString();

      return {
        time,
        outcome,
        callerPhone: (data.callerPhone as string) || "",
        durationSeconds: (data.durationSeconds as number) || 0,
      };
    });

    const startLabel = since.toLocaleDateString("en-GB", {
      day: "numeric", month: "short", timeZone: "Europe/London",
    });
    const endLabel = new Date().toLocaleDateString("en-GB", {
      day: "numeric", month: "short", timeZone: "Europe/London",
    });
    const dateRange = `${startLabel} – ${endLabel}`;

    await sendAvaDigestEmail(clinicEmail, {
      clinicName,
      dateRange,
      summary,
      calls,
    });

    return NextResponse.json({ sent: true, summary });
  } catch (err) {
    return handleApiError(err);
  }
}
