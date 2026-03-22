"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import Sidebar from "@/components/ui/Sidebar";
import AuthGuard from "@/components/AuthGuard";
import PageTransition from "@/components/PageTransition";
import OnboardingWidget from "@/components/OnboardingWidget";
import TopProgressBar, { ProgressProvider } from "@/components/TopProgressBar";
import StagingBanner from "@/components/StagingBanner";
import SplashScreen from "@/components/SplashScreen";
import TrialBanner from "@/components/TrialBanner";
import ImpersonationBanner from "@/components/ImpersonationBanner";

const FirstLoginTour = dynamic(
  () => import("@/components/FirstLoginTour"),
  { ssr: false }
);

const CommandPalette = dynamic(
  () => import("@/components/CommandPalette"),
  { ssr: false }
);

const CHROMELESS_PATHS = ["/login"];
const IS_STAGING = process.env.NEXT_PUBLIC_APP_ENV === "staging";

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
          <>
            <a
              href="#main-content"
              className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-1/2 focus:-translate-x-1/2 focus:z-[200] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-blue focus:text-white focus:text-sm focus:font-medium focus:shadow-lg"
            >
              Skip to main content
            </a>
            <Sidebar />
            <TopProgressBar />
            <main id="main-content" className={`lg:pl-60 min-h-screen ${impersonating ? "mt-10" : ""}`}>
              <div className={`mx-auto max-w-[1200px] px-6 py-8 lg:pt-8 ${IS_STAGING ? "pt-24" : "pt-16"}`}>
                <TrialBanner />
                <PageTransition>{children}</PageTransition>
              </div>
            </main>
            <OnboardingWidget />
            <FirstLoginTour />
            <CommandPalette />
          </>
        )}
      </ProgressProvider>
    </AuthGuard>
  );
}
