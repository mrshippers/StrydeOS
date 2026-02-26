import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Intelligence",
};

export default function IntelligenceLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
