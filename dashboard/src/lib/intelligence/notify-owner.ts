import type { Firestore } from "firebase-admin/firestore";
import type { InsightEvent } from "@/types/insight-events";
import { rankEvents } from "./rank-events";
import { buildStateOfClinicEmail, buildStateOfClinicText } from "./emails/state-of-clinic";
import { buildUrgentAlertEmail, buildUrgentAlertText } from "./emails/urgent-alert";

/**
 * Route insight events to notification channels.
 *
 * Channels:
 *  - In-app: Write to clinics/{clinicId}/insight_events (already done by detection)
 *  - Weekly digest: Top 3 ranked events (called separately by digest cron)
 *  - Urgent email: Critical events above threshold (called inline)
 */
export async function notifyOwnerInApp(
  db: Firestore,
  clinicId: string,
  events: InsightEvent[]
): Promise<{ written: number }> {
  // In-app notifications are the InsightEvent documents themselves —
  // the bell reads from insight_events collection directly.
  // This function exists for any additional in-app notification logic.
  return { written: events.length };
}

/**
 * Send urgent email alerts for critical events.
 * Only fires for:
 *  - REVENUE_LEAK_DETECTED with revenueImpact > 500
 *  - NPS_DETRACTOR_ALERT (any)
 */
export async function sendUrgentAlerts(
  db: Firestore,
  clinicId: string,
  events: InsightEvent[]
): Promise<{ sent: number; errors: string[] }> {
  const errors: string[] = [];
  let sent = 0;

  const urgentEvents = events.filter((e) => {
    if (e.type === "NPS_DETRACTOR_ALERT") return true;
    if (e.type === "REVENUE_LEAK_DETECTED" && (e.revenueImpact ?? 0) > 500) return true;
    return false;
  });

  if (urgentEvents.length === 0) return { sent: 0, errors: [] };

  // Check comms consent
  const clinicDoc = await db.doc(`clinics/${clinicId}`).get();
  if (!clinicDoc.exists) return { sent: 0, errors: ["Clinic document not found"] };

  const clinicData = clinicDoc.data()!;
  const consentGranted = clinicData.commsConsentGrantedAt != null;
  if (!consentGranted) {
    console.warn(`[notify-owner] Skipping urgent email for clinic ${clinicId}: comms consent not granted`);
    return { sent: 0, errors: [] };
  }

  const ownerEmail = clinicData.ownerEmail as string | undefined;
  if (!ownerEmail) return { sent: 0, errors: ["No owner email configured"] };

  const clinicName = (clinicData.name as string) ?? "Your Clinic";

  // Only attempt email if Resend API key is configured
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.warn("[notify-owner] RESEND_API_KEY not configured, skipping urgent emails");
    return { sent: 0, errors: [] };
  }

  const { Resend } = await import("resend");
  const resend = new Resend(resendKey);
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "insights@strydeos.com";

  for (const event of urgentEvents) {
    try {
      const html = buildUrgentAlertEmail(event, clinicName);
      const text = buildUrgentAlertText(event, clinicName);

      await resend.emails.send({
        from: `StrydeOS Intelligence <${fromEmail}>`,
        to: ownerEmail,
        subject: `⚠️ ${event.title} — ${clinicName}`,
        html,
        text,
      });

      // Update lastNotifiedAt
      if (event.id) {
        await db
          .doc(`clinics/${clinicId}/insight_events/${event.id}`)
          .update({ lastNotifiedAt: new Date().toISOString() });
      }

      sent++;
    } catch (err) {
      errors.push(
        `Failed to send urgent alert for ${event.type}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return { sent, errors };
}

/**
 * Send the weekly State of the Clinic digest email.
 * Called by the /api/intelligence/digest cron route.
 */
export async function sendWeeklyDigest(
  db: Firestore,
  clinicId: string
): Promise<{ sent: boolean; error?: string }> {
  // Check comms consent
  const clinicDoc = await db.doc(`clinics/${clinicId}`).get();
  if (!clinicDoc.exists) return { sent: false, error: "Clinic not found" };

  const clinicData = clinicDoc.data()!;
  const consentGranted = clinicData.commsConsentGrantedAt != null;
  if (!consentGranted) {
    console.warn(`[notify-owner] Skipping digest for clinic ${clinicId}: comms consent not granted`);
    return { sent: false };
  }

  const ownerEmail = clinicData.ownerEmail as string | undefined;
  if (!ownerEmail) return { sent: false, error: "No owner email" };

  const clinicName = (clinicData.name as string) ?? "Your Clinic";

  // Load events from the past 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const eventsSnap = await db
    .collection(`clinics/${clinicId}/insight_events`)
    .where("createdAt", ">=", sevenDaysAgo.toISOString())
    .orderBy("createdAt", "desc")
    .get();

  const events: InsightEvent[] = eventsSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<InsightEvent, "id">),
  }));

  const ranked = rankEvents(events);
  const top3 = ranked.slice(0, 3);

  // Load latest weekly stats for quick stats strip
  const statsSnap = await db
    .collection(`clinics/${clinicId}/metrics_weekly`)
    .where("clinicianId", "==", "all")
    .orderBy("weekStart", "desc")
    .limit(2)
    .get();

  const statsDocs = statsSnap.docs.map((d) => d.data() as Record<string, unknown>);
  const currentStats = statsDocs[0] ?? null;
  const previousStats = statsDocs[1] ?? null;

  // Build email
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.warn("[notify-owner] RESEND_API_KEY not configured, skipping digest");
    return { sent: false };
  }

  const { Resend } = await import("resend");
  const resend = new Resend(resendKey);
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "insights@strydeos.com";

  const now = new Date();
  const weekStart = new Date(now);
  const dayOfWeek = weekStart.getDay();
  weekStart.setDate(weekStart.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1)); // Monday
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6); // Sunday

  const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  try {
    const html = buildStateOfClinicEmail({
      clinicName,
      weekLabel: `${fmt(weekStart)} to ${fmt(weekEnd)}`,
      topEvents: top3,
      currentStats,
      previousStats,
    });

    const text = buildStateOfClinicText({
      clinicName,
      weekLabel: `${fmt(weekStart)} to ${fmt(weekEnd)}`,
      topEvents: top3,
      currentStats,
      previousStats,
    });

    await resend.emails.send({
      from: `StrydeOS Intelligence <${fromEmail}>`,
      to: ownerEmail,
      subject: `Your clinic this week — ${clinicName}`,
      html,
      text,
    });

    return { sent: true };
  } catch (err) {
    return {
      sent: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
