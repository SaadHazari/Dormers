/**
 * Sentry init — Node.js / server runtime.
 *
 * Guarded by SENTRY_DSN — when the env var is missing, Sentry is a no-op
 * and the app behaves exactly as before. This is the safe-by-default
 * pattern: ship the code, set the DSN later in Netlify env when you're
 * ready to start collecting.
 *
 * Catches uncaught exceptions, unhandled promise rejections, and explicit
 * Sentry.captureException(err) calls from anywhere in server code. Pairs
 * with the pino logger (logger.error → log line; Sentry → alert).
 */

import * as Sentry from '@sentry/nextjs'

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.CONTEXT ?? process.env.NODE_ENV ?? 'unknown',
    // Capture 10% of transactions in prod (cost control); 100% in dev.
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    // Don't ship PII without explicit opt-in; the Stripe webhook handler
    // logs payment intent IDs but never card numbers.
    sendDefaultPii: false,
  })
}
