import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Stryde Super User",
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
