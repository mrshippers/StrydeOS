"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import Sidebar from "@/components/ui/Sidebar";
import AuthGuard from "@/components/AuthGuard";
import { SidebarProvider, useSidebar } from "@/context/SidebarContext";
import PageTransition from "@/components/PageTransition";
import OnboardingWidget from "@/components/OnboardingWidget";
import TopProgressBar, { ProgressProvider } from "@/components/TopProgressBar";
import StagingBanner from "@/components/StagingBanner";
import SplashScreen from "@/components/SplashScreen";
import TrialBanner from "@/components/TrialBanner";
import DemoBanner from "@/components/ui/DemoBanner";
import ImpersonationBanner from "@/components/ImpersonationBanner";

const FirstLoginTour = dynamic(
  () => import("@/components/FirstLoginTour"),
  { ssr: false }
);

const InsightEngineUnlocked = dynamic(
  () => import("@/components/InsightEngineUnlocked"),
  { ssr: false }
);

const CommandPalette = dynamic(
  () => import("@/components/CommandPalette"),
  { ssr: false }
);

const CHROMELESS_PATHS = ["/login", "/api-docs"];
const IS_STAGING = process.env.NEXT_PUBLIC_APP_ENV === "staging";

function AppLayout({ children, impersonating }: { children: React.ReactNode; impersonating: boolean }) {
  const { collapsed } = useSidebar();

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
      <main
        id="main-content"
        className={`min-h-screen transition-[padding-left] duration-[650ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
          collapsed ? "lg:pl-14" : "lg:pl-60"
        } ${impersonating ? "mt-10" : ""}`}
      >
        <div className={`mx-auto max-w-[1200px] px-6 py-8 lg:pt-8 ${IS_STAGING ? "pt-24" : "pt-16"}`}>
          <TrialBanner />
          <DemoBanner />
          <PageTransition>{children}</PageTransition>
        </div>
      </main>
      <OnboardingWidget />
      <FirstLoginTour />
      <InsightEngineUnlocked />
      <CommandPalette />
    </>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, impersonating } = useAuth();
  const isChromeless = CHROMELESS_PATHS.some((p) => pathname.startsWith(p));

  return (
    <AuthGuard>
      <ProgressProvider>
        <SplashScreen />
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
