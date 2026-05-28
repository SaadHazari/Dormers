'use client'

/**
 * WebVitalsReporter — registers Next.js's useReportWebVitals callback so
 * every Core Web Vital (LCP, INP, CLS, TTFB, FCP, FID) flows through
 * a single sink.
 *
 * Two sinks today:
 *   1. Sentry — captureMeasurement when @sentry/nextjs is initialized
 *      (i.e. NEXT_PUBLIC_SENTRY_DSN is set). Sentry tracks p75 of each
 *      metric in its Performance dashboard out of the box.
 *   2. console.debug — visible in dev tools without leaving the page.
 *
 * Lives in ui-system/observability/ because it's a cross-context UI
 * concern (every page reports vitals; no context owns the metric).
 *
 * To add a third sink (e.g. a custom /api/vitals endpoint or Datadog RUM),
 * append it inside the callback below — keep this file the single point
 * where Web Vitals fan out.
 */

import { useReportWebVitals } from 'next/web-vitals'
import * as Sentry from '@sentry/nextjs'

export function WebVitalsReporter(): null {
  useReportWebVitals((metric) => {
    // Sentry — only fires when the client DSN is configured.
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      Sentry.setMeasurement(metric.name, metric.value, vitalUnit(metric.name))
    }

    // Dev visibility — every refresh logs the metric to the browser console.
    if (process.env.NODE_ENV !== 'production') {
      console.debug(
        `[web-vital] ${metric.name}=${Math.round(metric.value)}${vitalUnit(metric.name)}`,
        { id: metric.id, rating: 'rating' in metric ? metric.rating : undefined },
      )
    }
  })

  return null
}

/**
 * CLS is unitless (a layout-shift score). Every other vital is a duration
 * in milliseconds. Returning the right unit string keeps Sentry's
 * dashboards labelling things correctly.
 */
function vitalUnit(name: string): 'millisecond' | '' {
  return name === 'CLS' ? '' : 'millisecond'
}
