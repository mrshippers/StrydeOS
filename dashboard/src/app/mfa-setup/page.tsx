"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { MfaEnrollment } from "@/components/MfaEnrollment";
import { Loader2 } from "lucide-react";

export default function MfaSetupPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "linear-gradient(135deg, #0B2545 0%, #132D5E 60%, #1C54F2 100%)" }}
      >
        <Loader2 size={24} className="animate-spin text-white/60" />
      </div>
    );
  }

  const mfaRequired = user.clinicProfile?.compliance?.mfaRequired ?? false;

  return (
    <div
      className="min-h-screen flex items-center justify-center px-6"
      style={{ background: "linear-gradient(135deg, #0B2545 0%, #132D5E 60%, #1C54F2 100%)" }}
    >
      <div className="w-full max-w-2xl rounded-2xl bg-white p-8 shadow-[0_32px_80px_rgba(0,0,0,0.25)]">
        {mfaRequired && (
          <div className="mb-6 p-4 rounded-xl bg-blue/10 border border-blue/20">
            <p className="text-sm text-navy">
              Two-factor authentication is required for your account under HIPAA compliance standards.
              You must complete this setup to access your clinic dashboard.
            </p>
          </div>
        )}

        <MfaEnrollment
          onComplete={() => router.push("/dashboard")}
          onSkip={!mfaRequired ? () => router.push("/dashboard") : undefined}
        />
      </div>
    </div>
  );
}
