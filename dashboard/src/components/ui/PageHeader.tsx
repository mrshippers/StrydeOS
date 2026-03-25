"use client";

import { ChevronDown } from "lucide-react";
import { useState, useRef, useEffect, memo } from "react";
import type { Clinician } from "@/types";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  clinicians?: Clinician[];
  selectedClinician?: string;
  onClinicianChange?: (id: string) => void;
  accentColor?: string;
}

// Re-renders when props change. onClinicianChange should be useCallback-stable in parent.
function PageHeader({
  title,
  subtitle,
  clinicians,
  selectedClinician,
  onClinicianChange,
  accentColor,
}: PageHeaderProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedLabel =
    selectedClinician === "all"
      ? "All Clinicians"
      : clinicians?.find((c) => c.id === selectedClinician)?.name ?? "All Clinicians";

  return (
    <div
      className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6"
      style={accentColor ? { borderTop: `3px solid ${accentColor}`, paddingTop: 16 } : undefined}
    >
      <div>
        <div className="flex items-center gap-2.5">
          {accentColor && (
            <span
              className="relative flex h-2.5 w-2.5"
            >
              <span
                className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-50"
                style={{ backgroundColor: accentColor }}
              />
              <span
                className="relative inline-flex rounded-full h-2.5 w-2.5"
                style={{ backgroundColor: accentColor, boxShadow: `0 0 8px ${accentColor}80` }}
              />
            </span>
          )}
          <h1 className="font-display text-[32px] text-navy dark:text-white leading-tight">
            {title}
          </h1>
        </div>
        {subtitle && (
          <p className="text-[14px] text-navy/70 dark:text-white/60 mt-1 leading-relaxed font-medium">{subtitle}</p>
        )}
      </div>

      {clinicians && onClinicianChange && (
        <div ref={ref} className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-cloud-dark/60 border border-border text-[14px] font-medium text-navy hover:bg-cloud-dark transition-all duration-200 ease-out"
          >
            {selectedLabel}
            <ChevronDown size={14} className="text-muted" />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-cream border border-border rounded-xl shadow-[var(--shadow-elevated)] py-1 z-50 animate-fade-in">
              <button
                onClick={() => {
                  onClinicianChange("all");
                  setDropdownOpen(false);
                }}
                className={`w-full text-left px-4 py-2 text-sm hover:bg-cloud-light transition-colors ${
                  selectedClinician === "all" ? "font-semibold text-blue" : "text-ink"
                }`}
              >
                All Clinicians
              </button>
              {clinicians.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    onClinicianChange(c.id);
                    setDropdownOpen(false);
                  }}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-cloud-light transition-colors ${
                    selectedClinician === c.id ? "font-semibold text-blue" : "text-ink"
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default memo(PageHeader);
