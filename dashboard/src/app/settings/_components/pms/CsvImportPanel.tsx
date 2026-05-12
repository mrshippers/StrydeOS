"use client";

import { AnimatePresence, motion } from "motion/react";
import Tooltip from "@/components/ui/Tooltip";
import {
  ArrowRight,
  CheckCircle2,
  Info,
  Loader2,
  Sparkles,
  X,
  XCircle,
} from "lucide-react";
import OnboardingWizard from "./OnboardingWizard";
import ColumnMapping from "./ColumnMapping";
import EmailIngest from "./EmailIngest";

interface CsvImportPanelProps {
  open: boolean;
  onClose: () => void;
  clinicId: string | undefined;

  // wizard state (lifted to parent so PMS bridge "Set up auto-import" can open
  // the wizard at step 4)
  wizardOpen: boolean;
  wizardStep: number;
  wizardPms: string;
  setWizardOpen: (open: boolean) => void;
  setWizardStep: (step: number) => void;
  setWizardPms: (pms: string) => void;

  // CSV import state (lifted to parent because handleImportCSV lives there)
  csvUploading: boolean;
  csvResult: { ok: boolean; msg: string } | null;
  onImportCSV: (file: File, fileType: "appointments" | "patients", schemaId?: string) => Promise<void> | void;

  // Column mapping (trigger state lifted; ColumnMapping owns its own interaction state)
  mappingHeaders: string[] | null;
  mappingSampleRows: Record<string, string>[];
  mappingFile: File | null;
  mappingFileType: "appointments" | "patients";
  onCancelMapping: () => void;
}

export default function CsvImportPanel({
  open,
  onClose,
  clinicId,
  wizardOpen,
  wizardStep,
  wizardPms,
  setWizardOpen,
  setWizardStep,
  setWizardPms,
  csvUploading,
  csvResult,
  onImportCSV,
  mappingHeaders,
  mappingSampleRows,
  mappingFile,
  mappingFileType,
  onCancelMapping,
}: CsvImportPanelProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          id="csv-import-section"
          initial={{ opacity: 0, height: 0, marginTop: 0 }}
          animate={{ opacity: 1, height: "auto", marginTop: 16 }}
          exit={{ opacity: 0, height: 0, marginTop: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden"
        >
          <div className="p-5 rounded-xl border border-blue/15 bg-blue/[0.02]">
            <div className="flex items-start justify-between mb-1">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold text-navy">Import from CSV</h4>
                <Tooltip content="Export your appointment or patient data from your PMS as a CSV file, then upload it here. StrydeOS auto-detects the format from WriteUpp, Cliniko, TM3, Jane App, and custom layouts. Uploading again merges — it won't create duplicates." side="bottom">
                  <Info size={13} className="text-muted/60 hover:text-muted cursor-help transition-colors" />
                </Tooltip>
              </div>
              <div className="flex items-center gap-2">
                {!wizardOpen && (
                  <button
                    onClick={() => { setWizardOpen(true); setWizardStep(0); setWizardPms(""); }}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11px] font-semibold text-white bg-blue hover:bg-blue-bright shadow-sm hover:shadow-md transition-all"
                  >
                    <Sparkles size={12} />
                    Setup wizard
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="text-muted hover:text-navy transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* ── Onboarding Wizard (Phase 5) ─────────────────────────────── */}
            {wizardOpen && (
              <OnboardingWizard
                wizardStep={wizardStep}
                wizardPms={wizardPms}
                csvResult={csvResult}
                mappingHeaders={mappingHeaders}
                clinicId={clinicId}
                onClose={() => setWizardOpen(false)}
                onStepChange={setWizardStep}
                onPmsChange={setWizardPms}
              />
            )}

            <p className="text-[12px] text-muted mb-5">
              Export your appointment or patient data from any PMS as CSV and drop it here. Format is auto-detected. Data populates instantly.
            </p>

            {/* ── Column Mapping Screen (Phase 2) ──────────────────────────── */}
            {mappingHeaders && mappingHeaders.length > 0 && mappingFile ? (
              <ColumnMapping
                mappingHeaders={mappingHeaders}
                mappingSampleRows={mappingSampleRows}
                mappingFile={mappingFile}
                mappingFileType={mappingFileType}
                onCancel={onCancelMapping}
                onImport={onImportCSV}
              />
            ) : (
              <>
                {/* Standard drag-drop upload */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {(["appointments", "patients"] as const).map((type) => (
                    <label
                      key={type}
                      className={`relative flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-dashed transition-all cursor-pointer ${
                        csvUploading ? "opacity-50 pointer-events-none" : "border-border hover:border-blue/40 hover:bg-blue/2"
                      }`}
                    >
                      <input
                        type="file"
                        accept=".csv,.xlsx,.xls"
                        className="sr-only"
                        disabled={csvUploading}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) {
                            onImportCSV(f, type);
                            if (wizardOpen && wizardStep === 2) setWizardStep(3);
                          }
                          e.target.value = "";
                        }}
                      />
                      <div className="w-10 h-10 rounded-xl bg-cloud-light flex items-center justify-center">
                        {csvUploading ? <Loader2 size={18} className="animate-spin text-blue" /> : <ArrowRight size={18} className="text-navy rotate-90" />}
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-semibold text-navy capitalize">{type} CSV</p>
                        <p className="text-[11px] text-muted mt-0.5">
                          {type === "appointments" ? "Appointments + auto-recomputes metrics" : "Patient demographics"}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>

                {csvResult && (
                  <div className={`flex items-start gap-2 mt-4 p-3 rounded-xl border text-[12px] ${csvResult.ok ? "border-success/20 bg-success/5 text-success" : "border-danger/20 bg-danger/5 text-danger"}`}>
                    {csvResult.ok ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> : <XCircle size={14} className="mt-0.5 shrink-0" />}
                    <span>{csvResult.msg}</span>
                  </div>
                )}
              </>
            )}

            {/* ── Email Ingest Address (Phase 3) ────────────────────────────── */}
            {!wizardOpen && <EmailIngest clinicId={clinicId} variant="full" />}

            <p className="text-[11px] text-muted mt-4">
              Supports WriteUpp, Cliniko, TM3, Jane App, and custom formats.
              Uploading again merges — it won&apos;t create duplicates.
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
