/**
 * captureError — one call to report a failure both as a structured pino log
 * line AND as a Sentry exception (issue, with stack + tags).
 *
 * The audit found six high-blast-radius areas (admin, kitchen, ops, staff,
 * dorm-wars, AI) reporting failures via bare console.error: no alerting, no
 * trace correlation, no Sentry issue. This helper is what those areas switch
 * to in Phase 3/5, so a failed refund / credit issuance / un-notified delivery
 * becomes a queryable log + an alertable Sentry issue instead of a stdout line.
 *
 *   captureError(err, { area: 'kitchen', op: 'getKitchenCounts', token })
 *
 * Both sinks are wrapped so that logging/Sentry can NEVER throw into the
 * request path. Pure observability — zero customer-facing behavior change.
 */

import * as Sentry from '@sentry/nextjs'
import { childLogger } from './logger'

export interface CaptureContext {
  /** Subsystem/area tag, e.g. 'kitchen', 'payments'. Required for grouping. */
  area: string
  /** Operation within the area, e.g. 'getKitchenCounts'. */
  op?: string
  /** Sentry tags (indexed/filterable). Keep low-cardinality. */
  tags?: Record<string, string | number | boolean>
  /** Any additional structured context — logged + attached to Sentry extra. */
  [key: string]: unknown
}

export function captureError(error: unknown, context: CaptureContext): void {
  const { area, op, tags, ...rest } = context

  try {
    childLogger({ area, ...(op ? { op } : {}), ...rest }).error(
      { err: error },
      `${area}${op ? '.' + op : ''} failed`,
    )
  } catch {
    // Logging must never break the request.
  }

  try {
    Sentry.captureException(error, {
      tags: { area, ...(op ? { op } : {}), ...(tags ?? {}) },
      extra: rest,
    })
  } catch {
    // Sentry must never break the request.
  }
}
