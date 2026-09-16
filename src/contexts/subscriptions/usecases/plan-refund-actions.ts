'use server'

/**
 * The customer's Refund my remaining meals on My Plan. Ownership is checked
 * by withOwnedSubscription; everything else (the owner's switch, the plan,
 * the amounts) is rechecked in SQL by plan_refund_start.
 */

import { revalidatePath } from 'next/cache'
import { withOwnedSubscription } from './with-owned-subscription'
import { startPlanRefund } from './plan-refund'

export type PlanRefundActionResult = { success: true; message: string } | { error: string }

export async function refundRemainingMeals(subscriptionId: string): Promise<PlanRefundActionResult> {
  return withOwnedSubscription(subscriptionId, async ({ auth }) => {
    const result = await startPlanRefund(auth.user.id, subscriptionId)
    revalidatePath('/dashboard')
    revalidatePath('/dashboard/plan')
    if ('error' in result) return { error: result.error }
    return { success: true as const, message: result.message }
  }, 'subscription.plan_refunded')
}
