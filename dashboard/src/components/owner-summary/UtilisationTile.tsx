"use client";

import { brand } from "@/lib/brand";
import { BarChart2 } from "lucide-react";

interface ClinicianUtilisationRow {
  clinicianId: string;
  name: string;
  utilisationRate: number;
}

interface UtilisationTileProps {
  rows: ClinicianUtilisationRow[];
  loading: boolean;
}

export default function UtilisationTile({ rows, loading }: UtilisationTileProps) {
  const visibleRows = rows.slice(0, 4);

  return (
    <div
      className="rounded-[var(--radius-card)] p-5 flex flex-col gap-4 border-l-2"
      style={{
        background: "linear-gradient(135deg, #0B2545 0%, #132D5E 100%)",
        borderLeftColor: brand.blue,
      }}
    >
      <div className="flex items-center gap-2">
        <BarChart2 size={16} style={{ color: brand.blue }} />
        <span className="text-[11px] font-semibold tracking-widest uppercase text-white/40">
          Utilisation
        </span>
      </div>

      {loading ? (
        <div className="animate-pulse bg-white/5 rounded-lg h-10 w-32" />
      ) : visibleRows.length === 0 ? (
        <p className="text-[13px] text-white/50">No clinician data yet</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {visibleRows.map((row) => {
            const pct = Math.round(row.utilisationRate * 100);
            return (
              <li key={row.clinicianId} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-white/70 truncate">{row.name}</span>
                  <span className="text-[13px] text-white/70 tabular-nums ml-3 shrink-0">
                    {pct}%
                  </span>
                </div>
                <div className="h-[2px] w-full bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${pct}%`,
                      background: brand.blue,
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
