"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import Sidebar from "@/components/ui/Sidebar";
import AuthGuard from "@/components/AuthGuard";
import PageTransition from "@/components/PageTransition";
import OnboardingWidget from "@/components/OnboardingWidget";
import FirstLoginTour from "@/components/FirstLoginTour";
import CommandPalette from "@/components/CommandPalette";
import TopProgressBar, { ProgressProvider } from "@/components/TopProgressBar";
import StagingBanner from "@/components/StagingBanner";

const CHROMELESS_PATHS = ["/login"];
const IS_STAGING = process.env.NEXT_PUBLIC_APP_ENV === "staging";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const isChromeless = CHROMELESS_PATHS.some((p) => pathname.startsWith(p));

  return (
    <AuthGuard>
      <ProgressProvider>
        <StagingBanner />
        {isChromeless || !user ? (
          children
        ) : (
          <>
            <Sidebar />
            <TopProgressBar />
            <main className="lg:pl-60 min-h-screen">
              <div className={`mx-auto max-w-[1200px] px-6 py-8 lg:pt-8 ${IS_STAGING ? "pt-24" : "pt-16"}`}>
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
