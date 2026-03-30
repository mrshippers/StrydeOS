"use client";

import { useState, useEffect, Component, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { useAuth } from "@/hooks/useAuth";
import Sidebar from "@/components/ui/Sidebar";
import AuthGuard from "@/components/AuthGuard";
import { SidebarProvider, useSidebar } from "@/context/SidebarContext";
import PageTransition from "@/components/PageTransition";
import OnboardingWidget from "@/components/OnboardingWidget";
import AccountSetupWidget from "@/components/AccountSetupWidget";
import TopProgressBar, { ProgressProvider } from "@/components/TopProgressBar";
import StagingBanner from "@/components/StagingBanner";
import SplashScreen from "@/components/SplashScreen";
import TrialBanner from "@/components/TrialBanner";
import DemoBanner from "@/components/ui/DemoBanner";
import ImpersonationBanner from "@/components/ImpersonationBanner";
import ClinicPicker from "@/components/ClinicPicker";

const WhatsNew = dynamic(
  () => import("@/components/WhatsNew"),
  { ssr: false }
);

/** Catch splash screen crashes so they don't take down the whole app */
class SplashErrorBoundary extends Component<{ children: ReactNode; onError: () => void }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.hasError ? null : this.props.children; }
}

const FirstLoginTour = dynamic(
  () => import("@/components/FirstLoginTour"),
  { ssr: false }
);

const InsightEngineUnlocked = dynamic(
  () => import("@/components/InsightEngineUnlocked"),
  { ssr: false }
);

const ChangelogSplash = dynamic(
  () => import("@/components/ChangelogSplash"),
  { ssr: false }
);

const CommandPalette = dynamic(
  () => import("@/components/CommandPalette"),
  { ssr: false }
);

const CHROMELESS_PATHS = ["/login", "/api-docs", "/checkout", "/onboarding", "/trial"];
const IS_STAGING = process.env.NEXT_PUBLIC_APP_ENV === "staging";

function AppLayout({ children, impersonating }: { children: React.ReactNode; impersonating: boolean }) {
  const { collapsed } = useSidebar();

  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-1/2 focus:-translate-x-1/2 focus:z-[200] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-blue focus:text-white focus:text-sm focus:font-medium focus:shadow-lg"
      >
        Skip to main content
      </a>
      <Sidebar />
      <TopProgressBar />
      <motion.main
        id="main-content"
        className={`min-h-screen ${impersonating ? "mt-10" : ""}`}
        animate={isDesktop ? { paddingLeft: collapsed ? 56 : 240 } : { paddingLeft: 0 }}
        transition={{
          duration: 0.55,
          ease: [0.22, 1, 0.36, 1],
          delay: collapsed ? 0.12 : 0,
        }}
      >
        <div className={`mx-auto max-w-[1200px] px-6 py-8 lg:pt-8 ${IS_STAGING ? "pt-24" : "pt-16"}`}>
          <ClinicPicker />
          <TrialBanner />
          <DemoBanner />
          <PageTransition>{children}</PageTransition>
        </div>
      </motion.main>
      <OnboardingWidget />
      <AccountSetupWidget />
      <FirstLoginTour />
      <WhatsNew />
      <InsightEngineUnlocked />
      <ChangelogSplash />
      <CommandPalette />
    </>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, impersonating } = useAuth();
  const isChromeless = CHROMELESS_PATHS.some((p) => pathname.startsWith(p));

  /* ─── Dual-gate splash: animation must finish AND app must hydrate ─── */
  const [animDone, setAnimDone] = useState(false);
  const [appReady, setAppReady] = useState(false);
  const showSplash = !animDone || !appReady;

  useEffect(() => {
    /* App is "ready" once this client effect fires (hydration complete) */
    setAppReady(true);
  }, []);

  return (
    <AuthGuard>
      <ProgressProvider>
        {showSplash && (
          <SplashErrorBoundary onError={() => setAnimDone(true)}>
            <SplashScreen onComplete={() => setAnimDone(true)} />
          </SplashErrorBoundary>
        )}
        <ImpersonationBanner />
        <StagingBanner />
        {isChromeless || !user ? (
          children
        ) : (
          <SidebarProvider>
            <AppLayout impersonating={!!impersonating}>{children}</AppLayout>
          </SidebarProvider>
        )}
      </ProgressProvider>
    </AuthGuard>
  );
}
