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
  return `£${Math.round(pence / 100).toLocaleString("en-GB")}`;
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

export function getHepStatus(rate: number): MetricStatus {
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

  const ptStatus = getHepStatus(stats.hepRate);
  if (ptStatus !== "ok") {
    alerts.push({
      metric: "HEP compliance",
      current: stats.hepRate,
      target: stats.hepTarget,
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

export function daysSince(dateStr: string | null | undefined): number {
  if (!dateStr) return NaN;
  // Date-only strings ("YYYY-MM-DD") anchor to local midnight; full timestamps
  // parse as-is. Invalid/missing input yields NaN — callers MUST guard before
  // rendering (use formatDaysAgo or Number.isFinite) so no card shows "NaN".
  const iso = dateStr.length <= 10 ? `${dateStr}T00:00:00` : dateStr;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? NaN : Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24));
}

/** "Xd ago" when the date is valid; `fallback` (default "") when missing/invalid. Never renders NaN. */
export function formatDaysAgo(dateStr: string | null | undefined, fallback = ""): string {
  const n = daysSince(dateStr);
  return Number.isFinite(n) ? `${n}d ago` : fallback;
}

/**
 * Strip em/en dashes and double-hyphens used as sentence dashes from prose
 * output, replacing them with a comma so running text still reads naturally.
 * Brand rule: no em dashes or double hyphens in any shipped copy. Single
 * hyphens in compounds ("check-in", "mid-programme") are left untouched.
 */
const PROSE_DASH_RE = /\s*(?:--|[–—])\s*/g;
export function stripDashes(text: string): string {
  return text
    .replace(PROSE_DASH_RE, ", ")
    .replace(/,\s*,/g, ",")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}
