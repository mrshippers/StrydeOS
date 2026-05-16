import type { Metadata } from "next";
import ModuleGuard from "@/components/ModuleGuard";
import ModuleStrip from "@/components/ui/ModuleStrip";
import ModuleAmbient from "@/components/ui/ModuleAmbient";

export const metadata: Metadata = {
  title: "Pulse",
};

export default function ContinuityLayout({ children }: { children: React.ReactNode }) {
  return (
    <ModuleGuard module="pulse">
      <ModuleAmbient module="pulse">
        <ModuleStrip module="pulse" />
        {children}
      </ModuleAmbient>
    </ModuleGuard>
  );
}
