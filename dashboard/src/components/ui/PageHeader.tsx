"use client";

import { ChevronDown } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import type { Clinician } from "@/types";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  clinicians?: Clinician[];
  selectedClinician?: string;
  onClinicianChange?: (id: string) => void;
}

export default function PageHeader({
  title,
  subtitle,
  clinicians,
  selectedClinician,
  onClinicianChange,
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
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
      <div>
        <h1 className="font-display text-[32px] text-navy leading-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm text-muted mt-1">{subtitle}</p>
        )}
      </div>

      {clinicians && onClinicianChange && (
        <div ref={ref} className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-cloud-dark/60 border border-border text-sm font-medium text-navy hover:bg-cloud-dark transition-colors"
          >
            {selectedLabel}
            <ChevronDown size={14} className="text-muted" />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-border rounded-xl shadow-[var(--shadow-elevated)] py-1 z-50 animate-fade-in">
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
