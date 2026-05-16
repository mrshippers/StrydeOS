import type { Metadata } from "next";
import ModuleGuard from "@/components/ModuleGuard";
import ModuleStrip from "@/components/ui/ModuleStrip";
import ModuleAmbient from "@/components/ui/ModuleAmbient";

export const metadata: Metadata = {
  title: "Ava",
};

export default function ReceptionistLayout({ children }: { children: React.ReactNode }) {
  return (
    <ModuleGuard module="ava">
      <ModuleAmbient module="ava">
        <ModuleStrip module="ava" />
        {children}
      </ModuleAmbient>
    </ModuleGuard>
  );
}
