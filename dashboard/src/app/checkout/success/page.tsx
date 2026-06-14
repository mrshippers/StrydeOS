"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Loader2 } from "lucide-react";
import { StrydeOSLogo } from "@/components/MonolithLogo";
import { ShieldMark } from "@/components/ui/ModuleIcons";
import { brand } from "@/lib/brand";

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
        <span
          className="inline-flex h-16 w-16 items-center justify-center rounded-2xl"
          style={{
            background: `${brand.success}1F`,
            boxShadow: `inset 0 0 0 1px ${brand.success}40, 0 0 40px rgba(5,150,105,0.4)`,
          }}
        >
          <ShieldMark color={brand.success} size={32} />
        </span>
        <div className="text-center">
          <h1 className="font-display text-[28px] text-navy dark:text-white mb-2">
            Payment confirmed
          </h1>
          <p className="text-sm text-navy/70 dark:text-white/60">
            Setting up your account…
          </p>
        </div>
        <Loader2 size={18} className="animate-spin text-navy/55 dark:text-white/40 mt-2" />
      </motion.div>

      <div className="fixed bottom-8">
        <StrydeOSLogo size={28} fontSize={14} theme="dark" gap={8} />
      </div>
    </div>
  );
}
