"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";
import { brand } from "@/lib/brand";

const PUBLIC_PATHS = ["/login", "/trial", "/onboarding"];
const MFA_EXEMPT_PATHS = ["/login", "/mfa-setup"];

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const isPublicPath = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  const isMfaExempt = MFA_EXEMPT_PATHS.some((p) => pathname.startsWith(p));

  useEffect(() => {
    if (loading) return;

    if (!user && !isPublicPath) {
      router.replace("/login");
      return;
    }

    // User authenticated but missing clinic assignment — broken profile
    if (user && !user.clinicId && !isPublicPath) {
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
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: brand.navy }}>
        <Loader2 size={28} className="animate-spin text-white/50" />
        <p className="text-sm text-white/40">
          {loading ? "Loading…" : "Redirecting to sign in…"}
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
