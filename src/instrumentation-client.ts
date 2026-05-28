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
    //
    // TEMPORARILY 1.0 for Sentry onboarding verification. Once Sentry's
    // Replay onboarding screen shows the first replay, dial this back to
    // 0 (or 0.05) so the free tier's 50-replays-per-month quota goes to
    // error sessions instead of random healthy ones.
    replaysSessionSampleRate: 1.0,
    replaysOnErrorSampleRate: 1.0,

    // Sentry's Logs product — Sentry.logger.* calls land in the Logs tab.
    enableLogs: true,

    // sendDefaultPii includes IP + request headers. Sentry's built-in
    // scrubbers strip cookies / auth tokens / known credential headers
    // before transmission. Useful for "which user / region had this error."
    sendDefaultPii: true,

    integrations: [
      Sentry.replayIntegration(),
      // Floating "Report a bug" widget in the bottom corner. Triggers a
      // form that captures user-submitted feedback as a Sentry event with
      // a screenshot. Themed dark-by-default to match the dashboard's
      // intentional light/marketing-dark split.
      Sentry.feedbackIntegration({
        colorScheme: 'system',
        buttonLabel: 'Report an issue',
        submitButtonLabel: 'Send',
        formTitle: 'Tell us what happened',
        showBranding: false,
      }),
    ],
  })
}

// Hook into App Router navigation transitions — every soft navigation
// becomes a trace transaction. Required export per Sentry's Next.js SDK.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
