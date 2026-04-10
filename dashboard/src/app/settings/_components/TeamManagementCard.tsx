"use client";

import { Plus, Check, X, Loader2, CheckCircle2, ArrowRight, Trash2 } from "lucide-react";
import { brand } from "@/lib/brand";
import { getInitials } from "@/lib/utils";
import type { Clinician, ClinicProfile, OnboardingState } from "@/types";
import ClinicianHeidiToggle from "./ClinicianHeidiToggle";

interface TeamManagementCardProps {
  clinicProfile: ClinicProfile | null;
  clinicians: Clinician[];
  /** True when the clinic-level Heidi integration is connected (apiKey saved, enabled). */
  clinicHeidiConnected?: boolean;
  canManageTeam: boolean;
  showOnboarding: boolean;
  onboarding: OnboardingState;
  addingClinician: boolean;
  setAddingClinician: (v: boolean) => void;
  newClinicianName: string;
  setNewClinicianName: (v: string) => void;
  newClinicianEmail: string;
  setNewClinicianEmail: (v: string) => void;
  newClinicianRole: string;
  setNewClinicianRole: (v: string) => void;
  newClinicianAuthRole: "clinician" | "admin";
  setNewClinicianAuthRole: (v: "clinician" | "admin") => void;
  submittingClinician: boolean;
  expandedClinicianId: string | null;
  setExpandedClinicianId: (v: string | null) => void;
  confirmDeleteId: string | null;
  setConfirmDeleteId: (v: string | null) => void;
  editingEmail: Record<string, string>;
  setEditingEmail: (v: React.SetStateAction<Record<string, string>>) => void;
  sendingInvite: Record<string, boolean>;
  inviteResult: Record<string, string>;
  setInviteResult: (v: React.SetStateAction<Record<string, string>>) => void;
  handleAddClinician: () => void;
  handleDeactivateClinician: (id: string, name: string) => void;
  handleConfirmTeam: () => void;
  handleSendInvite: (clinicianId: string) => void;
}

