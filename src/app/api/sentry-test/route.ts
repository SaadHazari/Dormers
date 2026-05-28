/**
 * One-shot Sentry verification endpoint. Visiting this URL throws an
 * uncaught error, which the Sentry SDK captures and ships to the
 * Issues dashboard.
 *
 * Delete this file once you've confirmed Sentry is wired correctly.
 *
 * Why a dedicated route: Sentry's onboarding screen at
 * dormers.sentry.io waits for a captured EXCEPTION specifically —
 * transactions / Web Vitals / Replay don't dismiss it. This is the
 * cheapest way to fire one.
 */

import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  // Throw inside the request lifecycle so Sentry's onRequestError hook
  // (exported from instrumentation.ts) catches it with full Next.js context.
  throw new Error(
    'Sentry verification: this error is intentional. ' +
    'If you see this in dormers.sentry.io/issues, the SDK is working. ' +
    'Delete src/app/api/sentry-test/route.ts after confirming.',
  )
  // Unreachable; satisfies the route signature.
  return NextResponse.json({ ok: true })
}
