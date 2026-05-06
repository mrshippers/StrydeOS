"use client";

import { useEffect, useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { Loader2, Save } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/ui/Toast";

export default function ProfileCard() {
  const { user, firebaseUser, refreshClinicProfile } = useAuth();
  const { toast } = useToast();

  const [profileFirstName, setProfileFirstName] = useState("");
  const [profileLastName, setProfileLastName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    if (!user) return;
    setProfileFirstName(user.firstName ?? "");
    setProfileLastName(user.lastName ?? "");
  }, [user]);

  async function handleSaveUserProfile() {
    if (!firebaseUser?.uid || !db) return;
    const trimFirst = profileFirstName.trim();
    const trimLast = profileLastName.trim();
    if (!trimFirst || !trimLast) {
      toast("Please enter both your first and last name", "error");
      return;
    }
    setSavingProfile(true);
    try {
      await updateDoc(doc(db, "users", firebaseUser.uid), {
        firstName: trimFirst,
        lastName: trimLast,
        updatedAt: new Date().toISOString(),
      });
      await refreshClinicProfile();
      toast("Profile updated", "success");
    } catch {
      toast("Failed to update profile", "error");
    } finally {
      setSavingProfile(false);
    }
  }

  const isDirty =
    profileFirstName !== (user?.firstName ?? "") ||
    profileLastName !== (user?.lastName ?? "");

  return (
    <div id="profile-section" className="rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] p-6">
      <h3 className="font-display text-lg text-navy mb-1">Your Profile</h3>
      <p className="text-xs text-muted mb-4">How your name appears across StrydeOS</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-semibold text-navy/60 uppercase tracking-wider mb-1.5">First name</label>
          <input
            type="text"
            value={profileFirstName}
            onChange={(e) => setProfileFirstName(e.target.value)}
            placeholder="First name"
            className="w-full px-3 py-2 rounded-xl border border-border text-sm text-navy focus:border-blue focus:ring-1 focus:ring-blue/20 outline-none transition-colors"
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-navy/60 uppercase tracking-wider mb-1.5">Last name</label>
          <input
            type="text"
            value={profileLastName}
            onChange={(e) => setProfileLastName(e.target.value)}
            placeholder="Last name"
            className="w-full px-3 py-2 rounded-xl border border-border text-sm text-navy focus:border-blue focus:ring-1 focus:ring-blue/20 outline-none transition-colors"
          />
        </div>
      </div>
      {isDirty && (
        <div className="flex justify-end mt-4">
          <button
            onClick={handleSaveUserProfile}
            disabled={savingProfile}
            className="btn-primary" style={{ padding: "8px 16px", fontSize: 12 }}
          >
            {savingProfile ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            Save profile
          </button>
        </div>
      )}
    </div>
  );
}
