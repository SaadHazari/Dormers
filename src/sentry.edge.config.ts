/**
 * Sentry init — Edge runtime (middleware + edge route handlers).
 *
 * Same guard as the server config. The middleware in src/middleware.ts runs
 * in this runtime, so any error it raises gets captured here.
 *
 * Note: includeLocalVariables is NOT available in the edge runtime —
 * V8 isolates don't expose the V8 inspector API the Node version uses.
 */

import * as Sentry from '@sentry/nextjs'

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.CONTEXT ?? process.env.NODE_ENV ?? 'unknown',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    enableLogs: true,
    sendDefaultPii: true,
    integrations: [
      Sentry.consoleLoggingIntegration({ levels: ['warn', 'error'] }),
    ],
  })
}
