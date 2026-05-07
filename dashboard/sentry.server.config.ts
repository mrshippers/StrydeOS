import * as Sentry from "@sentry/nextjs";

import { scrubSentryEvent } from "@/lib/sentry-scrub";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_ENV ?? process.env.NODE_ENV,

  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Log all unhandled promise rejections and uncaught exceptions
  integrations: [
    Sentry.captureConsoleIntegration({ levels: ["error"] }),
  ],

  beforeSend(event, hint) {
    // Drop dev events entirely — never ship local stack traces to Sentry.
    if (process.env.NODE_ENV === "development") return null;
    // Production: walk the event payload and mask PHI/PII fields by key name
    // before forwarding to Sentry. See lib/sentry-scrub.ts.
    return scrubSentryEvent(event, hint);
  },
});
