/**
 * Sentry debug probe — bypasses the throw → onRequestError chain.
 *
 * Calls Sentry.captureMessage directly and reports what the SDK thinks
 * its own state is. Tells us:
 *   - Whether Sentry.init actually fired (getClient() returns truthy)
 *   - Whether captureMessage returns an event ID (event accepted by SDK)
 *
 * If captureMessage lands in Sentry but /api/sentry-test does NOT,
 * the bug is in the onRequestError export / throw-capture wiring.
 *
 * Delete this file after diagnosis.
 */

import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const client = Sentry.getClient()
  const eventId = Sentry.captureMessage(
    'sentry-debug probe — if you see this in Issues, init is alive',
    'info',
  )
  // Force flush so the message ships before the function returns (Netlify
  // can tear down the function immediately after response, killing pending sends).
  await Sentry.flush(2000)

  return NextResponse.json({
    clientPresent: !!client,
    clientDsn: client?.getDsn()?.publicKey
      ? `set (key starts with ${client.getDsn()?.publicKey?.slice(0, 8)}...)`
      : 'missing',
    captureMessageEventId: eventId,
    sentryDsnEnvSet: !!process.env.SENTRY_DSN,
    nextPublicSentryDsnEnvSet: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  })
}
