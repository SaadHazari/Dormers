/**
 * Sentry init — Node.js / server runtime.
 *
 * Guarded by SENTRY_DSN — when the env var is missing, Sentry is a no-op
 * and the app behaves exactly as before. Set the DSN in Netlify env when
 * you're ready to start collecting.
 *
 * Catches uncaught exceptions, unhandled promise rejections, explicit
 * Sentry.captureException(err) calls, AND (via onRequestError export in
 * instrumentation.ts) every unhandled error in App Router server routes /
 * server actions / server components.
 *
 * Pairs with the pino logger (logger.error → log line + breadcrumb;
 * Sentry → alert + trace context).
 */

import * as Sentry from '@sentry/nextjs'

// ── COLD-START BUDGET — read before adding anything here ────────────────
// This module runs during Lambda INIT on every cold start, on a fraction
// of a vCPU. In July 2026 the combination of nodeProfilingIntegration()
// (native V8 profiler) + includeLocalVariables (Node inspector session)
// pushed cold init to ~20s; with render on top, requests crossed Netlify's
// streaming cutoff and every customer landing on a cold instance got a
// truncated RSC stream → the dashboard "Try again" dialog. Those two
// options are banned from this file. Anything added here must be measured
// against production first:
//   npm run check:cold-start   (see scripts/check-cold-start.mjs)
// ─────────────────────────────────────────────────────────────────────────

if (process.env.SENTRY_DSN) {
  const isDev = process.env.NODE_ENV !== 'production'

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.CONTEXT ?? process.env.NODE_ENV ?? 'unknown',

    // Drop error events in development — HMR / Turbopack produces transient
    // ReferenceErrors that aren't real bugs. Traces stay on.
    beforeSend: isDev ? () => null : undefined,

    // 100% in dev, 10% in prod for cost control.
    tracesSampleRate: isDev ? 1.0 : 0.1,

    // Sentry Logs product — server-side logger.* calls show up in the
    // Logs tab in addition to Netlify's log stream.
    enableLogs: true,

    // sendDefaultPii includes IP + request headers. Sentry scrubs cookies
    // and auth tokens before transmission. Useful for cross-referencing
    // server errors with the customer who hit them.
    sendDefaultPii: true,

    integrations: [
      // Vercel AI SDK tracing — the chatbot uses `ai` + `@ai-sdk/google`,
      // so every streamText / generateText call becomes a trace span with
      // model name, prompt tokens, completion tokens, and latency.
      Sentry.vercelAIIntegration(),
      // Mirror console.warn / console.error into Sentry Logs. 'log' was
      // included earlier but the webhook handlers + notifications dispatcher
      // use console.log liberally as breadcrumb output, which was burning
      // the Logs quota for low-value entries. warn + error keep the
      // genuinely interesting code paths.
      Sentry.consoleLoggingIntegration({ levels: ['warn', 'error'] }),
    ],
  })
}
