"use client";

import { useRouter } from "next/navigation";
import { Eye, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export default function ImpersonationBanner() {
  const { impersonating, impersonationTarget, stopImpersonation } = useAuth();
  const router = useRouter();

  if (!impersonating || !impersonationTarget) return null;

  function handleExit() {
    stopImpersonation();
    router.push("/admin");
  }

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-between px-4 py-2.5"
      style={{ background: "#B45309", borderBottom: "1px solid rgba(255,255,255,0.15)" }}
    >
      <div className="flex items-center gap-2.5">
        <Eye size={14} className="text-amber-200 shrink-0" />
        <p className="text-[12.5px] font-medium text-amber-100">
          Viewing as{" "}
          <span className="font-bold text-white">{impersonationTarget.name}</span>
          <span className="text-amber-200/70 ml-1.5">({impersonationTarget.ownerEmail})</span>
        </p>
      </div>
      <button
        onClick={handleExit}
        className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11.5px] font-semibold text-amber-900 bg-amber-200 hover:bg-white transition-colors"
      >
        <X size={12} />
        Exit
      </button>
    </div>
  );
}
