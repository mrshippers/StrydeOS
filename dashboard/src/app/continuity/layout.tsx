import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Patient Continuity",
};

export default function ContinuityLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
