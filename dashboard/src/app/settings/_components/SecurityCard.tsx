"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/ui/Toast";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { AnimatePresence, motion } from "motion/react";
import { Lock, Shield, Loader2, X, CheckCircle2 } from "lucide-react";
import { brand } from "@/lib/brand";

const MfaEnrollment = dynamic(
  () => import("@/components/MfaEnrollment").then((mod) => mod.MfaEnrollment),
  {
    loading: () => <div className="animate-pulse bg-navy/10 rounded-xl h-64" />,
    ssr: false,
  }
);

export default function SecurityCard() {
  const { user, firebaseUser, refreshClinicProfile } = useAuth();
  const { toast } = useToast();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  const [showMfaEnrollment, setShowMfaEnrollment] = useState(false);
  const [mfaToggling, setMfaToggling] = useState(false);
  const [mfaUnenrolling, setMfaUnenrolling] = useState(false);

  async function handleChangePassword() {
    if (!firebaseUser || !currentPassword || !newPassword || !confirmPassword) {
      toast("All password fields are required", "error");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast("New passwords don't match", "error");
      return;
    }

    if (newPassword.length < 10) {
      toast("New password must be at least 10 characters", "error");
      return;
    }

    if (!/[A-Z]/.test(newPassword)) {
      toast("Password must contain at least one uppercase letter", "error");
      return;
    }

    if (!/\d/.test(newPassword)) {
      toast("Password must contain at least one number", "error");
      return;
    }

    if (!/[^A-Za-z0-9]/.test(newPassword)) {
      toast("Password must contain at least one special character", "error");
      return;
    }

    if (newPassword === currentPassword) {
      toast("New password must be different from current password", "error");
      return;
    }

    setChangingPassword(true);
    try {
      const { updatePassword, reauthenticateWithCredential, EmailAuthProvider } = await import("firebase/auth");

      // Reauthenticate user first for security
      const credential = EmailAuthProvider.credential(
        firebaseUser.email!,
        currentPassword
      );
      await reauthenticateWithCredential(firebaseUser, credential);

      // Update password
      await updatePassword(firebaseUser, newPassword);

      // Clear form
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      toast("Password updated successfully", "success");
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string };
      if (error.code === "auth/wrong-password" || error.code === "auth/invalid-credential") {
        toast("Current password is incorrect", "error");
      } else if (error.code === "auth/weak-password") {
        toast("Password is too weak. Use a stronger password.", "error");
      } else {
        toast(error.message ?? "Failed to update password", "error");
      }
    } finally {
      setChangingPassword(false);
    }
  }

  async function handleMfaToggle(enabled: boolean) {
    if (!db || !user?.clinicId) return;

    setMfaToggling(true);
    try {
      await updateDoc(doc(db, "clinics", user.clinicId), {
        "compliance.mfaRequired": enabled,
        updatedAt: new Date().toISOString(),
      });
      await refreshClinicProfile();
      toast(enabled ? "MFA enabled for clinic" : "MFA disabled for clinic", "success");
    } catch (err) {
      console.error("[MFA toggle error]", err);
      toast("Failed to update MFA settings", "error");
    } finally {
      setMfaToggling(false);
    }
  }

  function handleMfaEnrollmentComplete() {
    setShowMfaEnrollment(false);
    toast("Two-factor authentication enabled", "success");
    window.location.reload();
  }

  async function handleMfaUnenroll() {
    if (!firebaseUser) return;

    const mfaRequired = user?.clinicProfile?.compliance?.mfaRequired ?? false;
    if (mfaRequired) {
      toast("MFA cannot be disabled - required by your clinic", "error");
      return;
    }

    if (!confirm("Disable two-factor authentication? Your account will be less secure.")) {
      return;
    }

    setMfaUnenrolling(true);
    try {
      const { multiFactor } = await import("firebase/auth");
      const enrolledFactors = multiFactor(firebaseUser).enrolledFactors;

      if (enrolledFactors.length > 0) {
        await multiFactor(firebaseUser).unenroll(enrolledFactors[0]);
        toast("Two-factor authentication disabled", "success");
        window.location.reload();
      }
    } catch (err) {
      console.error("[MFA unenroll error]", err);
      toast("Failed to disable MFA", "error");
    } finally {
      setMfaUnenrolling(false);
    }
  }

  if (!user) return null;

  return (
    <>
      {/* Change Password */}
      {user.uid !== "demo" && firebaseUser && (
        <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-blue/10 flex items-center justify-center">
              <Lock size={16} className="text-blue" />
            </div>
            <div>
              <h3 className="font-display text-lg text-navy">Change Password</h3>
              <p className="text-xs text-muted">Update your account password</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
                Current Password
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                className="w-full px-3 py-2.5 rounded-[var(--radius-inner)] border border-border bg-cloud-light text-sm text-navy focus:outline-none focus:border-blue focus:ring-1 focus:ring-blue/20 transition-colors"
                disabled={changingPassword}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
                New Password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min 10 chars, uppercase, number, special char"
                className="w-full px-3 py-2.5 rounded-[var(--radius-inner)] border border-border bg-cloud-light text-sm text-navy focus:outline-none focus:border-blue focus:ring-1 focus:ring-blue/20 transition-colors"
                disabled={changingPassword}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
                Confirm New Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                className="w-full px-3 py-2.5 rounded-[var(--radius-inner)] border border-border bg-cloud-light text-sm text-navy focus:outline-none focus:border-blue focus:ring-1 focus:ring-blue/20 transition-colors"
                disabled={changingPassword}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleChangePassword();
                }}
              />
            </div>

            <button
              onClick={handleChangePassword}
              disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
              className="btn-primary"
            >
              {changingPassword ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
              {changingPassword ? "Updating..." : "Update Password"}
            </button>

            <p className="text-[11px] text-muted mt-2">
              At least 10 characters with an uppercase letter, a number, and a special character.
            </p>
          </div>
        </div>
      )}

      {/* Two-Factor Authentication */}
      {user.uid !== "demo" && (
        <div className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-blue/10 flex items-center justify-center">
              <Shield size={16} className="text-blue" />
            </div>
            <div>
              <h3 className="font-display text-lg text-navy">Two-Factor Authentication</h3>
              <p className="text-xs text-muted">Add an extra layer of security to your account</p>
            </div>
          </div>

          {user.mfaEnrolled ? (
            <div>
              <div className="p-4 rounded-xl bg-success/10 border border-success/20 mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 size={16} className="text-success" />
                  <p className="text-sm font-semibold text-success">Two-factor authentication is enabled</p>
                </div>
                <p className="text-xs text-muted">
                  Your account is protected by an authenticator app. You'll need to enter a verification code when signing in.
                </p>
              </div>

              {!user.clinicProfile?.compliance?.mfaRequired && (
                <button
                  onClick={handleMfaUnenroll}
                  disabled={mfaUnenrolling}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-danger border border-danger/20 bg-danger/5 hover:bg-danger/10 transition-colors disabled:opacity-50"
                >
                  {mfaUnenrolling ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                  Disable Two-Factor Authentication
                </button>
              )}
            </div>
          ) : (
            <div>
              <div className="p-4 rounded-xl bg-cloud-light border border-border mb-4">
                <p className="text-xs text-navy">
                  Enable two-factor authentication to add an extra layer of security. You'll need an authenticator app like Google Authenticator or Authy.
                </p>
              </div>

              <button
                onClick={() => setShowMfaEnrollment(true)}
                className="btn-primary"
              >
                <Shield size={14} />
                Enable Two-Factor Authentication
              </button>
            </div>
          )}

          {["owner", "admin", "superadmin"].includes(user.role) && (
            <div className="mt-6 pt-6 border-t border-border">
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <p className="text-sm font-semibold text-navy">Require MFA for all users</p>
                  <p className="text-xs text-muted mt-0.5">
                    {user.clinicProfile?.compliance?.jurisdiction === "us"
                      ? "Required under HIPAA compliance standards"
                      : "Recommended for enhanced security"}
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={user.clinicProfile?.compliance?.mfaRequired ?? false}
                  onChange={(e) => handleMfaToggle(e.target.checked)}
                  disabled={mfaToggling || user.clinicProfile?.compliance?.jurisdiction === "us"}
                  className="h-5 w-5 rounded border-border text-blue focus:ring-2 focus:ring-blue/30 cursor-pointer disabled:opacity-50"
                />
              </label>
              {user.clinicProfile?.compliance?.jurisdiction === "us" && (
                <p className="text-[11px] text-muted mt-2">
                  MFA is automatically required for US clinics under HIPAA compliance.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* MFA Enrollment Modal */}
      <AnimatePresence>
        {showMfaEnrollment && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-navy/60 backdrop-blur-sm z-40"
              onClick={() => setShowMfaEnrollment(false)}
            />
            <div className="fixed inset-0 flex items-center justify-center z-50 p-6">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden p-8"
              >
                <MfaEnrollment
                  onComplete={handleMfaEnrollmentComplete}
                  onSkip={() => setShowMfaEnrollment(false)}
                />
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
