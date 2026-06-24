"use client";

/**
 * Pulse → Insurance tab. Consolidates every insurance surface under Pulse:
 * the add-on context (flag-aware), the manual send-form action, and a link
 * to the staff review queue. Replaces the old billing add-on card.
 */

import Link from "next/link";
import { GlassCard } from "@/components/ui/GlassCard";
import SendInsuranceFormButton from "@/components/insurance/SendInsuranceFormButton";
import { useAuth } from "@/hooks/useAuth";
import { ShieldCheck, ArrowRight, ClipboardList } from "lucide-react";

export default function InsurancePanel() {
  const { user } = useAuth();
  const enabled = !!user?.clinicProfile?.featureFlags?.insuranceIntake;
  const canManage = !!user && ["owner", "admin", "superadmin"].includes(user.role);

  return (
    <div className="animate-fade-in space-y-4">
      <GlassCard variant="standard" tint="pulse" className="p-6">
        <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-2xl z-[2] bg-teal" />
        <div className="flex items-start justify-between gap-6 mt-1">
          <div>
            <div className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded mb-3 bg-cloud-dark text-navy">
              <ShieldCheck size={9} strokeWidth={2.5} /> {enabled ? "Active" : "Add-on"}
            </div>
            <h3 className="text-[20px] text-navy font-display font-normal mb-1">Insurance &amp; Intake</h3>
            <p className="text-[13px] text-muted mb-4 max-w-md">
              Collect patient insurance, pre-authorisation and confirmed address before the
              appointment, written straight back to your PMS. Delivered under Pulse.
            </p>

            {enabled && canManage ? (
              <div className="flex items-center gap-3">
                <SendInsuranceFormButton />
                <Link
                  href="/compliance/insurance"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal hover:opacity-80 transition-opacity"
                >
                  <ClipboardList size={13} /> Review queue <ArrowRight size={12} />
                </Link>
              </div>
            ) : enabled && !canManage ? (
              <p className="text-[12px] text-muted">
                Insurance intake is active. Ask a clinic admin to send forms or review submissions.
              </p>
            ) : (
              <a
                href={
                  "mailto:jamal@strydeos.com?subject=" +
                  encodeURIComponent("StrydeOS Insurance & Intake add-on") +
                  "&body=" +
                  encodeURIComponent("I'd like to add the Insurance & Intake module to our StrydeOS account.")
                }
                className="btn-primary btn-primary-teal inline-flex w-fit justify-center"
              >
                Enable Insurance &amp; Intake <ArrowRight size={14} />
              </a>
            )}
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
