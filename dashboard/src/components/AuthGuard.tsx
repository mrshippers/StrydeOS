"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";
import { MonolithMark } from "@/components/MonolithLogo";

const PUBLIC_PATHS = ["/login", "/trial", "/onboarding", "/intake"];
const MFA_EXEMPT_PATHS = ["/login", "/mfa-setup"];

function matchesPath(pathname: string, paths: string[]): boolean {
  return paths.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const isPublicPath = matchesPath(pathname, PUBLIC_PATHS);
  const isMfaExempt = matchesPath(pathname, MFA_EXEMPT_PATHS);

  useEffect(() => {
    if (loading) return;

    if (!user && !isPublicPath) {
      router.replace("/login");
      return;
    }

    // User authenticated but missing clinic assignment — broken profile
    // Superadmin users don't need a clinicId (they access all clinics via /admin)
    if (user && !user.clinicId && user.role !== "superadmin" && !isPublicPath) {
      console.error("[AuthGuard] User has no clinicId — broken profile, redirecting to login", user.uid);
      router.replace("/login");
      return;
    }

    if (user && !isMfaExempt) {
      const mfaRequired = user.clinicProfile?.compliance?.mfaRequired ?? false;
      if (mfaRequired && !user.mfaEnrolled) {
        router.replace("/mfa-setup");
      }
    }
  }, [user, loading, isPublicPath, isMfaExempt, router]);

  if (loading || (!user && !isPublicPath)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-cloud-dancer px-6">
        <div className="flex flex-col items-center gap-5 animate-fade-in">
          <div className="monolith-pulse">
            <MonolithMark size={56} />
          </div>
          <div className="flex flex-col items-center gap-2.5">
            <span
              className="text-[19px] font-bold tracking-[-0.02em] text-navy"
              style={{ fontFamily: "'Outfit', sans-serif" }}
            >
              Stryde<span className="text-blue dark:text-blue-glow">OS</span>
            </span>
            <div className="flex items-center gap-2 text-[13px] text-muted">
              <Loader2 size={13} className="animate-spin" />
              <span>{loading ? "Loading your workspace…" : "Redirecting to sign in…"}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
