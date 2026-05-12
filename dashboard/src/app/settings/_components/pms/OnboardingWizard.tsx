"use client";

import { useState } from "react";
import { db } from "@/lib/firebase";
import { useToast } from "@/components/ui/Toast";
import {
  Check,
  X,
  Loader2,
  CheckCircle2,
  Copy,
  Mail,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import { brand } from "@/lib/brand";
import ProviderLogo from "../ProviderLogo";
import { INGEST_EMAIL_DOMAIN } from "./EmailIngest";

export const ONBOARDING_PMS_OPTIONS = [
  { id: "writeupp", label: "WriteUpp", icon: "📋", logo: "/integrations/writeupp.svg" },
  { id: "cliniko", label: "Cliniko", icon: "🗂️", logo: "/integrations/cliniko-dark.svg", logoDark: "/integrations/cliniko-light.svg" },
  { id: "tm3", label: "TM3", icon: "⚕️", logo: "/integrations/tm3.svg" },
  { id: "jane", label: "Jane App", icon: "🌿", logo: "/integrations/jane.png" },
  { id: "powerdiary", label: "Zanda (Power Diary)", icon: "📓", logo: "/integrations/powerdiary.png" },
  { id: "halaxy", label: "Halaxy", icon: "💙", logo: "/integrations/halaxy.svg" },
  { id: "other", label: "Other / Custom", icon: "📄" },
];

interface OnboardingGuide {
  title: string;
  steps: { heading: string; body?: string }[];
}

interface OnboardingWizardProps {
  wizardStep: number;
  wizardPms: string;
  csvResult: { ok: boolean; msg: string } | null;
  mappingHeaders: string[] | null;
  clinicId: string | undefined;
  onClose: () => void;
  onStepChange: (step: number) => void;
  onPmsChange: (pms: string) => void;
}

export default function OnboardingWizard({
  wizardStep,
  wizardPms,
  csvResult,
  mappingHeaders,
  clinicId,
  onClose,
  onStepChange,
  onPmsChange,
}: OnboardingWizardProps) {
  const { toast } = useToast();
  const [wizardGuide, setWizardGuide] = useState<OnboardingGuide | null>(null);
  const [wizardGuideLoading, setWizardGuideLoading] = useState(false);
  const [tm3Platform, setTm3Platform] = useState<"cloud" | "desktop">("cloud");
  const [ingestCopied, setIngestCopied] = useState(false);

  async function loadOnboardingGuide(pmsId: string) {
    setWizardGuideLoading(true);
    setWizardGuide(null);

    // TM3 has no API — hardcoded guide, no Firestore lookup
    if (pmsId === "tm3") {
      setWizardGuide(null); // handled inline by TM3-specific wizard UI
      setWizardGuideLoading(false);
      return;
    }

    try {
      const { getDoc, doc: firestoreDoc } = await import("firebase/firestore");
      if (!db) return;
      const snap = await getDoc(firestoreDoc(db, "onboarding_guides", pmsId));
      if (snap.exists()) {
        setWizardGuide(snap.data() as OnboardingGuide);
      } else {
        setWizardGuide({
          title: `${ONBOARDING_PMS_OPTIONS.find((p) => p.id === pmsId)?.label ?? "Your PMS"} Export Guide`,
          steps: [
            { heading: "Export your data", body: "Look for a Data Export, Reports, or CSV Export option in your PMS. Export your Appointments data as a CSV file." },
            { heading: "Upload to StrydeOS", body: "Drag and drop the exported CSV into the upload zone below." },
          ],
        });
      }
    } catch {
      setWizardGuide({
        title: "Export Guide",
        steps: [{ heading: "Export your data as CSV from your PMS and upload it below." }],
      });
    } finally {
      setWizardGuideLoading(false);
    }
  }

  async function copyIngestEmail() {
    if (!clinicId) return;
    const email = `import-${clinicId}@${INGEST_EMAIL_DOMAIN}`;
    await navigator.clipboard.writeText(email);
    setIngestCopied(true);
    toast("Import email copied", "success");
    setTimeout(() => setIngestCopied(false), 2000);
  }

  return (
    <div className="mt-4 mb-5 p-5 rounded-xl border border-blue/20 bg-blue/5 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-semibold text-navy">
          Step {wizardStep + 1} of 5 — Data Import Setup
        </p>
        <button onClick={onClose} className="text-muted hover:text-navy transition-colors">
          <X size={14} />
        </button>
      </div>

      {/* Step 0: Select PMS */}
      {wizardStep === 0 && (
        <div>
          <p className="text-sm font-medium text-navy mb-3">Which PMS do you use?</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {ONBOARDING_PMS_OPTIONS.map((p) => (
              <button
                key={p.id}
                onClick={() => { onPmsChange(p.id); loadOnboardingGuide(p.id); onStepChange(1); }}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                  wizardPms === p.id ? "border-blue bg-blue/10 text-blue" : "border-border hover:border-blue/30 text-navy"
                }`}
              >
                {p.logo ? (
                  <ProviderLogo logo={p.logo} logoDark={(p as { logoDark?: string }).logoDark} alt={p.label} className="h-5 w-auto max-w-[52px] object-contain shrink-0" />
                ) : (
                  <span className="shrink-0">{p.icon}</span>
                )}
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 1: PMS-specific guide */}
      {wizardStep === 1 && (
        <div>
          {wizardPms === "tm3" ? (
            <div>
              <p className="text-sm font-medium text-navy mb-3">Export appointments from TM3</p>
              <div className="flex gap-1 mb-4">
                {(["cloud", "desktop"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setTm3Platform(p)}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all ${
                      tm3Platform === p ? "bg-navy text-white" : "bg-cloud-light text-muted hover:text-navy"
                    }`}
                  >
                    TM3 {p === "cloud" ? "Cloud" : "Desktop"}
                  </button>
                ))}
              </div>
              <ol className="space-y-3">
                {(tm3Platform === "cloud" ? [
                  { heading: "Go to Reports", body: "In TM3 Cloud, navigate to Reports and select Appointment Report." },
                  { heading: "Set your date range", body: "For your first import, select the last 90 days. For recurring imports, the last 7 days." },
                  { heading: "Select columns", body: "Include: Therapist, Date, Time, End Time, Type, Status, Client Ref, Amount, Forename, Surname." },
                  { heading: "Export as CSV", body: "Click Export and save the file. You’ll upload it in the next step." },
                ] : [
                  { heading: "Open Reports", body: "In TM3 Desktop, go to Reports and select Diary Export or Appointment Report." },
                  { heading: "Set your date range", body: "For your first import, cover the last 90 days. For recurring, the last 7 days." },
                  { heading: "Select all appointment columns", body: "Ensure Therapist, Date, Time, Type, Status, Client Ref, and Amount are included." },
                  { heading: "Export to CSV", body: "Save the exported file. You’ll upload it in the next step." },
                ]).map((step, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="w-6 h-6 rounded-full bg-navy/10 text-navy text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-navy">{step.heading}</p>
                      <p className="text-[12px] text-muted mt-0.5">{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ) : wizardGuideLoading ? (
            <div className="flex items-center gap-2 text-muted text-sm py-4">
              <Loader2 size={14} className="animate-spin" /> Loading guide...
            </div>
          ) : wizardGuide ? (
            <div>
              <p className="text-sm font-medium text-navy mb-3">{wizardGuide.title}</p>
              <ol className="space-y-3">
                {wizardGuide.steps.map((step, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="w-6 h-6 rounded-full bg-blue/10 text-blue text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-navy">{step.heading}</p>
                      {step.body && <p className="text-[12px] text-muted mt-0.5">{step.body}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          <div className="flex items-center gap-2 mt-4">
            <button onClick={() => onStepChange(0)} className="flex items-center gap-1 text-[12px] text-muted hover:text-navy transition-colors">
              <ChevronLeft size={14} /> Back
            </button>
            <button
              onClick={() => onStepChange(2)}
              className="btn-primary" style={{ padding: "8px 16px", fontSize: 12 }}
            >
              I have my CSV <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Upload (uses existing drag-drop below) */}
      {wizardStep === 2 && (
        <div>
          <p className="text-sm font-medium text-navy mb-2">Upload your CSV file below</p>
          <p className="text-[12px] text-muted mb-3">Drag and drop your exported CSV into one of the upload zones. StrydeOS will auto-detect the format.</p>
          <div className="flex items-center gap-2">
            <button onClick={() => onStepChange(1)} className="flex items-center gap-1 text-[12px] text-muted hover:text-navy transition-colors">
              <ChevronLeft size={14} /> Back
            </button>
            <span className="text-[11px] text-muted">Upload a file below to continue</span>
          </div>
        </div>
      )}

      {/* Step 3: Confirm mapping */}
      {wizardStep === 3 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 size={16} className="text-success" />
            <p className="text-sm font-medium text-navy">
              {csvResult?.ok ? "Import complete" : mappingHeaders ? "Manual mapping required" : "Upload your CSV above"}
            </p>
          </div>
          {csvResult?.ok && (
            <p className="text-[12px] text-muted mb-3">{csvResult.msg}</p>
          )}
          <div className="flex items-center gap-2">
            <button onClick={() => onStepChange(2)} className="flex items-center gap-1 text-[12px] text-muted hover:text-navy transition-colors">
              <ChevronLeft size={14} /> Back
            </button>
            {csvResult?.ok && (
              <button
                onClick={() => onStepChange(4)}
                className="btn-primary" style={{ padding: "8px 16px", fontSize: 12 }}
              >
                Next: recurring <ChevronRight size={14} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Step 4: Set up recurring */}
      {wizardStep === 4 && (
        <div>
          <p className="text-sm font-medium text-navy mb-2">Set up recurring imports</p>
          {wizardPms === "tm3" ? (
            <div className="text-[12px] text-muted mb-3 space-y-2">
              <p>TM3 Cloud supports <strong className="text-navy">Scheduled Reports</strong>. Set one up to email your appointment CSV weekly to the address below — then StrydeOS imports automatically. Zero ongoing effort.</p>
              <ol className="list-decimal list-inside space-y-1 text-[11px]">
                <li>In TM3 Cloud, go to <strong className="text-navy">Reports &rarr; Scheduled Reports</strong></li>
                <li>Create a new schedule for the Appointment Report</li>
                <li>Set frequency to <strong className="text-navy">weekly</strong> (e.g. every Monday)</li>
                <li>Set the email recipient to your ingest address below</li>
              </ol>
            </div>
          ) : (
            <p className="text-[12px] text-muted mb-3">
              For hands-free data import, point your PMS email export to your clinic&apos;s unique ingest address. Every CSV attachment sent here is imported automatically.
            </p>
          )}
          {clinicId && (
            <div className="flex items-center gap-2 p-3 rounded-xl border border-border bg-cloud-light">
              <Mail size={14} className="text-blue shrink-0" />
              <code className="text-[12px] text-navy flex-1 break-all">import-{clinicId}@{INGEST_EMAIL_DOMAIN}</code>
              <button onClick={copyIngestEmail} className="shrink-0 text-blue hover:text-blue-bright transition-colors">
                {ingestCopied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
          )}
          <div className="flex items-center gap-2 mt-4">
            <button onClick={() => onStepChange(3)} className="flex items-center gap-1 text-[12px] text-muted hover:text-navy transition-colors">
              <ChevronLeft size={14} /> Back
            </button>
            <button
              onClick={() => { onClose(); toast("Setup complete", "success"); }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold text-white transition-all hover:opacity-90"
              style={{ background: brand.success }}
            >
              <Check size={14} /> Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
