/**
 * withOwnedSubscription — auth + ownership-loading higher-order helper.
 *
 * Every server action in subscription-mutations.ts repeats this opening:
 *
 *   const auth = await requireUser();
 *   if (!auth.ok) return { error: auth.error };
 *   const subResult = await loadOwnedSubscription(auth.supabase, subId, auth.user.id);
 *   if (!subResult.ok) return { error: subResult.error };
 *   const { subscription } = subResult;
 *
 * Five lines of skeleton repeated eight times. This helper hides that
 * skeleton; the body receives a typed context with auth + subscription
 * already resolved and can focus on the actual mutation.
 *
 * Per Pragmatic Programmer DRY + Ousterhout's "kill pass-throughs": the
 * skeleton was knowledge replicated across files. One home now.
 *
 * Usage:
 *   export async function pauseSubscription(subscriptionId: string) {
 *     return withOwnedSubscription(subscriptionId, async (ctx) => {
 *       // ctx.auth, ctx.subscription are typed and present
 *       // ... validate, mutate, notify, revalidate ...
 *       return { success: true };
 *     });
 *   }
 */

import * as Sentry from '@sentry/nextjs'
import { requireUser, type RequireUserResult } from '@/contexts/identity/usecases/require-user'
import { loadOwnedSubscription } from '@/contexts/subscriptions/domain/subscriptions'
import type { Subscription } from '@/contexts/subscriptions/domain/subscriptions'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'

export const REFUNDED_PLAN_COPY = 'This plan was refunded, so it can no longer be changed.'

export interface OwnedSubscriptionContext {
  /** Narrowed to the successful branch — auth.supabase / auth.user always present. */
  auth: Extract<RequireUserResult, { ok: true }>
  /** Loaded + ownership-checked subscription. */
  subscription: Subscription
}

/**
 * Standard mutation result shape. Either succeeded with a `success: true`
 * payload, or returns a human-readable `error` string surfaced verbatim
 * to the dashboard UI.
 */
export type MutationResult = { success: true } | { error: string }

/**
 * Wrap a mutation body with auth + ownership-load + metric instrumentation.
 *
 * The optional `metricName` arg is incremented once on the success branch
 * via Sentry.metrics.count, giving a per-mutation business counter
 * ("how many pauses today, broken down by hour?") in Sentry's Metrics UI.
 * Failures are counted under `subscription.mutation.failed` with the
 * metricName as a tag so the failure rate per operation is queryable too.
 */
export async function withOwnedSubscription<T extends MutationResult>(
  subscriptionId: string,
  body: (ctx: OwnedSubscriptionContext) => Promise<T>,
  metricName?: string,
): Promise<T | { error: string }> {
  const auth = await requireUser()
  if (!auth.ok) return { error: auth.error }

  const subResult = await loadOwnedSubscription(auth.supabase, subscriptionId, auth.user.id)
  if (!subResult.ok) return { error: subResult.error }

  // A refunded plan is locked (plan refunds, 2026-09-16). Mutations write with
  // the service role, so the database guard cannot tell a customer's write
  // apart; this is where the customer is stopped.
  const { data: refunded } = await createAdminSupabaseClient()
    .from('plan_refunds')
    .select('id')
    .eq('subscription_id', subscriptionId)
    .maybeSingle()
  if (refunded) return { error: REFUNDED_PLAN_COPY }

  const result = await body({ auth, subscription: subResult.subscription })

  if (metricName) {
    if ('success' in result && result.success) {
      Sentry.metrics.count(metricName, 1)
    } else if ('error' in result) {
      // Failure path gets its own metric name — Sentry's metrics API
      // doesn't take tags in this SDK version, so we encode the
      // mutation in the metric name itself.
      Sentry.metrics.count(`${metricName}.failed`, 1)
    }
  }

  return result
}
