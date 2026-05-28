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

import { requireUser, type RequireUserResult } from '@/contexts/identity/usecases/require-user'
import { loadOwnedSubscription } from '@/contexts/subscriptions/domain/subscriptions'
import type { Subscription } from '@/contexts/subscriptions/domain/subscriptions'

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

export async function withOwnedSubscription<T extends MutationResult>(
  subscriptionId: string,
  body: (ctx: OwnedSubscriptionContext) => Promise<T>,
): Promise<T | { error: string }> {
  const auth = await requireUser()
  if (!auth.ok) return { error: auth.error }

  const subResult = await loadOwnedSubscription(auth.supabase, subscriptionId, auth.user.id)
  if (!subResult.ok) return { error: subResult.error }

  return body({ auth, subscription: subResult.subscription })
}
