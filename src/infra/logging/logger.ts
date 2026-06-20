/**
 * Structured logger — pino, JSON output by default.
 *
 * Replaces ad-hoc console.log/console.error calls. Every log line is a JSON
 * object with `level`, `time`, `msg`, plus any context fields the caller
 * attached. Netlify's log search treats each field as a queryable key, so
 * "find every webhook that failed for customer X" becomes a single query
 * instead of grepping unstructured strings.
 *
 * Lives in infra/ per L1 — logging is an outer-ring concern. Use-cases
 * receive a child logger so the context (customerId, orderId, …) flows
 * automatically without each function building its own log strings.
 *
 * Dev: pino-pretty wraps the JSON for human reading.
 * Prod: raw JSON; Netlify / future log aggregator (Axiom, Datadog) parses it.
 *
 * Sentry forwarding: every log line at info+ is mirrored to Sentry's Logs
 * product via Sentry.logger.*. info/warn/error/fatal map to their Sentry
 * equivalents. debug stays Netlify-only (too chatty for Sentry's quota).
 * Forwarding is a no-op when Sentry.init hasn't run (no DSN, or pre-init
 * boot logs), so this is safe in every runtime.
 */

import pino from 'pino'
import * as Sentry from '@sentry/nextjs'

const isDev = process.env.NODE_ENV !== 'production'

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info'),
  base: {
    // Tag every log line with the environment so multi-env aggregators don't
    // confuse staging traffic with production. Netlify exposes CONTEXT
    // ('production' / 'deploy-preview' / 'branch-deploy') — fall back to
    // NODE_ENV when running locally.
    env: process.env.CONTEXT ?? process.env.NODE_ENV ?? 'unknown',
    service: 'dormers-web',
  },
  // Redact common credential field names so a careless `logger.info({ user })`
  // can't leak tokens / keys / passwords into the log stream.
  redact: {
    paths: [
      '*.password',
      '*.token',
      '*.api_key',
      '*.apiKey',
      '*.secret',
      'req.headers.authorization',
      'req.headers.cookie',
    ],
    censor: '[REDACTED]',
  },
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss.l',
          ignore: 'pid,hostname,env,service',
        },
      }
    : undefined,
})

/**
 * Build a child logger with persistent context — every line emitted by the
 * returned logger carries these fields, no repetition at the call site.
 *
 *   const log = childLogger({ requestId, userId })
 *   log.info('skipping meal')           → { ..., requestId, userId, msg: 'skipping meal' }
 *   log.error({ err }, 'flip failed')   → { ..., requestId, userId, err: {...}, msg: 'flip failed' }
 */
export function childLogger(context: Record<string, unknown>) {
  return logger.child(context)
}

// ── Sentry log forwarding ────────────────────────────────────────────────
// Mirror info+ pino logs into Sentry's Logs product. Sentry's logger.* API
// is a no-op when the SDK hasn't initialized (no DSN, or running outside a
// request context), so wrapping pino's methods is safe in every runtime.
//
// We hook AFTER constructing the pino instance so dev still gets pretty
// output AND production gets both Netlify stream + Sentry Logs.
const sentryLevelMap = {
  info: 'info',
  warn: 'warn',
  error: 'error',
  fatal: 'fatal',
} as const

type SentryLevelKey = keyof typeof sentryLevelMap

// pino's `redact` only scrubs pino's own serialized output — the raw object we
// hand to Sentry below is untouched by it. Deep-clone + censor credential-named
// keys here so secrets don't reach Sentry in cleartext. Mirrors (and slightly
// widens) the pino redact paths above.
const SENSITIVE_KEYS = new Set([
  'password', 'token', 'api_key', 'apikey', 'secret', 'authorization', 'cookie',
])

function redactSensitive(value: unknown, seen = new WeakSet<object>(), depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== 'object') return value
  if (seen.has(value as object)) return '[Circular]'
  seen.add(value as object)

  if (Array.isArray(value)) {
    return value.map((v) => redactSensitive(v, seen, depth + 1))
  }
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEYS.has(k.toLowerCase())
      ? '[REDACTED]'
      : redactSensitive(v, seen, depth + 1)
  }
  return out
}

function forwardToSentry(
  level: SentryLevelKey,
  arg1: unknown,
  arg2: unknown,
): void {
  if (!Sentry.getClient()) return // SDK not initialized → nothing to do.

  // pino calling convention: logger.info(obj, msg) or logger.info(msg).
  // Normalize to (msg, attributes) for Sentry.
  let msg: string
  let attributes: Record<string, unknown> | undefined
  if (typeof arg1 === 'string') {
    msg = arg1
  } else if (arg1 && typeof arg1 === 'object') {
    attributes = arg1 as Record<string, unknown>
    msg = typeof arg2 === 'string' ? arg2 : (attributes.msg as string) ?? ''
  } else {
    msg = String(arg1 ?? '')
  }

  try {
    const safeAttributes =
      attributes && (redactSensitive(attributes) as Record<string, unknown>)
    Sentry.logger[sentryLevelMap[level]](msg, safeAttributes || undefined)
  } catch {
    // Never let log forwarding break the request.
  }
}

for (const level of Object.keys(sentryLevelMap) as SentryLevelKey[]) {
  const original = logger[level].bind(logger)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(logger as any)[level] = (arg1: unknown, arg2?: unknown, ...rest: unknown[]) => {
    forwardToSentry(level, arg1, arg2)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (original as any)(arg1, arg2, ...rest)
  }
}
