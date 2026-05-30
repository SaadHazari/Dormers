'use server'

/**
 * Marks the Dorm Wars first-visit tour as completed for the signed-in user.
 * Per-account flag (not per-device) so the tour doesn't re-fire when the
 * user signs in on a new device.
 *
 * Called only when the user explicitly opts out via the consent dialog at
 * the end of the tour. "Maybe later" leaves the column NULL so the tour
 * fires again next session.
 */

import { createClient } from '@/utils/supabase/server'

export async function markDormWarsTourCompleted(): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'unauthenticated' }

  const { error } = await supabase
    .from('customers')
    .update({ dorm_wars_tour_completed_at: new Date().toISOString() })
    .eq('id', user.id)

  if (error) {
    console.error('markDormWarsTourCompleted update failed:', error)
    return { ok: false, error: error.message }
  }
  return { ok: true }
}
