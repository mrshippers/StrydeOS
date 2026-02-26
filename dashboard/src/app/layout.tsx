import type { Metadata } from "next";
import { DM_Serif_Display, Outfit } from "next/font/google";
import { AuthProvider } from "@/hooks/useAuth";
import AppShell from "@/components/AppShell";
import { ToastProvider } from "@/components/ui/Toast";
import "./globals.css";

const dmSerif = DM_Serif_Display({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "StrydeOS — Clinical Performance Dashboard",
    template: "%s — StrydeOS",
  },
  description:
    "The operational interface for StrydeOS — the clinical performance platform for private physiotherapy practices.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${dmSerif.variable} ${outfit.variable}`}>
      <body className="font-body antialiased">
        <AuthProvider>
          <ToastProvider>
            <AppShell>{children}</AppShell>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
