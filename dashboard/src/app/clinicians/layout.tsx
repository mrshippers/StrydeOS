import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Clinicians",
};

export default function CliniciansLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
