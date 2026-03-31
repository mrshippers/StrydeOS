/**
 * Sends weekly digest emails to each active clinician in a clinic.
 *
 * Scoping: each clinician only receives their own stats — no cross-contamination.
 * Revenue figures are never included in clinician digests.
 * Benchmarks are labelled "UK avg" — never reference PPB by name.
 */

import type { Firestore } from "firebase-admin/firestore";
import { buildClinicianDigestEmail, buildClinicianDigestText } from "./emails/clinician-digest";
import type { ClinicianDigestData } from "./emails/clinician-digest";

interface DigestResult {
  clinicianId: string;
  clinicianName: string;
  sent: boolean;
  error?: string;
}

export async function sendClinicianDigests(
  db: Firestore,
  clinicId: string
): Promise<{ results: DigestResult[] }> {
  const results: DigestResult[] = [];

  // Check clinic-level flags
  const clinicDoc = await db.doc(`clinics/${clinicId}`).get();
  if (!clinicDoc.exists) return { results: [] };

  const clinicData = clinicDoc.data()!;
  const clinicName = (clinicData.name as string) ?? "Your Clinic";
  const featureFlags = (clinicData.featureFlags as Record<string, boolean>) ?? {};

  // Feature flag gate
  if (featureFlags.clinicianDigest === false) {
    return { results: [] };
  }

  // Check comms consent (same gate as owner digests)
  const consentGranted = clinicData.commsConsentGrantedAt != null;
  if (!consentGranted) return { results: [] };

  // Load targets
  const targets = (clinicData.targets as {
    followUpRate?: number;
    hepRate?: number;
    utilisationRate?: number;
    dnaRate?: number;
  }) ?? {};

  // Load active clinicians
  const cliniciansSnap = await db
    .collection(`clinics/${clinicId}/clinicians`)
    .where("active", "==", true)
    .get();

  if (cliniciansSnap.empty) return { results: [] };

  // Prepare Resend
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.warn("[sendClinicianDigests] RESEND_API_KEY not set — skipping digest emails");
    return { results: [] };
  }

  const { Resend } = await import("resend");
  const resend = new Resend(resendKey);
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "insights@strydeos.com";

  // Week label
  const now = new Date();
  const weekStart = new Date(now);
  const dayOfWeek = weekStart.getDay();
  weekStart.setDate(weekStart.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const weekLabel = `${fmt(weekStart)} \u2013 ${fmt(weekEnd)}`;

  for (const clinicianDoc of cliniciansSnap.docs) {
    const clinician = clinicianDoc.data();
    const clinicianId = clinicianDoc.id;
    const clinicianName = (clinician.name as string) ?? "Clinician";
    const email = clinician.email as string | undefined;
    const digestOptOut = clinician.digestOptOut === true;

    if (!email || digestOptOut) {
      results.push({ clinicianId, clinicianName, sent: false, error: digestOptOut ? "opted_out" : "no_email" });
      continue;
    }

    try {
      // Parallelise all 4 Firestore reads for this clinician
      const [statsSnap, atRiskSnap, insightSnap, positiveSnap] = await Promise.all([
        db.collection(`clinics/${clinicId}/metrics_weekly`)
          .where("clinicianId", "==", clinicianId)
          .orderBy("weekStart", "desc")
          .limit(1)
          .get(),
        db.collection(`clinics/${clinicId}/patients`)
          .where("clinicianId", "==", clinicianId)
          .where("discharged", "==", false)
          .limit(200)
          .get(),
        db.collection(`clinics/${clinicId}/insight_events`)
          .where("clinicianId", "==", clinicianId)
          .orderBy("createdAt", "desc")
          .limit(1)
          .get(),
        db.collection(`clinics/${clinicId}/insight_events`)
          .where("clinicianId", "==", clinicianId)
          .where("severity", "==", "positive")
          .orderBy("createdAt", "desc")
          .limit(1)
          .get(),
      ]);

      if (statsSnap.empty) {
        results.push({ clinicianId, clinicianName, sent: false, error: "no_stats" });
        continue;
      }

      const statsData = statsSnap.docs[0].data();

      const patientsNeedingAction = atRiskSnap.docs.filter((d) => {
        const p = d.data();
        const state = p.lifecycleState as string | undefined;
        return (state === "AT_RISK" || state === "LAPSED") && !p.nextSessionDate;
      }).length;

      const latestInsight = insightSnap.empty ? null : insightSnap.docs[0].data();

      let focusNote: string | null = null;
      if (latestInsight?.observationalNote) {
        focusNote = latestInsight.observationalNote as string;
      } else if (latestInsight?.clinicianNarrative) {
        focusNote = latestInsight.clinicianNarrative as string;
      }

      let winNote: string | null = null;
      if (!positiveSnap.empty) {
        const pe = positiveSnap.docs[0].data();
        winNote = (pe.clinicianNarrative as string) ?? (pe.title as string) ?? null;
      }

      const firstName = clinicianName.split(" ")[0];

      const digestData: ClinicianDigestData = {
        firstName,
        clinicName,
        weekLabel,
        stats: {
          followUpRate: (statsData.followUpRate as number) ?? 0,
          hepRate: (statsData.hepRate as number) ?? 0,
          utilisationRate: (statsData.utilisationRate as number) ?? 0,
          dnaRate: (statsData.dnaRate as number) ?? 0,
        },
        targets: {
          followUpRate: targets.followUpRate ?? 4.0,
          hepRate: targets.hepRate ?? 0.85,
          utilisationRate: targets.utilisationRate ?? 0.75,
          dnaRate: targets.dnaRate ?? 0.06,
        },
        patientsNeedingAction,
        focusNote,
        winNote,
      };

      const html = buildClinicianDigestEmail(digestData);
      const text = buildClinicianDigestText(digestData);

      await resend.emails.send({
        from: `StrydeOS <${fromEmail}>`,
        to: email,
        subject: `Your week at ${clinicName} \u2014 ${weekLabel}`,
        html,
        text,
      });

      results.push({ clinicianId, clinicianName, sent: true });
    } catch (err) {
      results.push({
        clinicianId,
        clinicianName,
        sent: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { results };
}
