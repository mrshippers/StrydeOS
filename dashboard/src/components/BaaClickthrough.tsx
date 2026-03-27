"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Loader2, ArrowRight, CheckCircle2, FileText } from "lucide-react";
import { getJurisdictionConfig } from "@/data/compliance-config";

interface BaaClickthroughProps {
  clinicId: string;
  onAccept: () => void;
}

export function BaaClickthrough({ clinicId, onAccept }: BaaClickthroughProps) {
  const [saving, setSaving] = useState(false);
  const [accepted, setAccepted] = useState(false);

  const consentConfig = getJurisdictionConfig("us");
  const baaText = consentConfig.baaText || "";

  async function handleAccept() {
    if (!accepted) return;
    setSaving(true);

    try {
      const res = await fetch("/api/compliance/baa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clinicId }),
      });

      if (!res.ok) {
        throw new Error("Failed to record BAA acceptance");
      }

      onAccept();
    } catch (err) {
      console.error("[BAA acceptance error]", err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "linear-gradient(135deg, #0B2545 0%, #132D5E 60%, #1C54F2 100%)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2.5">
          <div
            className="h-8 w-8 rounded-lg flex items-center justify-center text-white font-display text-sm font-bold"
            style={{ background: "rgba(255,255,255,0.15)" }}
          >
            S
          </div>
          <span className="font-display text-[16px] text-white">StrydeOS</span>
        </div>
      </div>

      {/* BAA content */}
      <div className="flex-1 flex items-center justify-center px-6 py-8 overflow-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-3xl rounded-2xl bg-white overflow-hidden shadow-[0_32px_80px_rgba(0,0,0,0.25)]"
        >
          <div className="p-8">
            <div className="flex items-start gap-3 mb-6">
              <div className="h-10 w-10 rounded-xl bg-blue/10 flex items-center justify-center shrink-0">
                <FileText size={20} className="text-blue" />
              </div>
              <div>
                <h1 className="font-display text-[28px] text-navy leading-tight mb-1">
                  Business Associate Agreement
                </h1>
                <p className="text-sm text-muted">Required for HIPAA compliance</p>
              </div>
            </div>

            <div className="mb-8 p-4 rounded-xl bg-blue/5 border border-blue/20">
              <p className="text-[13px] text-navy">
                Under the Health Insurance Portability and Accountability Act (HIPAA), we are required
                to enter into a Business Associate Agreement with you. This agreement establishes our
                obligations regarding Protected Health Information (ePHI) and ensures compliance with
                federal privacy and security regulations.
              </p>
            </div>

            <div className="mb-8 max-h-[400px] overflow-y-auto p-6 rounded-xl border border-border bg-cloud-light">
              <div className="prose prose-sm max-w-none">
                <div className="text-[13px] text-navy leading-relaxed whitespace-pre-line">
                  {baaText.split(/\n/).map((line, i) => {
                    const parts: React.ReactNode[] = [];
                    const remaining = line.replace(/^##\s*/, "");
                    const isHeading = line.startsWith("##");
                    let keyIdx = 0;

                    const boldRegex = /\*\*(.*?)\*\*/g;
                    let match: RegExpExecArray | null;
                    let lastIndex = 0;

                    while ((match = boldRegex.exec(remaining)) !== null) {
                      if (match.index > lastIndex) {
                        parts.push(remaining.slice(lastIndex, match.index));
                      }
                      parts.push(<strong key={`b${keyIdx++}`}>{match[1]}</strong>);
                      lastIndex = boldRegex.lastIndex;
                    }
                    if (lastIndex < remaining.length) {
                      parts.push(remaining.slice(lastIndex));
                    }

                    if (isHeading) {
                      return (
                        <p key={i} className="font-semibold mt-4 mb-1">
                          {parts}
                        </p>
                      );
                    }
                    return <span key={i}>{parts}{"\n"}</span>;
                  })}
                </div>
              </div>
            </div>

            <label className="flex items-start gap-3 mb-6 cursor-pointer group">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-border text-blue focus:ring-2 focus:ring-blue/30 cursor-pointer"
              />
              <span className="text-[14px] text-navy group-hover:text-navy/80 transition-colors">
                I have read and agree to the Business Associate Agreement. I acknowledge that I understand
                the obligations and responsibilities outlined in this agreement, and I consent to StrydeOS
                acting as our Business Associate under HIPAA.
              </span>
            </label>

            <motion.button
              type="button"
              onClick={handleAccept}
              disabled={!accepted || saving}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white bg-blue transition-colors hover:opacity-90 disabled:opacity-50"
              whileTap={accepted && !saving ? { scale: 0.97 } : {}}
            >
              {saving ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <>
                  <CheckCircle2 size={16} />
                  Accept Business Associate Agreement
                  <ArrowRight size={14} />
                </>
              )}
            </motion.button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
