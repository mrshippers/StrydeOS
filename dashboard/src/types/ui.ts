export type AlertSeverity = "warn" | "danger";
export type MetricStatus = "ok" | "warn" | "danger" | "neutral";
export type TrendDirection = "up" | "down" | "flat" | "warn";

export interface StatCardAction {
  label: string;
  href?: string;
  onClick?: () => void;
}

export interface StatCardProps {
  label: string;
  value: string | number;
  unit?: string;
  target?: number;
  benchmark?: string;
  trend?: TrendDirection;
  trendPercent?: number;
  status: MetricStatus;
  insight?: string;
  color?: string;
  progress?: number;
  onClick?: () => void;
  action?: StatCardAction;
  sparklineData?: number[];
}

export interface AlertFlagProps {
  metric: string;
  current: number;
  target: number;
  severity: AlertSeverity;
}

export interface TrendLine {
  key: string;
  color: string;
  label: string;
}
