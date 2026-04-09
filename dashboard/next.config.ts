import type { NextConfig } from "next";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { withSentryConfig } from "@sentry/nextjs";
import createNextIntlPlugin from "next-intl/plugin";
import bundleAnalyzer from "@next/bundle-analyzer";

const withNextIntl = createNextIntlPlugin();
const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === "true" });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const nextConfig: NextConfig = {
  eslint: {
    // Test files and pre-existing adapter warnings block Next.js builds.
    // Lint enforcement runs in CI via `npx eslint` instead.
    ignoreDuringBuilds: true,
  },
  outputFileTracingRoot: resolve(__dirname, ".."),
  serverExternalPackages: [
    "firebase-admin",
    "@google-cloud/firestore",
    "@opentelemetry/api",
  ],
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "motion/react",
      "recharts",
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default withSentryConfig(withBundleAnalyzer(withNextIntl(nextConfig)), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Suppress output when no auth token — avoids "no auth token" noise in CI
  silent: !process.env.SENTRY_AUTH_TOKEN,

  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Tree-shake Sentry debug statements from production bundles (replaces deprecated disableLogger)
  bundleSizeOptimizations: {
    excludeDebugStatements: true,
  },

  // Tunnel Sentry requests through our origin to avoid ad-blockers
  tunnelRoute: "/monitoring",
});
