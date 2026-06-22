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

    // Release It! hardening: boot-time env validation.
    // Phase 8 — FAIL FAST on missing CRITICAL keys (the Supabase trio; no
    // fallback, app is dead without them), so a catastrophically misconfigured
    // deploy crashes loudly at boot instead of serving broken for hours. These
    // are provably present in prod, so this can't be a false positive. All other
    // (vendor / fallback-having) keys stay WARN-ONLY — a missing Zoho/ZeptoMail
    // key degrades one feature and must NOT take down the whole app.
    {
      const { validateEnv } = await import('@/infra/config/env-schema')
      const { logger } = await import('@/infra/logging/logger')
      const result = validateEnv()
      if (result.missingCritical.length > 0) {
        const keys = result.missingCritical.map((r) => r.key).join(', ')
        try {
          logger.fatal(
            { context: result.context, missingCritical: result.missingCritical.map((r) => r.key) },
            'FATAL: missing critical environment config — refusing to boot',
          )
        } catch { /* logging must not mask the throw */ }
        throw new Error(`Missing critical environment config: ${keys}`)
      }
      try {
        if (result.ok) {
          logger.info({ context: result.context, checked: result.checked }, 'env validation passed')
        } else {
          logger.warn(
            {
              context: result.context,
              missing: result.missing.map((r) => r.key),
              invalid: result.invalid.map((r) => r.key),
            },
            'env validation found non-critical issues (warn-only — not blocking boot)',
          )
        }
      } catch {
        // Warn-path logging must never break boot; the critical check above already ran.
      }
    }
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

// Captures every unhandled server-side request error and forwards it to
// Sentry with full Next.js context (route, method, params).
export const onRequestError = Sentry.captureRequestError
