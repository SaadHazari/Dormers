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
 * Sentry hook: when SENTRY_DSN is set, error-level logs are also forwarded
 * to Sentry as breadcrumbs/events via the captured exception (see
 * Sentry.captureException in sentry.server.config). The logger itself stays
 * vendor-neutral; swapping log sinks is a one-file change here.
 */

import pino from 'pino'

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
