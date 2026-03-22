import type { Metadata } from "next";
import { DM_Serif_Display, Outfit } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { AuthProvider } from "@/hooks/useAuth";
import { ThemeProvider } from "@/components/ThemeProvider";
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
  icons: {
    icon: [
      { url: '/icon', type: 'image/png', sizes: '32x32' },
    ],
    apple: [
      { url: '/apple-icon', type: 'image/png', sizes: '180x180' },
    ],
  },
  openGraph: {
    title: "StrydeOS — Clinical Performance Dashboard",
    description: "The operational interface for StrydeOS — the clinical performance platform for private physiotherapy practices.",
    siteName: "StrydeOS",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "StrydeOS — Clinical Performance Dashboard",
    description: "The operational interface for StrydeOS — the clinical performance platform for private physiotherapy practices.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${dmSerif.variable} ${outfit.variable}`} suppressHydrationWarning>
      <body className="font-body antialiased">
        <ThemeProvider>
          <AuthProvider>
            <ToastProvider>
              <AppShell>{children}</AppShell>
            </ToastProvider>
          </AuthProvider>
        </ThemeProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
