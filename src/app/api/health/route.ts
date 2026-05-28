/**
 * /api/health — deep health check.
 *
 * Returns 200 with a per-check breakdown when everything is reachable;
 * 503 if any required check fails. Netlify can route on this, ops can
 * curl it, and uptime monitors (UptimeRobot, BetterStack, etc.) can
 * poll it as the canonical "is the site up" signal.
 *
 * Checks (cheap by design — must complete in well under a second):
 *   • supabase  — SELECT 1 against the customers table
 *   • envVars   — presence (not value) of the critical service creds
 *
 * Vendor pings (Stripe, Zoho, ZeptoMail, Meta) are deliberately out of
 * scope — they'd add latency + cost + cascading-failure risk. A vendor
 * being down doesn't mean *we* should report unhealthy; the route
 * handlers' own timeouts + retries cover that case.
 */

import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { logger } from '@/infra/logging/logger'

// Skip Next.js's static optimization — health must reflect runtime state.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Required env vars for the app to function at all. Missing any = degraded.
const REQUIRED_ENV_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const

type CheckStatus = 'ok' | 'fail'

interface CheckResult {
  status: CheckStatus
  detail?: string
  durationMs?: number
}

interface HealthPayload {
  status: 'ok' | 'degraded'
  service: 'dormers-web'
  timestamp: string
  checks: Record<string, CheckResult>
}

async function checkSupabase(): Promise<CheckResult> {
  const started = Date.now()
  try {
    const sb = createAdminSupabaseClient()
    const { error } = await sb.from('customers').select('id', { head: true, count: 'exact' }).limit(1)
    if (error) {
      return { status: 'fail', detail: error.message, durationMs: Date.now() - started }
    }
    return { status: 'ok', durationMs: Date.now() - started }
  } catch (err) {
    return {
      status: 'fail',
      detail: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - started,
    }
  }
}

function checkEnvVars(): CheckResult {
  const missing = REQUIRED_ENV_VARS.filter((name) => !process.env[name])
  if (missing.length > 0) {
    return { status: 'fail', detail: `missing: ${missing.join(', ')}` }
  }
  return { status: 'ok' }
}

export async function GET() {
  const [supabase, envVars] = await Promise.all([
    // Supabase check has its own timeout via fetchWithTimeout-equivalent (the
    // SDK uses its own); wrap defensively in case it ever hangs forever.
    withTimeout(checkSupabase(), 3_000, 'supabase'),
    Promise.resolve(checkEnvVars()),
  ])

  const checks = { supabase, envVars }
  const healthy = Object.values(checks).every((c) => c.status === 'ok')

  const payload: HealthPayload = {
    status: healthy ? 'ok' : 'degraded',
    service: 'dormers-web',
    timestamp: new Date().toISOString(),
    checks,
  }

  if (!healthy) {
    logger.warn({ checks }, 'health check reported degraded')
    return NextResponse.json(payload, { status: 503 })
  }
  return NextResponse.json(payload, { status: 200 })
}

/**
 * Cap a check's duration. Any pending operation past `timeoutMs` reports
 * as a failure rather than blocking the response.
 */
async function withTimeout<T extends CheckResult>(
  p: Promise<T>,
  timeoutMs: number,
  checkName: string,
): Promise<CheckResult> {
  return Promise.race([
    p,
    new Promise<CheckResult>((resolve) =>
      setTimeout(() => resolve({
        status: 'fail',
        detail: `check '${checkName}' exceeded ${timeoutMs}ms`,
        durationMs: timeoutMs,
      }), timeoutMs),
    ),
  ])
}

