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

// NEXT_PUBLIC_* env vars are inlined by Next.js at build time via the
// DefinePlugin — only LITERAL property accesses like
// `process.env.NEXT_PUBLIC_FOO` get substituted. Dynamic lookups via
// bracket notation (`process.env[name]`) read the runtime env, which on
// Netlify Functions doesn't include NEXT_PUBLIC_* vars by default. So
// checking those by name from this loop would give false negatives.
//
// We check the non-NEXT_PUBLIC vars dynamically (they're real runtime
// env), and the NEXT_PUBLIC ones via the inlined references below.
const REQUIRED_RUNTIME_ENV_VARS = [
  'SUPABASE_SERVICE_ROLE_KEY',
] as const

const REQUIRED_BUILD_ENV_VARS: Record<string, string | undefined> = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
}

// Sentry — optional. Reported as informational so we can see whether
// observability is wired up without flipping the overall health to degraded.
const SENTRY_ENV_VARS: Record<string, string | undefined> = {
  SENTRY_DSN: process.env.SENTRY_DSN,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
}

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
  sentry: Record<string, 'set' | 'missing'>
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
  const missingRuntime = REQUIRED_RUNTIME_ENV_VARS.filter((name) => !process.env[name])
  const missingBuild = Object.entries(REQUIRED_BUILD_ENV_VARS)
    .filter(([, value]) => !value)
    .map(([name]) => name)
  const missing = [...missingRuntime, ...missingBuild]
  if (missing.length > 0) {
    return { status: 'fail', detail: `missing: ${missing.join(', ')}` }
  }
  return { status: 'ok' }
}

/**
 * Sentry presence — informational only. Tells us whether the SDK should
 * be initializing, without affecting overall health status.
 */
function sentryStatus(): Record<string, 'set' | 'missing'> {
  return Object.fromEntries(
    Object.entries(SENTRY_ENV_VARS).map(([k, v]) => [k, v ? 'set' : 'missing']),
  ) as Record<string, 'set' | 'missing'>
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
    sentry: sentryStatus(),
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

