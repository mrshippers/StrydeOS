"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/Toast";
import Tooltip from "@/components/ui/Tooltip";
import { Check, Copy, Mail, Info } from "lucide-react";

export const INGEST_EMAIL_DOMAIN = "ingest.strydeos.com";

interface EmailIngestProps {
  clinicId: string | undefined;
  /**
   * `compact` renders the small inline card variant (used inside the CSV bridge
   * panel). The default `full` variant renders the larger Email-to-Import card
   * with description text.
   */
  variant?: "full" | "compact";
}

export default function EmailIngest({ clinicId, variant = "full" }: EmailIngestProps) {
  const { toast } = useToast();
  const [ingestCopied, setIngestCopied] = useState(false);

  async function copyIngestEmail() {
    if (!clinicId) return;
    const email = `import-${clinicId}@${INGEST_EMAIL_DOMAIN}`;
    await navigator.clipboard.writeText(email);
    setIngestCopied(true);
    toast("Import email copied", "success");
    setTimeout(() => setIngestCopied(false), 2000);
  }

  if (!clinicId) return null;

  if (variant === "compact") {
    return (
      <div className="flex items-center gap-2 p-2.5 rounded-lg border border-border bg-white">
        <Mail size={12} className="text-blue shrink-0" />
        <code className="text-[11px] text-navy flex-1 break-all">import-{clinicId}@{INGEST_EMAIL_DOMAIN}</code>
        <button type="button" onClick={copyIngestEmail} className="shrink-0 text-blue hover:text-blue-bright transition-colors">
          {ingestCopied ? <Check size={12} /> : <Copy size={12} />}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-5 p-4 rounded-xl border border-border bg-cloud-light/50">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-blue/10 flex items-center justify-center shrink-0">
          <Mail size={14} className="text-blue" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <p className="text-xs font-semibold text-navy">Email-to-Import</p>
            <Tooltip content="Your clinic has a unique email address. Any CSV file sent as an attachment to this address is automatically imported into StrydeOS — no manual upload needed. Set your PMS to email scheduled reports here for hands-free data sync." side="bottom">
              <Info size={11} className="text-muted/60 hover:text-muted cursor-help transition-colors" />
            </Tooltip>
          </div>
          <p className="text-[11px] text-muted mb-2">
            Forward PMS exports or set up scheduled email delivery to this address. CSV attachments are imported automatically.
          </p>
          <div className="flex items-center gap-2">
            <code className="text-[11px] text-navy bg-white px-2 py-1 rounded border border-border break-all">
              import-{clinicId}@{INGEST_EMAIL_DOMAIN}
            </code>
            <button
              onClick={copyIngestEmail}
              className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-blue border border-blue/20 hover:bg-blue/5 transition-colors"
            >
              {ingestCopied ? <Check size={12} /> : <Copy size={12} />}
              {ingestCopied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