export default function TeamManagementCard({
  clinicProfile: cp,
  clinicians,
  clinicHeidiConnected = false,
  canManageTeam,
  showOnboarding,
  onboarding,
  addingClinician,
  setAddingClinician,
  newClinicianName,
  setNewClinicianName,
  newClinicianEmail,
  setNewClinicianEmail,
  newClinicianRole,
  setNewClinicianRole,
  newClinicianAuthRole,
  setNewClinicianAuthRole,
  submittingClinician,
  expandedClinicianId,
  setExpandedClinicianId,
  confirmDeleteId,
  setConfirmDeleteId,
  editingEmail,
  setEditingEmail,
  sendingInvite,
  inviteResult,
  setInviteResult,
  handleAddClinician,
  handleDeactivateClinician,
  handleConfirmTeam,
  handleSendInvite,
}: TeamManagementCardProps) {
  return (
    <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-6">
      <div className="flex items-center justify-between mb-1">
        <div>
          <h3 className="font-display text-lg text-navy">Clinic Management</h3>
          {cp?.name && (
            <p className="text-[12px] text-muted italic mt-0.5">{cp.name} team</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {showOnboarding && clinicians.length > 0 && !onboarding.cliniciansConfirmed && (
            <button
              onClick={handleConfirmTeam}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-white transition-all hover:opacity-90"
              style={{ background: brand.success }}
            >
              <CheckCircle2 size={12} />
              Confirm team
            </button>
          )}
          {canManageTeam && (
            <button
              onClick={() => setAddingClinician(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-blue border border-blue/20 hover:bg-blue/5 transition-colors"
            >
              <Plus size={12} />
              Add Clinician
            </button>
          )}
        </div>
      </div>

      {addingClinician && (
        <div className="mb-4 mt-4 p-4 rounded-xl border border-blue/20 bg-blue/5 animate-fade-in">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">
                Name
              </label>
              <input
                type="text"
                value={newClinicianName}
                onChange={(e) => setNewClinicianName(e.target.value)}
                placeholder="Full name"
                autoFocus
                className="w-full px-3 py-2 rounded-lg border border-border bg-white text-sm text-navy focus:outline-none focus:border-blue focus:ring-1 focus:ring-blue/20 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">
                Email
              </label>
              <input
                type="email"
                value={newClinicianEmail}
                onChange={(e) => setNewClinicianEmail(e.target.value)}
                placeholder="clinician@example.com"
                className="w-full px-3 py-2 rounded-lg border border-border bg-white text-sm text-navy focus:outline-none focus:border-blue focus:ring-1 focus:ring-blue/20 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">
                Role
              </label>
              <select
                value={newClinicianRole}
                onChange={(e) => setNewClinicianRole(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-white text-sm text-navy focus:outline-none focus:border-blue focus:ring-1 focus:ring-blue/20 transition-colors"
              >
                <option>Physiotherapist</option>
                <option>Senior Physiotherapist</option>
                <option>Sports Therapist</option>
                <option>Practice Owner</option>
                <option>Admin</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">
                Permissions
              </label>
              <select
                value={newClinicianAuthRole}
                onChange={(e) => setNewClinicianAuthRole(e.target.value as "clinician" | "admin")}
                className="w-full px-3 py-2 rounded-lg border border-border bg-white text-sm text-navy focus:outline-none focus:border-blue focus:ring-1 focus:ring-blue/20 transition-colors"
              >
                <option value="clinician">Clinician — own metrics only</option>
                <option value="admin">Admin — all clinicians + settings</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleAddClinician}
              disabled={!newClinicianName.trim() || !newClinicianEmail.trim() || submittingClinician}
              className="btn-primary" style={{ padding: "8px 16px", fontSize: 12 }}
            >
              <Check size={12} />
              {submittingClinician ? "Adding…" : "Add & Send Invite"}
            </button>
            <button
              onClick={() => { setAddingClinician(false); setNewClinicianName(""); setNewClinicianEmail(""); setNewClinicianAuthRole("clinician"); }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold text-muted hover:text-navy transition-colors"
            >
              <X size={12} />
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2 mt-4">
        {clinicians.map((c) => {
          const isExpanded = expandedClinicianId === c.id;
          const isConfirmingDelete = confirmDeleteId === c.id;

          return (
            <div key={c.id} className="rounded-xl border border-border/50 overflow-hidden">
              {/* Row header — click to expand */}
              <button
                onClick={() => {
                  setExpandedClinicianId(isExpanded ? null : c.id);
                  setConfirmDeleteId(null);
                  setInviteResult((prev) => ({ ...prev, [c.id]: "" }));
                  if (!isExpanded && c.email && !editingEmail[c.id]) {
                    setEditingEmail((prev) => ({ ...prev, [c.id]: c.email ?? "" }));
                  }
                }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-cloud-light/50 transition-colors text-left"
              >
                <div className="w-9 h-9 rounded-full bg-navy flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                  {getInitials(c.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-navy">{c.name}</p>
                  <p className="text-[11px] text-muted">
                    {c.role}
                    {c.email && <span className="ml-1.5 text-muted/60">· {c.email}</span>}
                  </p>
                </div>
                {c.status === "invited" && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 bg-blue/10 text-blue">
                    Invited
                  </span>
                )}
                {c.authRole && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 bg-purple/10 text-purple">
                    {c.authRole === "admin" ? "Admin" : "Clinician"}
                  </span>
                )}
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                    c.active ? "bg-success/10 text-success" : "bg-muted/10 text-muted"
                  }`}
                >
                  {c.active ? "Active" : "Inactive"}
                </span>
                <div
                  className={`transition-transform duration-200 text-muted shrink-0 ${isExpanded ? "rotate-180" : ""}`}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </button>

              {/* Expanded panel */}
              {isExpanded && (
                <div className="border-t border-border/50 px-4 py-4 bg-cloud-light/30 animate-fade-in space-y-4">

                  {/* Send invite email */}
                  <div>
                    <p className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-2">
                      {c.status === "invited" ? "Resend Invite" : "Invite / Re-invite"}
                    </p>
                    <p className="text-[12px] text-muted mb-2">
                      {c.status === "invited"
                        ? "This clinician has been invited but hasn\u2019t signed in yet. Resend the invite email below."
                        : "Enter this clinician\u2019s email address to send them a login invite link directly in-app \u2014 no need to contact support."}
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="email"
                        value={editingEmail[c.id] ?? ""}
                        onChange={(e) =>
                          setEditingEmail((prev) => ({ ...prev, [c.id]: e.target.value }))
                        }
                        placeholder="clinician@example.com"
                        className="flex-1 px-3 py-2 rounded-lg border border-border bg-white text-sm text-navy focus:outline-none focus:border-blue focus:ring-1 focus:ring-blue/20 transition-colors"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSendInvite(c.id);
                        }}
                      />
                      <button
                        onClick={() => handleSendInvite(c.id)}
                        disabled={!editingEmail[c.id]?.trim() || sendingInvite[c.id]}
                        className="btn-primary shrink-0" style={{ padding: "8px 16px", fontSize: 12 }}
                      >
                        {sendingInvite[c.id] ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <ArrowRight size={12} />
                        )}
                        {sendingInvite[c.id] ? "Sending…" : "Send invite"}
                      </button>
                    </div>
                    {inviteResult[c.id] && (
                      <p
                        className={`text-[11px] mt-2 ${
                          inviteResult[c.id].startsWith("Invite sent") ||
                          inviteResult[c.id].startsWith("Link generated")
                            ? "text-success"
                            : "text-danger"
                        }`}
                      >
                        {inviteResult[c.id]}
                      </p>
                    )}
                  </div>

                  {/* Heidi clinical notes opt-in */}
                  <ClinicianHeidiToggle
                    clinician={c}
                    clinicHeidiConnected={clinicHeidiConnected}
                  />

                  {/* Remove clinician */}
                  {canManageTeam && (
                    <div className="pt-2 border-t border-border/30">
                      {!isConfirmingDelete ? (
                        <button
                          onClick={() => setConfirmDeleteId(c.id)}
                          className="flex items-center gap-1.5 text-[12px] font-medium text-muted hover:text-danger transition-colors"
                        >
                          <Trash2 size={13} />
                          Remove {c.name.split(" ")[0]} from team
                        </button>
                      ) : (
                        <div className="flex items-center gap-3 p-3 rounded-xl border border-danger/20 bg-danger/5 animate-fade-in">
                          <p className="text-[12px] text-navy flex-1">
                            Remove <strong>{c.name}</strong> permanently?
                          </p>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-muted border border-border hover:bg-white transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => {
                              handleDeactivateClinician(c.id, c.name);
                              setConfirmDeleteId(null);
                              setExpandedClinicianId(null);
                            }}
                            className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white transition-all hover:opacity-90"
                            style={{ background: brand.danger }}
                          >
                            Yes, remove
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
