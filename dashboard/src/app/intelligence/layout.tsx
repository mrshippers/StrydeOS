import type { Metadata } from "next";
import ModuleGuard from "@/components/ModuleGuard";
import ModuleAmbient from "@/components/ui/ModuleAmbient";

export const metadata: Metadata = {
  title: "Intelligence",
};

export default function IntelligenceLayout({ children }: { children: React.ReactNode }) {
  return (
    <ModuleGuard module="intelligence">
      <ModuleAmbient module="intelligence">
        {children}
      </ModuleAmbient>
    </ModuleGuard>
  );
}
