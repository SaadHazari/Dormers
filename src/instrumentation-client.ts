/**
 * Sentry init — browser / client runtime.
 *
 * File name matches the current Sentry Next.js SDK pattern
 * (`instrumentation-client.ts`, not the older `sentry.client.config.ts`).
 *
 * Init is guarded by NEXT_PUBLIC_SENTRY_DSN — when missing, Sentry is a
 * no-op. Safe to ship without a Sentry account; set the env var in Netlify
 * when you're ready to start collecting.
 */

import * as Sentry from '@sentry/nextjs'

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV
      ?? process.env.NODE_ENV
      ?? 'unknown',

    // Trace sampling: 100% in dev so every nav is visible; 10% in prod for cost.
    tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,

    // Session Replay — records the DOM mutations around an error so you can
    // see what the user did. Sentry masks all input fields by default; we
    // don't enable canvas recording (would balloon payload).
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,

    // Sentry's Logs product — Sentry.logger.* calls land in the Logs tab.
    enableLogs: true,

    // sendDefaultPii includes IP + request headers. Sentry's built-in
    // scrubbers strip cookies / auth tokens / known credential headers
    // before transmission. Useful for "which user / region had this error."
    sendDefaultPii: true,

    integrations: [
      Sentry.replayIntegration(),
    ],
  })
}

// Hook into App Router navigation transitions — every soft navigation
// becomes a trace transaction. Required export per Sentry's Next.js SDK.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
