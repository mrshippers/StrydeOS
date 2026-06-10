"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { StrydeOSLogo } from "@/components/MonolithLogo";
import { Shield, CheckCircle2, ArrowLeft } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { getJurisdictionConfig, JURISDICTION_CONFIGS } from "@/data/compliance-config";
import type { Jurisdiction } from "@/types";

export default function PrivacyPage() {
  const { user } = useAuth();
  const [selectedJurisdiction, setSelectedJurisdiction] = useState<Jurisdiction>("uk");

  useEffect(() => {
    if (user?.clinicProfile?.compliance?.jurisdiction) {
      setSelectedJurisdiction(user.clinicProfile.compliance.jurisdiction);
    }
  }, [user]);

  const config = getJurisdictionConfig(selectedJurisdiction);

  return (
    <div className="min-h-screen bg-cloud-dancer">
      {/* Header */}
      <header className="border-b border-border bg-white">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <StrydeOSLogo size={32} fontSize={16} theme="light" gap={10} />
          </Link>
          {user && (
            <Link
              href="/dashboard"
              className="flex items-center gap-2 text-sm text-muted hover:text-navy transition-colors"
            >
              <ArrowLeft size={14} />
              Back to Dashboard
            </Link>
          )}
        </div>
      </header>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* Title */}
          <div className="flex items-start gap-4 mb-8">
            <div className="h-12 w-12 rounded-xl bg-blue/10 flex items-center justify-center shrink-0">
              <Shield size={24} className="text-blue" />
            </div>
            <div>
              <h1 className="font-display text-[36px] text-navy leading-tight mb-2">
                Privacy Policy
              </h1>
              <p className="text-muted">
                How StrydeOS collects, uses, and protects your clinic and patient data
              </p>
            </div>
          </div>

          {/* Jurisdiction selector */}
          {!user && (
            <div className="mb-8 p-4 rounded-xl bg-white surface-lit border border-border">
              <label className="block text-xs font-semibold text-muted uppercase tracking-widest mb-2">
                Select your region
              </label>
              <select
                value={selectedJurisdiction}
                onChange={(e) => setSelectedJurisdiction(e.target.value as Jurisdiction)}
                className="w-full px-4 py-2 rounded-xl text-sm text-navy border border-border bg-cloud-light focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue transition-all"
              >
                {Object.values(JURISDICTION_CONFIGS).map((j) => (
                  <option key={j.jurisdiction} value={j.jurisdiction}>
                    {j.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Main content card */}
          <div className="bg-white rounded-2xl border border-border overflow-hidden shadow-sm">
            <div className="p-8 space-y-8">
              {/* Data processing basis */}
              <section>
                <h2 className="text-xl font-display text-navy mb-3">Data Processing</h2>
                <div className="p-4 rounded-xl bg-cloud-light border border-border">
                  <p className="text-sm text-muted whitespace-pre-line">{config.consentBody}</p>
                </div>
                <p className="text-xs text-muted mt-2 italic">{config.dataProcessingBasis}</p>
              </section>

              {/* Health information */}
              <section>
                <h2 className="text-xl font-display text-navy mb-3">Health Information</h2>
                <p className="text-sm text-navy leading-relaxed">{config.healthDataNote}</p>
              </section>

              {/* Automated decisions (AU only) */}
              {config.automatedDecisionDisclosure && (
                <section>
                  <h2 className="text-xl font-display text-navy mb-3">
                    Automated Decision-Making
                  </h2>
                  <div className="p-4 rounded-xl bg-blue/5 border border-blue/20">
                    <p className="text-sm text-navy leading-relaxed whitespace-pre-line">
                      {config.automatedDecisionDisclosure}
                    </p>
                  </div>
                </section>
              )}

              {/* Cross-border transfers (CA only) */}
              {config.crossBorderTransferNote && (
                <section>
                  <h2 className="text-xl font-display text-navy mb-3">
                    Cross-Border Data Transfer
                  </h2>
                  <div className="p-4 rounded-xl bg-blue/5 border border-blue/20">
                    <p className="text-sm text-navy leading-relaxed whitespace-pre-line">
                      {config.crossBorderTransferNote}
                    </p>
                  </div>
                </section>
              )}

              {/* Privacy highlights */}
              <section>
                <h2 className="text-xl font-display text-navy mb-3">Privacy Highlights</h2>
                <ul className="space-y-3">
                  {config.privacyHighlights.map((highlight, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      <CheckCircle2 size={16} className="text-success mt-0.5 shrink-0" />
                      <span className="text-sm text-navy">{highlight}</span>
                    </li>
                  ))}
                </ul>
              </section>

              {/* Data retention */}
              <section>
                <h2 className="text-xl font-display text-navy mb-3">Data Retention</h2>
                <p className="text-sm text-navy leading-relaxed mb-3">
                  We retain clinic and patient data for as long as your clinic maintains an active
                  account with StrydeOS. Upon account closure or deletion request, data is:
                </p>
                <ul className="space-y-2 ml-6">
                  <li className="text-sm text-navy">
                    • Marked for deletion within 30 days (grace period for account recovery)
                  </li>
                  <li className="text-sm text-navy">
                    • Permanently deleted from active systems after the grace period
                  </li>
                  <li className="text-sm text-navy">
                    • Retained in encrypted backups for 90 days, then permanently purged
                  </li>
                </ul>
                <p className="text-sm text-muted mt-3">
                  Clinical records may be retained longer if required by local regulations (e.g.,
                  NHS guidelines recommend 8 years post-discharge).
                </p>
              </section>

              {/* Your rights */}
              <section>
                <h2 className="text-xl font-display text-navy mb-3">Your Rights</h2>
                <p className="text-sm text-navy leading-relaxed mb-3">
                  Under applicable privacy laws, you have the right to:
                </p>
                <ul className="space-y-2 ml-6">
                  <li className="text-sm text-navy">
                    • Access your data (Subject Access Request)
                  </li>
                  <li className="text-sm text-navy">
                    • Correct inaccurate or incomplete data
                  </li>
                  <li className="text-sm text-navy">
                    • Request deletion of your data (Right to be Forgotten, where applicable)
                  </li>
                  <li className="text-sm text-navy">
                    • Object to processing or request restriction
                  </li>
                  <li className="text-sm text-navy">
                    • Data portability (receive your data in a machine-readable format)
                  </li>
                  <li className="text-sm text-navy">
                    • Withdraw consent at any time (where processing is based on consent)
                  </li>
                </ul>
                <p className="text-sm text-muted mt-3">
                  To exercise these rights, contact us at{" "}
                  <a href="mailto:privacy@strydeos.com" className="text-blue hover:underline">
                    privacy@strydeos.com
                  </a>
                  . We will respond within 30 days.
                </p>
              </section>

              {/* Contact */}
              <section>
                <h2 className="text-xl font-display text-navy mb-3">Contact Us</h2>
                <p className="text-sm text-navy leading-relaxed mb-2">
                  For privacy-related questions, data access requests, or concerns:
                </p>
                <div className="p-4 rounded-xl bg-cloud-light border border-border">
                  <p className="text-sm text-navy">
                    <strong>Email:</strong>{" "}
                    <a href="mailto:privacy@strydeos.com" className="text-blue hover:underline">
                      privacy@strydeos.com
                    </a>
                  </p>
                  <p className="text-sm text-navy mt-1">
                    <strong>Address:</strong> StrydeOS Limited, West Hampstead, London, UK
                  </p>
                </div>
              </section>

              {/* Last updated */}
              <div className="pt-6 border-t border-border">
                <p className="text-xs text-muted">
                  Last updated: March 2026
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
