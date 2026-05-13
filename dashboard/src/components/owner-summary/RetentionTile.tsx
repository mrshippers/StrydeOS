"use client";

import { brand } from "@/lib/brand";
import { UserMinus, CheckCircle } from "lucide-react";

interface RetentionAlert {
  id: string;
  name: string;
  daysSinceLastSession: number;
}

interface RetentionTileProps {
  alerts: RetentionAlert[];
  alertCount: number;
  loading: boolean;
}

export default function RetentionTile({ alerts, alertCount, loading }: RetentionTileProps) {
  const visibleAlerts = alerts.slice(0, 3);
  const overflow = alertCount > 3 ? alertCount - 3 : 0;

  return (
    <div
      className="rounded-[var(--radius-card)] p-5 flex flex-col gap-4 border-l-2"
      style={{
        background: "linear-gradient(135deg, #0B2545 0%, #132D5E 100%)",
        borderLeftColor: brand.warning,
      }}
    >
      <div className="flex items-center gap-2">
        <UserMinus size={16} style={{ color: brand.warning }} />
        <span className="text-[11px] font-semibold tracking-widest uppercase text-white/40">
          Retention
        </span>
      </div>

      {loading ? (
        <div className="animate-pulse bg-white/5 rounded-lg h-10 w-32" />
      ) : alertCount === 0 ? (
        <div className="flex items-center gap-2">
          <CheckCircle size={16} style={{ color: brand.success }} />
          <p className="text-[13px]" style={{ color: brand.success }}>
            All patients rebooked
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-[32px] font-bold text-white leading-none tabular-nums">
            {alertCount} at risk
          </p>
          <ul className="flex flex-col gap-1.5">
            {visibleAlerts.map((alert) => (
              <li key={alert.id} className="flex items-center justify-between">
                <span className="text-[13px] text-white/70 truncate">{alert.name}</span>
                <span className="text-[13px] text-white/50 tabular-nums ml-3 shrink-0">
                  {alert.daysSinceLastSession}d
                </span>
              </li>
            ))}
          </ul>
          {overflow > 0 && (
            <p className="text-[12px] text-white/30">+{overflow} more</p>
          )}
        </div>
      )}
    </div>
  );
}
