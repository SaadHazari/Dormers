/**
 * Next.js instrumentation hook — fires once per runtime, before any request.
 *
 * Loads the appropriate Sentry config based on which Next.js runtime is
 * starting. Without this hook the Sentry SDK doesn't bind to global error
 * handlers in App Router + Node 20 runtime.
 *
 * `onRequestError` is the App Router hook that captures every unhandled
 * error in server routes / server actions / server components. Requires
 * @sentry/nextjs >= 8.28.0.
 *
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

// Captures every unhandled server-side request error and forwards it to
// Sentry with full Next.js context (route, method, params).
export const onRequestError = Sentry.captureRequestError
