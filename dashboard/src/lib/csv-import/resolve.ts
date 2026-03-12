import type { AppointmentStatus } from "@/types";
import type { CanonicalField, DateFormat } from "./types";

/**
 * Resolve a canonical field from a CSV row using the schema's fieldMap.
 * Iterates all fieldMap keys that map to the target canonical field,
 * returns the first non-empty value found in the row.
 */
export function resolveField(
  row: Record<string, string>,
  fieldMap: Record<string, CanonicalField>,
  target: CanonicalField
): string {
  for (const [sourceCol, canonical] of Object.entries(fieldMap)) {
    if (canonical !== target) continue;
    const value = row[sourceCol];
    if (value !== undefined && value !== "") return value;
  }
  return "";
}

/**
 * Build an ISO datetime string from date + time parts, respecting the schema's date format.
 *
 * - "uk"  → DD/MM/YYYY or DD-MM-YYYY (original behaviour)
 * - "us"  → MM/DD/YYYY or MM-DD-YYYY
 * - "iso" → YYYY-MM-DD (passthrough, also handles ISO 8601 datetimes like 2024-01-15T09:00:00Z)
 */
export function buildDateTimeWithFormat(
  dateStr: string,
  timeStr: string,
  dateFormat: DateFormat
): string {
  if (!dateStr) return new Date().toISOString();

  let normalised = dateStr.trim();

  if (dateFormat === "iso") {
    // Cliniko-style ISO datetimes may already include the time component
    if (/^\d{4}-\d{2}-\d{2}T/.test(normalised)) {
      const dt = new Date(normalised);
      return isNaN(dt.getTime()) ? new Date().toISOString() : dt.toISOString();
    }
    // Plain YYYY-MM-DD — pass through
  } else if (dateFormat === "uk") {
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(normalised)) {
      const [d, m, y] = normalised.split("/");
      normalised = `${y}-${m}-${d}`;
    } else if (/^\d{2}-\d{2}-\d{4}$/.test(normalised)) {
      const [d, m, y] = normalised.split("-");
      normalised = `${y}-${m}-${d}`;
    }
  } else if (dateFormat === "us") {
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(normalised)) {
      const [m, d, y] = normalised.split("/");
      normalised = `${y}-${m}-${d}`;
    } else if (/^\d{2}-\d{2}-\d{4}$/.test(normalised)) {
      const [m, d, y] = normalised.split("-");
      normalised = `${y}-${m}-${d}`;
    }
  }

  const combined = timeStr
    ? `${normalised}T${timeStr.trim()}`
    : `${normalised}T09:00:00`;
  const dt = new Date(combined);
  return isNaN(dt.getTime()) ? new Date().toISOString() : dt.toISOString();
}

/**
 * Resolve a raw status string to an AppointmentStatus using the schema's statusMap.
 * Lookup is case-insensitive and trimmed. Falls back to "scheduled".
 */
export function resolveStatus(
  raw: string,
  statusMap: Record<string, AppointmentStatus>
): AppointmentStatus {
  if (!raw) return "scheduled";
  const key = raw.toLowerCase().trim();
  return statusMap[key] ?? "scheduled";
}

/**
 * Test whether a date string is parseable under the given format.
 * Used by the validation layer to count date parse failures.
 */
export function isDateParseable(dateStr: string, dateFormat: DateFormat): boolean {
  if (!dateStr || !dateStr.trim()) return false;

  const trimmed = dateStr.trim();

  if (dateFormat === "iso") {
    if (/^\d{4}-\d{2}-\d{2}(T.+)?$/.test(trimmed)) {
      return !isNaN(new Date(trimmed).getTime());
    }
    return false;
  }

  if (dateFormat === "uk") {
    if (/^\d{2}[/\-]\d{2}[/\-]\d{4}$/.test(trimmed)) {
      const sep = trimmed.includes("/") ? "/" : "-";
      const [d, m, y] = trimmed.split(sep);
      return !isNaN(new Date(`${y}-${m}-${d}`).getTime());
    }
    return false;
  }

  if (dateFormat === "us") {
    if (/^\d{2}[/\-]\d{2}[/\-]\d{4}$/.test(trimmed)) {
      const sep = trimmed.includes("/") ? "/" : "-";
      const [m, d, y] = trimmed.split(sep);
      return !isNaN(new Date(`${y}-${m}-${d}`).getTime());
    }
    return false;
  }

  return false;
}
