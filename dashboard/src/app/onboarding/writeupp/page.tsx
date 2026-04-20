"use client";

/**
 * Onboarding — Connect WriteUpp
 *
 * WriteUpp has no API. Clinic owners schedule a weekly Activity-by-Date report
 * to email a CSV to their unique ingest inbox. This page is the walkthrough the
 * owner sees when they pick WriteUpp in onboarding or click "Connect WriteUpp"
 * in Settings.
 *
 * Network behaviour:
 *   On mount → GET /api/integrations/inbound-email/provision
 *     · success → render the canonical inbox address from the API
 *     · failure → fall back to the deterministic pattern + a small warning
 *   On "I've set this up" → POST { action: "add", sender: <user.email> }
 *     to register the owner's address as the first authorised sender, then
 *     navigate to /dashboard. Failures don't block navigation — the inbox
 *     still works; the owner can add their address later in Settings.
 *
 * E2E escape hatch: `?clinicId=` short-circuits the auth path AND silences
 * the provision call so Playwright doesn't need a real Firebase user.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Copy, ExternalLink } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { StrydeOSLogo } from "@/components/MonolithLogo";
import { brand } from "@/lib/brand";

const INGEST_DOMAIN = "ingest.strydeos.com";
const WRITEUPP_REPORTS_URL = "https://app.writeupp.com/reports";
const PROVISION_PATH = "/api/integrations/inbound-email/provision";

function buildIngestEmail(clinicId: string): string {
  return `import-${clinicId}@${INGEST_DOMAIN}`;
}

interface ProvisionResponse {
  email: string;
  allowedSenders: string[];
  provisioned: boolean;
  domain: string;
}

type ProvisionState =
  | { status: "loading" }
  | { status: "ready"; email: string }
  | { status: "fallback"; email: string };

export default function ConnectWriteUppPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, firebaseUser } = useAuth();
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Prefer auth context. Fall back to `?clinicId=` for e2e test scenarios
  // where a full Firebase sign-in isn't available. Displayed as "your clinic"
  // if neither is present — this page should never blank-out.
  const clinicId = useMemo(() => {
    if (user?.clinicId) return user.clinicId;
    const qp = searchParams.get("clinicId");
    return qp ?? "your-clinic";
  }, [user, searchParams]);

  // E2E mode: when the page is opened with `?clinicId=` we are not
  // authenticated, so skip the provision API call and use the deterministic
  // pattern. This preserves the "page makes no API calls" Playwright contract.
  const isE2EBypass = useMemo(
    () => !user && searchParams.has("clinicId"),
    [user, searchParams]
  );

  const [provision, setProvision] = useState<ProvisionState>(() =>
    isE2EBypass
      ? { status: "fallback", email: buildIngestEmail(clinicId) }
      : { status: "loading" }
  );

  // Fetch the canonical inbox address. Only runs when we have an authed user.
  useEffect(() => {
    if (isE2EBypass) return;
    if (!firebaseUser) return;

    let cancelled = false;
    (async () => {
      try {
        const token = await firebaseUser.getIdToken();
        const res = await fetch(PROVISION_PATH, {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = (await res.json()) as ProvisionResponse;
        if (cancelled) return;
        setProvision({ status: "ready", email: data.email });
      } catch {
        if (cancelled) return;
        setProvision({ status: "fallback", email: buildIngestEmail(clinicId) });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [firebaseUser, clinicId, isE2EBypass]);

  const ingestEmail =
    provision.status === "loading" ? buildIngestEmail(clinicId) : provision.email;

  const handleCopy = useCallback(async () => {
    if (provision.status === "loading") return;
    try {
      await navigator.clipboard.writeText(ingestEmail);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access denied or unavailable — silently no-op.
      // User can still select the pill text manually.
    }
  }, [ingestEmail, provision.status]);

  const handleConfirm = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);

    // E2E bypass or unauthenticated: skip the POST entirely. Navigation still
    // happens — middleware will route unauthenticated users appropriately.
    if (isE2EBypass || !firebaseUser || !user?.email) {
      router.push("/dashboard");
      return;
    }

    try {
      const token = await firebaseUser.getIdToken();
      await fetch(PROVISION_PATH, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: "add", sender: user.email }),
      });
    } catch {
      // Provision failure is non-blocking — the owner can register the address
      // later from Settings → Integrations. Don't trap them on this screen.
    } finally {
      router.push("/dashboard");
    }
  }, [firebaseUser, isE2EBypass, router, submitting, user?.email]);

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: `linear-gradient(135deg, ${brand.navy} 0%, ${brand.navyMid} 60%, ${brand.blue} 100%)` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-5">
        <a href="https://strydeos.com" className="no-underline">
          <StrydeOSLogo size={34} fontSize={17} theme="dark" gap={10} />
        </a>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-start justify-center px-6 py-8">
        <div className="w-full max-w-2xl">
          <div className="rounded-2xl bg-white shadow-[0_32px_80px_rgba(0,0,0,0.25)] overflow-hidden">
            {/* Hero */}
            <div
              className="px-8 pt-10 pb-8"
              style={{ background: `linear-gradient(135deg, ${brand.navy} 0%, ${brand.navyMid} 100%)` }}
            >
              <h1 className="font-display text-white text-[32px] leading-tight" style={{ fontWeight: 400 }}>
                Connect WriteUpp
              </h1>
              <p className="mt-3 text-[14px] text-white/70 leading-relaxed">
                Two minutes. No CSVs to remember. WriteUpp emails it here weekly.
              </p>
            </div>

            {/* Steps */}
            <div className="p-8 space-y-6">
              <StepCard
                number={1}
                title="Open WriteUpp Reports"
                body={
                  <p className="text-[13px] text-muted leading-relaxed">
                    Sign in to WriteUpp and open the Reports section.{" "}
                    <a
                      href={WRITEUPP_REPORTS_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-blue font-medium hover:underline"
                    >
                      Open WriteUpp
                      <ExternalLink size={12} />
                    </a>
                  </p>
                }
              />

              <StepCard
                number={2}
                title="Schedule the Activity by Date export"
                body={
                  <ul className="text-[13px] text-muted leading-relaxed space-y-1.5 list-none">
                    <li>Reports &rarr; Activity by Date</li>
                    <li>Schedule &rarr; Weekly</li>
                    <li>Email to: the address below</li>
                    <li>Format: CSV</li>
                  </ul>
                }
              />

              <StepCard
                number={3}
                title="Email it here"
                body={
                  <div className="space-y-3">
                    <p className="text-[13px] text-muted leading-relaxed">
                      Paste this address into WriteUpp&apos;s schedule. It&apos;s unique to your clinic.
                    </p>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                      {provision.status === "loading" ? (
                        <div
                          className="flex-1 px-4 py-3 rounded-xl border border-border bg-cream"
                          data-testid="ingest-email-skeleton"
                          aria-busy="true"
                          aria-label="Loading inbox address"
                        >
                          <div className="h-[18px] rounded bg-cloud-light animate-pulse" />
                        </div>
                      ) : (
                        <div
                          className="flex-1 px-4 py-3 rounded-xl border border-border bg-cream font-mono text-[13px] text-navy select-all break-all"
                          data-testid="ingest-email"
                        >
                          {ingestEmail}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={handleCopy}
                        disabled={provision.status === "loading"}
                        aria-label="Copy email"
                        className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-border bg-white text-[13px] font-semibold text-navy hover:bg-cloud-light transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {copied ? (
                          <>
                            <Check size={14} className="text-success" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy size={14} />
                            Copy email
                          </>
                        )}
                      </button>
                    </div>
                    {provision.status === "fallback" && !isE2EBypass && (
                      <p className="text-[12px] text-muted leading-relaxed" data-testid="provision-fallback-warning">
                        Couldn&apos;t reach the provisioning service — the email above is correct;
                        we&apos;ll register you when you complete setup.
                      </p>
                    )}
                  </div>
                }
              />

              {/* Reassurance */}
              <p className="text-[12px] text-muted leading-relaxed pt-2">
                Your reports go to your dedicated inbox. We can&apos;t read other email.
              </p>

              {/* Footer actions */}
              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-4 pt-2">
                <a
                  href="/settings#csv-import-section"
                  className="text-[13px] text-muted hover:text-navy transition-colors text-center sm:text-left"
                >
                  Skip for now &mdash; I&apos;ll upload manually
                </a>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={submitting}
                  className="btn-primary justify-center disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  I&apos;ve set this up
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StepCard({
  number,
  title,
  body,
}: {
  number: number;
  title: string;
  body: React.ReactNode;
}) {
  return (
    <div className="flex gap-4 p-5 rounded-2xl bg-cloud-light border border-border">
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-[13px] font-semibold text-white"
        style={{ background: brand.blue }}
      >
        {number}
      </div>
      <div className="flex-1 min-w-0">
        <h2 className="text-[15px] font-semibold text-navy mb-2">{title}</h2>
        {body}
      </div>
    </div>
  );
}
