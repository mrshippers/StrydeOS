"use client";

import { useRouter } from "next/navigation";
import { Eye, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { brand } from "@/lib/brand";

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
      style={{
        // Soft bottom fade instead of a 1px solid divider — blends into the page.
        background: `linear-gradient(180deg, ${brand.warning} 0%, ${brand.warning} 78%, rgba(245,158,11,0.78) 100%)`,
        boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
      }}
    >
      <div className="flex items-center gap-2.5">
        <Eye size={14} className="text-ink shrink-0" />
        <p className="text-[12.5px] font-medium text-ink">
          Viewing as{" "}
          <span className="font-bold">{impersonationTarget.name}</span>
          <span className="text-ink/70 ml-1.5">({impersonationTarget.ownerEmail})</span>
        </p>
      </div>
      <button
        onClick={handleExit}
        className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11.5px] font-semibold text-ink bg-cloud-light hover:bg-white transition-colors"
      >
        <X size={12} />
        Exit
      </button>
    </div>
  );
}
