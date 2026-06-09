"use client";

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from "recharts";
import { PoundSterling } from "lucide-react";
import { brand } from "@/lib/brand";
import { usePayerBreakdown } from "@/hooks/usePayerBreakdown";

interface Props {
  clinicianId?: string;
}

function PayerTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; payload: { pct: number; color: string } }>;
}) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  return (
    <div className="bg-cream border border-border rounded-xl p-3 shadow-[var(--shadow-elevated)]">
      <div className="flex items-center gap-2 text-xs">
        <div className="w-2 h-2 rounded-full" style={{ background: entry.payload.color }} />
        <span className="font-semibold text-navy">{entry.name}</span>
      </div>
      <p className="text-xs text-muted mt-0.5">
        {entry.value} appts &middot; {entry.payload.pct}%
      </p>
    </div>
  );
}

export default function PayerBreakdownChart({ clinicianId = "all" }: Props) {
  const { slices, total, loading, error } = usePayerBreakdown(clinicianId);

  if (loading) {
    return (
      <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-6 animate-pulse">
        <div className="h-5 w-40 bg-cloud-dark rounded mb-2" />
        <div className="h-3 w-60 bg-cloud-dark rounded mb-6" />
        <div className="h-48 bg-cloud-dark rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-6">
        <p className="text-sm text-danger">{error}</p>
      </div>
    );
  }

  if (slices.length === 0) {
    return (
      <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-6">
        <h3 className="font-display text-lg text-navy mb-1">Payer Breakdown</h3>
        <p className="text-xs text-muted mb-4">Insurance pathway split across the last 90 days</p>
        <div className="flex items-center gap-3 p-4 rounded-xl bg-cloud-light border border-border text-sm text-muted">
          <PoundSterling size={16} className="shrink-0 text-purple" />
          <span>Payer data will appear once the insuranceRoute function has processed appointments.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-6">
      <h3 className="font-display text-lg text-navy mb-1">Payer Breakdown</h3>
      <p className="text-xs text-muted mb-5">
        Insurance pathway split across the last 90 days &middot; {total} routed appointments
      </p>

      <div className="flex flex-col md:flex-row md:items-center gap-6">
        {/* Donut */}
        <div className="shrink-0 w-full md:w-48 h-48">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={slices}
                dataKey="count"
                nameKey="label"
                cx="50%"
                cy="50%"
                innerRadius="60%"
                outerRadius="80%"
                paddingAngle={2}
                strokeWidth={0}
              >
                {slices.map((slice) => (
                  <Cell key={slice.pathway} fill={slice.color} />
                ))}
              </Pie>
              <Tooltip content={<PayerTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Legend + bars */}
        <div className="flex-1 space-y-3 min-w-0">
          {slices.map((slice) => (
            <div key={slice.pathway}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: slice.color }} />
                  <span className="text-sm font-medium text-navy">{slice.label}</span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-muted">{slice.count} appts</span>
                  <span className="font-bold text-navy w-8 text-right">{slice.pct}%</span>
                </div>
              </div>
              <div className="h-1.5 bg-cloud-dark rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${slice.pct}%`, background: slice.color }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
