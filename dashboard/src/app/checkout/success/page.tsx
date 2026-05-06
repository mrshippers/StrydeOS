"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Check, Loader2 } from "lucide-react";
import { StrydeOSLogo } from "@/components/MonolithLogo";

/**
 * /checkout/success
 *
 * Stripe redirects here after a successful payment.
 * Shows a brief success animation then forwards to /onboarding —
 * the onboarding page itself redirects established clinics to /dashboard,
 * so this lands new clinics in the wizard and existing customers in-app.
 */
export default function CheckoutSuccessPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Small delay so the user sees the success state
    const t = setTimeout(() => setReady(true), 1800);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (ready) router.replace("/onboarding");
  }, [ready, router]);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{
        background:
          "linear-gradient(135deg, #0B2545 0%, #132D5E 60%, #1C54F2 100%)",
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-col items-center gap-5"
      >
        <div className="w-16 h-16 rounded-full flex items-center justify-center bg-success shadow-[0_0_40px_rgba(5,150,105,0.4)]">
          <Check size={28} className="text-white" strokeWidth={3} />
        </div>
        <div className="text-center">
          <h1 className="font-display text-[28px] text-white mb-2">
            Payment confirmed
          </h1>
          <p className="text-sm text-white/60">
            Setting up your account…
          </p>
        </div>
        <Loader2 size={18} className="animate-spin text-white/40 mt-2" />
      </motion.div>

      <div className="fixed bottom-8">
        <StrydeOSLogo size={28} fontSize={14} theme="dark" gap={8} />
      </div>
    </div>
  );
}
