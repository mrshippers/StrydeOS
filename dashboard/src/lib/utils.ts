import type { MetricStatus, WeeklyStats } from "@/types";

export function formatWeekDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function formatFullDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function formatRate(value: number): string {
  return value.toFixed(1);
}

export function formatPence(pence: number): string {
  return `£${(pence / 100).toFixed(0)}`;
}

export function getFollowUpStatus(
  rate: number,
  target: number
): MetricStatus {
  if (rate >= target) return "ok";
  const threshold = target * 0.9;
  if (rate >= threshold) return "warn";
  return "danger";
}

export function getPhysitrackStatus(rate: number): MetricStatus {
  if (rate >= 0.95) return "ok";
  if (rate >= 0.85) return "warn";
  return "danger";
}

export function getDnaStatus(rate: number): MetricStatus {
  if (rate <= 0.05) return "ok";
  if (rate <= 0.12) return "warn";
  return "danger";
}

export function getGenericStatus(
  rate: number,
  target: number
): MetricStatus {
  if (rate >= target) return "ok";
  const threshold = target * 0.9;
  if (rate >= threshold) return "warn";
  return "danger";
}

export function statusColor(status: MetricStatus): string {
  switch (status) {
    case "ok":
      return "var(--color-success)";
    case "warn":
      return "var(--color-warn)";
    case "danger":
      return "var(--color-danger)";
    default:
      return "var(--color-muted)";
  }
}

export function statusBgClass(status: MetricStatus): string {
  switch (status) {
    case "ok":
      return "bg-success/10 text-success";
    case "warn":
      return "bg-warn/10 text-warn";
    case "danger":
      return "bg-danger/10 text-danger";
    default:
      return "bg-muted/10 text-muted";
  }
}

export function getFollowUpInsight(
  current: number,
  target: number,
  previous?: number
): string {
  if (current >= target) {
    return "On target — strong patient engagement this week";
  }
  if (previous !== undefined && current > previous) {
    const pctImproved = Math.round(
      ((current - previous) / previous) * 100
    );
    return `Improving (+${pctImproved}%) — closing gap to ${target.toFixed(1)} target`;
  }
  return "Below target — review rebooking workflow";
}

export function computeAlerts(stats: WeeklyStats): {
  metric: string;
  current: number;
  target: number;
  severity: "warn" | "danger";
}[] {
  const alerts: {
    metric: string;
    current: number;
    target: number;
    severity: "warn" | "danger";
  }[] = [];

  const fuStatus = getFollowUpStatus(stats.followUpRate, stats.followUpTarget);
  if (fuStatus !== "ok") {
    alerts.push({
      metric: "Follow-up rate",
      current: stats.followUpRate,
      target: stats.followUpTarget,
      severity: fuStatus as "warn" | "danger",
    });
  }

  const ptStatus = getPhysitrackStatus(stats.physitrackRate);
  if (ptStatus !== "ok") {
    alerts.push({
      metric: "HEP compliance",
      current: stats.physitrackRate,
      target: stats.physitrackTarget,
      severity: ptStatus as "warn" | "danger",
    });
  }

  const dnaStatus = getDnaStatus(stats.dnaRate);
  if (dnaStatus !== "ok") {
    alerts.push({
      metric: "DNA rate",
      current: stats.dnaRate,
      target: 0.05,
      severity: dnaStatus as "warn" | "danger",
    });
  }

  return alerts;
}

export function daysSince(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00");
  const now = new Date();
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}
