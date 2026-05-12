"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  RefreshCw,
} from "lucide-react";
import type { FailureSnapshot } from "@/lib/csv-import/failure-snapshot";
import CSVFailurePreview from "@/components/settings/CSVFailurePreview";

export interface ImportHistoryRecord {
  id: string;
  fileName: string;
  fileType: string;
  schemaId: string;
  provider: string;
  rowsWritten: number;
  rowsSkipped: number;
  importedAt: string;
  importedBy: string;
  warnings?: { type: string; message: string }[];
  status?: "failed";
  errorReason?: string;
  sender?: string;
  snapshot?: FailureSnapshot;
}

interface ImportHistoryProps {
  importHistory: ImportHistoryRecord[];
  historyLoading: boolean;
  historyLoaded: boolean;
  onRefresh: () => void;
}

export default function ImportHistory({
  importHistory,
  historyLoading,
  historyLoaded,
  onRefresh,
}: ImportHistoryProps) {
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

  return (
    <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-lg text-navy">Import History</h3>
        <button
          onClick={onRefresh}
          disabled={historyLoading}
          className="flex items-center gap-1.5 text-[11px] font-medium text-muted hover:text-navy transition-colors"
        >
          <RefreshCw size={12} className={historyLoading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {importHistory.length === 0 ? (
        <div className="text-center py-8">
          <FileText size={24} className="mx-auto text-muted/70 mb-2" />
          <p className="text-sm text-muted">{historyLoaded ? "No imports yet" : "Loading..."}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {importHistory.map((rec) => (
            <ImportHistoryRow
              key={rec.id}
              record={rec}
              expanded={expandedHistoryId === rec.id}
              onToggle={() =>
                setExpandedHistoryId(expandedHistoryId === rec.id ? null : rec.id)
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Import history row (success + failure states) ─────────────────────────

function ImportHistoryRow({
  record,
  expanded,
  onToggle,
}: {
  record: ImportHistoryRecord;
  expanded: boolean;
  onToggle: () => void;
}) {
  const isFailed = record.status === "failed";
  const canExpand = isFailed && !!record.snapshot;

  return (
    <div className="rounded-xl border border-border/50 overflow-hidden">
      <button
        type="button"
        onClick={canExpand ? onToggle : undefined}
        disabled={!canExpand}
        className={`w-full flex items-center gap-3 p-3 text-left transition-colors ${
          canExpand ? "hover:bg-cloud-light/30 cursor-pointer" : ""
        }`}
      >
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
            isFailed ? "bg-warn/10" : "bg-success/10"
          }`}
        >
          {isFailed ? (
            <AlertTriangle size={14} className="text-warn" />
          ) : (
            <CheckCircle2 size={14} className="text-success" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-navy truncate">{record.fileName}</p>
            {!isFailed && (
              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-blue/10 text-blue uppercase shrink-0">
                {record.provider || record.schemaId}
              </span>
            )}
            {isFailed && (
              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-warn/10 text-warn uppercase shrink-0">
                Failed · {record.errorReason ?? "error"}
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted mt-0.5">
            {isFailed
              ? record.sender
                ? `From ${record.sender}`
                : "Import could not be processed"
              : `${record.rowsWritten} written · ${record.rowsSkipped} skipped${
                  record.fileType === "appointments" ? " · Metrics recomputed" : ""
                }${
                  record.warnings && record.warnings.length > 0
                    ? ` · ${record.warnings.length} warning(s)`
                    : ""
                }`}
          </p>
        </div>
        <p className="text-[10px] text-muted shrink-0">
          {new Date(record.importedAt).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </p>
        {canExpand && (
          <span className="text-[10px] text-blue font-semibold shrink-0">
            {expanded ? "Hide" : "Inspect"}
          </span>
        )}
      </button>
      {expanded && record.snapshot && (
        <div className="p-3 bg-cloud-light/30 border-t border-border/50">
          <CSVFailurePreview
            snapshot={record.snapshot as FailureSnapshot}
            sender={record.sender}
            receivedAt={record.importedAt}
          />
        </div>
      )}
    </div>
  );
}
