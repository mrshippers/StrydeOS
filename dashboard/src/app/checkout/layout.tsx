import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Checkout — StrydeOS",
  description: "Complete your StrydeOS subscription.",
};

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
