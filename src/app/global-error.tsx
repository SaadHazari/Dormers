'use client'

/**
 * Root error boundary for the App Router.
 *
 * Catches errors thrown by the root layout itself + React render errors
 * that escape every nested error.tsx. Without this, those errors crash
 * the whole React tree silently. With it, Sentry sees them and the user
 * gets the default Next.js error page instead of a blank screen.
 *
 * Per the Sentry Next.js SDK guide: this file must be a client component
 * (`'use client'` directive on line 1) and live at app/global-error.tsx.
 */

import * as Sentry from '@sentry/nextjs'
import NextError from 'next/error'
import { useEffect } from 'react'

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string }
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html>
      <body>
        <NextError statusCode={0} />
      </body>
    </html>
  )
}
