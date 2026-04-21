"use client";

import { useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { usePatients } from "@/hooks/usePatients";
import { useWeeklyStats } from "@/hooks/useWeeklyStats";
import type { Patient, WeeklyStats } from "@/types";

export type NudgeType =
  | "patients_not_rebooked"
  | "hep_not_assigned"
  | "dna_follow_up"
  | "follow_up_slipping"
  | "positive_trend";

export interface FocusNudge {
  type: NudgeType;
  title: string;
  description: string;
  /** Patient IDs relevant to this nudge (for action buttons). */
  patientIds?: string[];
  /** Link to navigate to when action is tapped. */
  actionHref?: string;
  actionLabel?: string;
  severity: "action" | "info" | "win";
}

/**
 * Derives up to 3 actionable nudges for a clinician based on their own data.
 * All patient/appointment data is already scoped to the clinician's caseload
 * via usePatients and useWeeklyStats.
 */
export function useTodaysFocus(): {
  nudges: FocusNudge[];
  loading: boolean;
  enabled: boolean;
} {
  const { user } = useAuth();
  const isClinician = user?.role === "clinician" && !!user?.clinicianId;
  const enabled =
    isClinician &&
    user?.clinicProfile?.featureFlags?.clinicianNudges !== false;

  const clinicianId = user?.clinicianId ?? "all";
  const { patients, loading: patientsLoading } = usePatients(clinicianId);
  const { stats, loading: statsLoading } = useWeeklyStats(clinicianId);

  const loading = patientsLoading || statsLoading;

  const nudges = useMemo(() => {
    if (!enabled || loading) return [];

    const result: FocusNudge[] = [];
    const latest = stats.length > 0 ? stats[stats.length - 1] : null;
    const previous = stats.length > 1 ? stats[stats.length - 2] : null;

    // 1. Patients who haven't rebooked (AT_RISK or LAPSED, no next session)
    const notRebooked = patients.filter(
      (p) =>
        !p.discharged &&
        (p.lifecycleState === "AT_RISK" || p.lifecycleState === "LAPSED") &&
        !p.nextSessionDate
    );
    if (notRebooked.length > 0) {
      result.push({
        type: "patients_not_rebooked",
        title: `${notRebooked.length} patient${notRebooked.length === 1 ? "" : "s"} haven't rebooked`,
        description:
          notRebooked.length === 1
            ? `${notRebooked[0].name} has no follow-up booked`
            : `${notRebooked.slice(0, 2).map((p) => p.name).join(", ")}${notRebooked.length > 2 ? ` and ${notRebooked.length - 2} more` : ""} need follow-up`,
        patientIds: notRebooked.map((p) => p.id),
        actionHref: "/continuity",
        actionLabel: "View patients",
        severity: "action",
      });
    }

    // 2. HEP not assigned — patients seen recently without programme
    const noHep = patients.filter(
      (p) =>
        !p.discharged &&
        p.sessionCount > 0 &&
        !p.hepProgramId &&
        p.lifecycleState !== "CHURNED"
    );
    if (noHep.length > 0 && latest && latest.hepRate < (latest.hepTarget ?? 0.85)) {
      result.push({
        type: "hep_not_assigned",
        title: `${noHep.length} patient${noHep.length === 1 ? "" : "s"} without a HEP programme`,
        description: "Patients with exercise programmes have better outcomes and higher rebooking rates",
        patientIds: noHep.slice(0, 5).map((p) => p.id),
        actionHref: noHep.length === 1 ? `/patients/${noHep[0].id}` : "/continuity",
        actionLabel: noHep.length === 1 ? "View patient" : "Review caseload",
        severity: "action",
      });
    }

    // 3. Follow-up rate slipping (>=10% week-on-week drop)
    if (
      latest &&
      previous &&
      previous.followUpRate > 0 &&
      (previous.followUpRate - latest.followUpRate) / previous.followUpRate >= 0.1
    ) {
      result.push({
        type: "follow_up_slipping",
        title: "Follow-up rate dipped this week",
        description: `${latest.followUpRate.toFixed(1)} vs ${previous.followUpRate.toFixed(1)} last week — check if patients are being offered follow-ups`,
        actionHref: "/intelligence",
        actionLabel: "View trend",
        severity: "info",
      });
    }

    // 4. DNA follow-up — patients with recent DNA and no subsequent booking
    const dnaNoRebook = patients.filter((p) => {
      if (p.discharged) return false;
      const lastSession = p.lastSessionDate ? new Date(p.lastSessionDate) : null;
      if (!lastSession) return false;
      const daysSince = (Date.now() - lastSession.getTime()) / (1000 * 60 * 60 * 24);
      // AT_RISK patients who were seen recently but have no next booking
      return (
        daysSince <= 14 &&
        daysSince >= 3 &&
        !p.nextSessionDate &&
        p.lifecycleState === "AT_RISK"
      );
    });
    // Only add if not already covered by notRebooked nudge
    if (dnaNoRebook.length > 0 && result.length < 3 && notRebooked.length === 0) {
      result.push({
        type: "dna_follow_up",
        title: `${dnaNoRebook.length} patient${dnaNoRebook.length === 1 ? "" : "s"} may need a follow-up after missed session`,
        description: "Reaching out after a missed appointment can recover the treatment",
        patientIds: dnaNoRebook.map((p) => p.id),
        actionHref: "/continuity",
        actionLabel: "Review",
        severity: "action",
      });
    }

    // 5. Positive reinforcement — show a win if nothing negative
    if (result.length === 0 && latest && previous) {
      const improvements: string[] = [];
      if (latest.followUpRate > previous.followUpRate) improvements.push("follow-up rate");
      if (latest.hepRate > previous.hepRate) improvements.push("HEP compliance");
      if (latest.utilisationRate > previous.utilisationRate) improvements.push("utilisation");
      if (latest.dnaRate < previous.dnaRate) improvements.push("DNA rate");

      if (improvements.length > 0) {
        result.push({
          type: "positive_trend",
          title: "Improving this week",
          description: `Your ${improvements.slice(0, 2).join(" and ")} moved in the right direction`,
          severity: "win",
        });
      }
    }

    // Max 3 nudges
    return result.slice(0, 3);
  }, [enabled, loading, patients, stats]);

  return { nudges, loading, enabled };
}
