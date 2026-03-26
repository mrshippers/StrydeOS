"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Check, Sparkles } from "lucide-react";

export default function RetriggerTourButton() {
  const { user, refreshClinicProfile } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleRetrigger() {
    if (!user?.uid) return;
    setLoading(true);
    try {
      if (user.uid === "demo") {
        const { clearDemoTourCompleted } = await import("@/components/FirstLoginTour");
        clearDemoTourCompleted();
        setDone(true);
        setTimeout(() => router.push("/dashboard"), 800);
        return;
      }
      if (!db) return;
      await updateDoc(doc(db, "users", user.uid), {
        firstLogin: false,
        tourCompleted: false,
        updatedAt: new Date().toISOString(),
        updatedBy: user.uid,
      });
      await refreshClinicProfile();
      setDone(true);
      setTimeout(() => router.push("/dashboard"), 800);
    } catch (err) {
      console.error("[RetriggerTour]", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={handleRetrigger}
        disabled={loading || done}
        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border border-blue/30 text-blue bg-blue/5 hover:bg-blue/10 transition-all disabled:opacity-50"
      >
        {loading ? (
          <Loader2 size={14} className="animate-spin" />
        ) : done ? (
          <Check size={14} className="text-success" />
        ) : (
          <Sparkles size={14} />
        )}
        {done ? "Heading to dashboard…" : loading ? "Resetting…" : "Replay welcome tour"}
      </button>
      <p className="text-[11px] text-muted-strong mt-1.5">
        Resets your tour state and redirects to the dashboard so the welcome screen fires again.
      </p>
    </div>
  );
}
