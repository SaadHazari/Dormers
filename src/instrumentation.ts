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

    // Release It! hardening (Phase 0): boot-time env validation in WARN-ONLY mode.
    // Surfaces missing/invalid config in the boot log so a misconfigured deploy is
    // visible immediately instead of failing customer-facing hours later. It does
    // NOT throw yet — Phase 8 flips this to fail-fast once every environment is
    // confirmed clean. Wrapped so the validator can never break startup. Zero
    // request-path / customer impact.
    try {
      const { validateEnv } = await import('@/infra/config/env-schema')
      const { logger } = await import('@/infra/logging/logger')
      const result = validateEnv()
      if (result.ok) {
        logger.info(
          { context: result.context, checked: result.checked },
          'env validation passed (warn-only)',
        )
      } else {
        logger.warn(
          {
            context: result.context,
            missing: result.missing.map((r) => r.key),
            invalid: result.invalid.map((r) => r.key),
          },
          'env validation found issues (warn-only — not blocking boot)',
        )
      }
    } catch (err) {
      // Never let env validation break boot.
      console.error('[env-validation] skipped due to error', err)
    }
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

// Captures every unhandled server-side request error and forwards it to
// Sentry with full Next.js context (route, method, params).
export const onRequestError = Sentry.captureRequestError
