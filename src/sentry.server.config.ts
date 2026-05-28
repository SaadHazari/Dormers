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
import { nodeProfilingIntegration } from '@sentry/profiling-node'

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.CONTEXT ?? process.env.NODE_ENV ?? 'unknown',

    // 100% in dev, 10% in prod for cost control.
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    // Continuous profiling — captures CPU samples for traced transactions.
    // profileLifecycle 'trace' ties profile collection to active transactions
    // so we don't profile idle time. Sample rate matches tracing rate.
    profileSessionSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    profileLifecycle: 'trace',

    // Attach local variable values to every stack frame in errors. Makes
    // "why was orderId undefined here?" answerable from the Sentry UI
    // without needing to reproduce locally.
    includeLocalVariables: true,

    // Sentry Logs product — server-side logger.* calls show up in the
    // Logs tab in addition to Netlify's log stream.
    enableLogs: true,

    // sendDefaultPii includes IP + request headers. Sentry scrubs cookies
    // and auth tokens before transmission. Useful for cross-referencing
    // server errors with the customer who hit them.
    sendDefaultPii: true,

    integrations: [
      // Node V8 CPU profiler — uploads sampled profiles for slow requests.
      nodeProfilingIntegration(),
      // Vercel AI SDK tracing — the chatbot uses `ai` + `@ai-sdk/google`,
      // so every streamText / generateText call becomes a trace span with
      // model name, prompt tokens, completion tokens, and latency.
      Sentry.vercelAIIntegration(),
    ],
  })
}
