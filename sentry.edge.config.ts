/**
 * Sentry init — Edge runtime (middleware + edge route handlers).
 *
 * Same guard as the server config. The middleware in src/middleware.ts runs
 * in this runtime, so any error it raises gets captured here.
 */

import * as Sentry from '@sentry/nextjs'

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.CONTEXT ?? process.env.NODE_ENV ?? 'unknown',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    sendDefaultPii: false,
  })
}
