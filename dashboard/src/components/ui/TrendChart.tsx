"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import type { WeeklyStats, TrendLine } from "@/types";
import { formatWeekDate } from "@/lib/utils";

interface TrendChartProps {
  data: WeeklyStats[];
  lines: TrendLine[];
  height?: number;
  compact?: boolean;
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="bg-cream border border-border rounded-xl p-3 shadow-[var(--shadow-elevated)]">
      <p className="font-display text-sm text-navy mb-2">
        {label}
      </p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2 text-xs mb-1">
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-muted font-medium">{entry.name}:</span>
          <span className="text-navy font-semibold">
            {typeof entry.value === "number" && entry.value < 1
              ? `${Math.round(entry.value * 100)}%`
              : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function TrendChart({
  data,
  lines,
  height = 320,
  compact = false,
}: TrendChartProps) {
  const chartData = data.map((d) => ({
    ...d,
    weekLabel: formatWeekDate(d.weekStart),
  }));

  const hasPercentageLines = lines.some(
    (l) =>
      l.key === "hepRate" ||
      l.key === "utilisationRate" ||
      l.key === "dnaRate" ||
      l.key === "treatmentCompletionRate"
  );
  const hasRateLines = lines.some((l) => l.key === "followUpRate");

  if (compact) {
    return (
      <ResponsiveContainer width="100%" height={height || 100}>
        <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E2DFDA" vertical={false} opacity={0.5} />
          {hasRateLines && (
            <YAxis yAxisId="rate" hide domain={[0, 5]} />
          )}
          {hasPercentageLines && (
            <YAxis yAxisId="pct" hide domain={[0, 1]} />
          )}
          <Tooltip content={<CustomTooltip />} />
          {lines.map((line) => {
            const yAxisId = line.key === "followUpRate" ? "rate" : "pct";
            return (
              <Line
                key={line.key}
                yAxisId={yAxisId}
                type="monotone"
                dataKey={line.key}
                name={line.label}
                stroke={line.color}
                strokeWidth={2}
                dot={{ r: 0 }}
                activeDot={{ r: 3 }}
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  return (
    <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-6">
      <h3 className="font-display text-lg text-navy mb-1">90-Day Rolling Trend</h3>
      <p className="text-xs text-muted mb-4">
        Rolling performance across selected metrics
      </p>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="4 4" stroke="#E2DFDA" vertical={false} />
          <XAxis
            dataKey="weekLabel"
            tick={{ fontSize: 11, fill: "#6B7280" }}
            tickLine={false}
            axisLine={{ stroke: "#E2DFDA" }}
          />
          {hasRateLines && (
            <YAxis
              yAxisId="rate"
              orientation="left"
              domain={[0, 5]}
              tick={{ fontSize: 11, fill: "#6B7280" }}
              tickLine={false}
              axisLine={false}
              width={35}
            />
          )}
          {hasPercentageLines && (
            <YAxis
              yAxisId="percent"
              orientation={hasRateLines ? "right" : "left"}
              domain={[0, 1]}
              tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
              tick={{ fontSize: 11, fill: "#6B7280" }}
              tickLine={false}
              axisLine={false}
              width={45}
            />
          )}
          <Tooltip content={<CustomTooltip />} />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
          />
          {lines.map((line) => {
            const isPercent =
              line.key === "hepRate" ||
              line.key === "utilisationRate" ||
              line.key === "dnaRate" ||
              line.key === "treatmentCompletionRate";
            return (
              <Line
                key={line.key}
                type="monotone"
                dataKey={line.key}
                name={line.label}
                stroke={line.color}
                yAxisId={isPercent ? "percent" : "rate"}
                strokeWidth={2.5}
                dot={{ r: 3.5, fill: line.color, strokeWidth: 0 }}
                activeDot={{ r: 5, fill: line.color, strokeWidth: 2, stroke: "#fff" }}
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
