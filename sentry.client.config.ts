/**
 * Sentry init — browser / client runtime.
 *
 * Guarded by NEXT_PUBLIC_SENTRY_DSN — must be the public DSN since this
 * runs in the user's browser. Captures unhandled exceptions, unhandled
 * promise rejections, and Web Vitals (via the Web Vitals reporter wired
 * in src/app/_components/web-vitals.tsx).
 *
 * No DSN = no-op. Safe to ship without a Sentry account.
 */

import * as Sentry from '@sentry/nextjs'

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV
      ?? process.env.NODE_ENV
      ?? 'unknown',
    // Browser-side trace sampling: cheaper than server (no fan-out).
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    // Replay 0% by default — paid feature gate; turn on later if needed.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    sendDefaultPii: false,
  })
}
