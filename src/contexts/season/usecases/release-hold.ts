import 'server-only'

/**
 * Release a plan held for next semester (spec §6.3 ready → released, X1).
 * season_release_hold owns the write: it refuses during the break, checks the
 * customer owns the plan and the hold is ready, restarts a Paused plan (and a
 * queued renewal held behind it) or moves a Scheduled plan to its new start
 * date, and marks the hold released, all in one transaction. The customer id
 * comes from withOwnedSubscription or the admin's loaded row, never the client.
 */

import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { friendlyReleaseError, isSeasonBreakError } from '../domain/season-break-errors'

export type ReleaseHoldResult =
  | { ok: true; status: 'Active' | 'Scheduled'; followers: number }
  | { ok: false; error: string; seasonBreak: boolean }

export async function releaseSeasonHold(input: {
  customerId: string
  subscriptionId: string
  startDate: string | null
  resumeCutoff: boolean
}): Promise<ReleaseHoldResult> {
  const sb = createAdminSupabaseClient()
  const { data, error } = await sb.rpc('season_release_hold', {
    p_customer_id: input.customerId,
    p_subscription_id: input.subscriptionId,
    p_start_date: input.startDate,
    p_resume_cutoff: input.resumeCutoff,
  })
  if (error) return { ok: false, error: friendlyReleaseError(error.message), seasonBreak: isSeasonBreakError(error.message) }
  const row = (data ?? {}) as { status?: string; followers?: number }
  return { ok: true, status: row.status === 'Scheduled' ? 'Scheduled' : 'Active', followers: Number(row.followers ?? 0) }
}
