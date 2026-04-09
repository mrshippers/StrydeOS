import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_ENV ?? process.env.NODE_ENV,

  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Capture replays for 5% of sessions in production, 100% when errors occur
  replaysSessionSampleRate: process.env.NODE_ENV === "production" ? 0.05 : 1.0,
  replaysOnErrorSampleRate: 1.0,

  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],

  // Filter out browser extension and known-benign noise
  ignoreErrors: [
    "ResizeObserver loop limit exceeded",
    "ResizeObserver loop completed with undelivered notifications",
    "Non-Error promise rejection captured",
    /^Network Error$/,
  ],

  beforeSend(event) {
    if (process.env.NODE_ENV === "development") return null;
    return event;
  },
});
