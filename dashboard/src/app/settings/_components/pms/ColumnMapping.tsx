"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/ui/Toast";
import { Loader2, Upload, X } from "lucide-react";
import type { CanonicalField } from "@/lib/csv-import/types";

const CANONICAL_FIELD_OPTIONS: { value: string; label: string; required?: boolean }[] = [
  { value: "ignore", label: "Ignore" },
  { value: "date", label: "Date *", required: true },
  { value: "time", label: "Time" },
  { value: "endDate", label: "End Date" },
  { value: "endTime", label: "End Time" },
  { value: "patientId", label: "Patient ID" },
  { value: "patientFirst", label: "First Name" },
  { value: "patientLast", label: "Last Name" },
  { value: "patientEmail", label: "Email" },
  { value: "patientPhone", label: "Phone" },
  { value: "patientDob", label: "Date of Birth" },
  { value: "practitioner", label: "Practitioner *", required: true },
  { value: "practitionerId", label: "Practitioner ID" },
  { value: "type", label: "Appointment Type" },
  { value: "status", label: "Status *", required: true },
  { value: "notes", label: "Notes" },
  { value: "price", label: "Price" },
  { value: "duration", label: "Duration" },
];

const REQUIRED_APPT_FIELDS: CanonicalField[] = ["date", "practitioner", "status"];

interface ColumnMappingProps {
  mappingHeaders: string[];
  mappingSampleRows: Record<string, string>[];
  mappingFile: File;
  mappingFileType: "appointments" | "patients";
  onCancel: () => void;
  onImport: (file: File, fileType: "appointments" | "patients", schemaId: string) => Promise<void> | void;
}

export default function ColumnMapping({
  mappingHeaders,
  mappingSampleRows,
  mappingFile,
  mappingFileType,
  onCancel,
  onImport,
}: ColumnMappingProps) {
  const { firebaseUser } = useAuth();
  const { toast } = useToast();
  const [mappingValues, setMappingValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const h of mappingHeaders) initial[h] = "ignore";
    return initial;
  });
  const [mappingSaving, setMappingSaving] = useState(false);
  const [mappingSchemaName, setMappingSchemaName] = useState("");

  async function handleSaveMapping() {
    if (!firebaseUser) return;

    const fieldMap: Record<string, string> = {};
    for (const [header, value] of Object.entries(mappingValues)) {
      if (value !== "ignore") fieldMap[header] = value;
    }

    const mapped = new Set(Object.values(fieldMap));
    const missingRequired = REQUIRED_APPT_FIELDS.filter((f) => !mapped.has(f));
    if (mappingFileType === "appointments" && missingRequired.length > 0) {
      toast(`Required fields not mapped: ${missingRequired.join(", ")}`, "error");
      return;
    }

    setMappingSaving(true);
    try {
      const token = await firebaseUser.getIdToken();

      const schemaRes = await fetch(`/api/pms/csv-schema`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: mappingSchemaName.trim() || undefined,
          fileType: mappingFileType,
          fieldMap,
        }),
      });
      const schemaData = await schemaRes.json().catch(() => ({}));
      if (!schemaRes.ok) throw new Error(schemaData?.error ?? "Failed to save mapping");

      await onImport(mappingFile, mappingFileType, schemaData.schemaId);
      onCancel();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save mapping";
      toast(msg, "error");
    } finally {
      setMappingSaving(false);
    }
  }

  return (
    <div className="animate-fade-in">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-navy">Map your CSV columns</p>
          <p className="text-[11px] text-muted mt-0.5">
            We couldn&apos;t auto-detect the format. Map each column to a StrydeOS field. Fields marked * are required for appointments.
          </p>
        </div>
      </div>

      <div className="mb-3">
        <label className="block text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">
          Mapping name (optional)
        </label>
        <input
          type="text"
          value={mappingSchemaName}
          onChange={(e) => setMappingSchemaName(e.target.value)}
          placeholder="e.g. My PMS Export"
          className="w-full max-w-xs px-3 py-2 rounded-lg border border-border bg-cloud-light text-sm text-navy focus:outline-none focus:border-blue focus:ring-1 focus:ring-blue/20 transition-colors"
        />
      </div>

      {/* Preview table */}
      <div className="overflow-x-auto rounded-xl border border-border mb-4">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-border bg-cloud-light">
              {mappingHeaders.map((h) => (
                <th key={h} className="px-3 py-2 text-left font-semibold text-navy whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {mappingSampleRows.slice(0, 3).map((row, i) => (
              <tr key={i} className="border-b border-border/50">
                {mappingHeaders.map((h) => (
                  <td key={h} className="px-3 py-1.5 text-muted whitespace-nowrap max-w-[200px] truncate">
                    {row[h] || "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Dropdowns */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
        {mappingHeaders.map((h) => (
          <div key={h}>
            <label className="block text-[11px] font-medium text-muted mb-1 truncate" title={h}>
              {h}
            </label>
            <select
              value={mappingValues[h] ?? "ignore"}
              onChange={(e) => setMappingValues((prev) => ({ ...prev, [h]: e.target.value }))}
              className="w-full px-2 py-1.5 rounded-lg border border-border bg-white text-sm text-navy focus:outline-none focus:border-blue focus:ring-1 focus:ring-blue/20 transition-colors"
            >
              {CANONICAL_FIELD_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSaveMapping}
          disabled={mappingSaving}
          className="btn-primary"
        >
          {mappingSaving ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          {mappingSaving ? "Saving..." : "Save mapping & import"}
        </button>
        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-semibold text-muted hover:text-navy transition-colors"
        >
          <X size={14} />
          Cancel
        </button>
      </div>
    </div>
  );
}
