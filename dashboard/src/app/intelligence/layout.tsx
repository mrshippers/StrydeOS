import type { Metadata } from "next";
import ModuleGuard from "@/components/ModuleGuard";
import ModuleStrip from "@/components/ui/ModuleStrip";
import ModuleAmbient from "@/components/ui/ModuleAmbient";

export const metadata: Metadata = {
  title: "Intelligence",
};

export default function IntelligenceLayout({ children }: { children: React.ReactNode }) {
  return (
    <ModuleGuard module="intelligence">
      <ModuleAmbient module="intelligence">
        <ModuleStrip module="intelligence" />
        {children}
      </ModuleAmbient>
    </ModuleGuard>
  );
}
