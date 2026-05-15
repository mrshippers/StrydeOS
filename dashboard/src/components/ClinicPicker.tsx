"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Building2 } from "lucide-react";
import { brand } from "@/lib/brand";
import { useAuth } from "@/hooks/useAuth";

/**
 * Clinic switcher dropdown — shown only for multi-site owners.
 * Renders in the AppShell header between the logo and main content.
 */
export default function ClinicPicker() {
  const { user, switchClinic } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (!user?.isMultiSite) return null;

  const activeName = user.clinicProfile?.name ?? "Select clinic";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors"
        style={{
          borderColor: open ? brand.blue : brand.border,
          background: open ? `${brand.blue}08` : "transparent",
        }}
      >
        <Building2 size={14} style={{ color: brand.muted }} />
        <span className="text-[13px] font-medium text-navy max-w-[160px] truncate">
          {activeName}
        </span>
        <ChevronDown
          size={12}
          style={{
            color: brand.muted,
            transform: open ? "rotate(180deg)" : "rotate(0)",
            transition: "transform 0.2s",
          }}
        />
      </button>

      {open && (
        <div
          className="absolute top-full left-0 mt-1 w-56 rounded-xl border bg-white dark:bg-navy-mid shadow-lg z-50 py-1 overflow-hidden"
          style={{ borderColor: brand.border }}
        >
          <div className="px-3 py-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: brand.muted }}>
              Your clinics
            </span>
          </div>
          {user.allowedClinics.map((clinic) => {
            const isActive = clinic.id === user.activeClinicId;
            return (
              <button
                key={clinic.id}
                onClick={async () => {
                  if (!isActive) await switchClinic(clinic.id);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 flex items-center gap-2 transition-colors"
                style={{
                  background: isActive ? `${brand.blue}08` : "transparent",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = `${brand.cloud}`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = isActive ? `${brand.blue}08` : "transparent";
                }}
              >
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{
                    background: isActive ? brand.blue : "transparent",
                    border: isActive ? "none" : `1.5px solid ${brand.border}`,
                  }}
                />
                <span
                  className="text-[13px] truncate"
                  style={{
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? brand.navy : brand.muted,
                  }}
                >
                  {clinic.name}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
