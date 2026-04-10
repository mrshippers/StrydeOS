"use client";

/**
 * ClinicianHeidiToggle
 *
 * Per-clinician opt-in for Heidi clinical notes sync. Drops into the
 * expanded clinician row in TeamManagementCard.
 *
 * Access rules (mirrors server-side PATCH /api/clinicians/[id]/heidi):
 *   - Owners/admins/superadmins can toggle any clinician in their clinic
 *   - Clinicians can only toggle their own record
 *   - Disabled entirely if the clinic-level Heidi config isn't connected
 */

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/ui/Toast";
import { canEditHeidi, validateHeidiPatch } from "@/lib/heidi/access";
import type { Clinician } from "@/types";

interface Props {
  clinician: Clinician;
  clinicHeidiConnected: boolean;
}

export default function ClinicianHeidiToggle({ clinician, clinicHeidiConnected }: Props) {
  const { user, firebaseUser } = useAuth();
  const { toast } = useToast();

  const [enabled, setEnabled] = useState<boolean>(clinician.heidiEnabled === true);
  const [email, setEmail] = useState<string>(clinician.heidiEmail ?? clinician.email ?? "");
  const [saving, setSaving] = useState(false);

  // Keep local state in sync with incoming props if another session updates the record
  useEffect(() => {
    setEnabled(clinician.heidiEnabled === true);
    setEmail(clinician.heidiEmail ?? clinician.email ?? "");
  }, [clinician.heidiEnabled, clinician.heidiEmail, clinician.email]);

  if (!user) return null;

  const editable = canEditHeidi(
    { role: user.role, clinicianId: user.clinicianId },
    clinician.id,
  );

  const handleSave = async (nextEnabled: boolean) => {
    const payload = { enabled: nextEnabled, email: nextEnabled ? email : undefined };
    const validation = validateHeidiPatch(payload, { clinicHeidiConnected });

    if (!validation.ok) {
      toast(validation.error, "error");
      // Revert the optimistic toggle
      setEnabled(clinician.heidiEnabled === true);
      return;
    }

    setSaving(true);
    try {
      const token = await firebaseUser?.getIdToken();
      const res = await fetch(`/api/clinicians/${clinician.id}/heidi`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          enabled: validation.enabled,
          email: validation.enabled ? validation.email : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(data.error ?? "Failed to update Heidi settings", "error");
        setEnabled(clinician.heidiEnabled === true);
        return;
      }
      toast(
        nextEnabled ? "Heidi enabled for this clinician" : "Heidi disabled",
        "success",
      );
    } catch {
      toast("Network error — try again", "error");
      setEnabled(clinician.heidiEnabled === true);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = () => {
    if (!editable || saving) return;
    const next = !enabled;
    setEnabled(next);
    // If enabling and no email typed yet, defer to the form below — don't PATCH.
    if (next && !email.trim()) return;
    // If disabling, save immediately; if enabling with a pre-filled email, save too.
    handleSave(next);
  };

  const handleConnect = () => {
    if (!editable || saving) return;
    handleSave(true);
  };

  return (
    <div className="pt-2 border-t border-border/30">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <img src="/integrations/heidi.svg" alt="" className="w-4 h-4" />
          <p className="text-[12px] font-semibold text-navy">Heidi clinical notes</p>
        </div>
        {/* Status pill */}
        <span
          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
            clinician.heidiEnabled
              ? "bg-success/10 text-success"
              : "bg-muted/10 text-muted"
          }`}
        >
          {clinician.heidiEnabled ? "Enabled" : "Not enabled"}
        </span>
      </div>

      {!clinicHeidiConnected ? (
        <p className="text-[11px] text-muted">
          Connect Heidi at the clinic level first (see the Integrations section
          above), then each clinician can opt in individually.
        </p>
      ) : !editable ? (
        <p className="text-[11px] text-muted">
          {clinician.heidiEnabled
            ? `Synced via ${clinician.heidiEmail ?? "their Heidi email"}.`
            : "This clinician has not opted in yet."}
          <span className="ml-1 text-muted/80">
            Only they (or an owner/admin) can change this.
          </span>
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-[11px] text-muted leading-relaxed">
            When enabled, StrydeOS pulls session notes and complexity signals
            from {clinician.name.split(" ")[0]}&apos;s Heidi account to personalise
            Pulse follow-up tone and timing.
          </p>

          {enabled && (
            <div>
              <label className="text-[10px] font-semibold text-muted uppercase tracking-wide block mb-1">
                Heidi account email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="andrew@clinic.co.uk"
                className="w-full text-[12px] px-3 py-2 rounded-lg border border-border bg-white text-navy placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-blue/20 focus:border-blue"
                disabled={saving}
              />
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            {!enabled ? (
              <button
                type="button"
                onClick={handleToggle}
                disabled={saving}
                className="text-[11px] font-semibold text-white bg-blue hover:bg-blue-bright px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              >
                Enable Heidi
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleConnect}
                  disabled={saving || !email.trim()}
                  className="text-[11px] font-semibold text-white bg-blue hover:bg-blue-bright px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {saving && <Loader2 size={11} className="animate-spin" />}
                  {clinician.heidiEnabled ? "Save email" : "Save & connect"}
                </button>
                <button
                  type="button"
                  onClick={() => handleSave(false)}
                  disabled={saving}
                  className="text-[11px] font-semibold text-muted hover:text-danger transition-colors"
                >
                  Disable
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
