'use server'

import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/contexts/admin/usecases/require-admin'
import { logAdminAction } from '@/contexts/admin/usecases/audit'
import {
  autoApproveLayer4Reward,
  autoRejectLayer4Reward,
  type Layer4Kind,
} from '@/contexts/dorm-wars/domain/layer4'
import { LAYER4_VALUE_AED } from '@/contexts/dorm-wars/domain/layer4'

// Server actions for the /admin/layer4-queue page. Both re-check admin
// authorization at the top — never trust the page-level guard alone.
// (Page guards block UI access; action guards block direct POST attacks.)

function admin() {
  return createAdminSupabaseClient()
}

// Map kind → credit source. Mirrors what the auto-fire / claim helpers
// use so the admin-approved row produces an identical credits row to the
// auto-path, keeping celebration banners + reporting consistent.
const KIND_TO_SOURCE: Record<Layer4Kind, string> = {
  google_review:      'layer4_google_review',
  weekly_survey:      'layer4_weekly_survey',
  anniversary:        'layer4_anniversary',
  renew_invite_combo: 'layer4_renew_invite_combo',
}

export async function approveLayer4Row(rowId: string): Promise<{ ok: true } | { error: string }> {
  const adminUser = await requireAdmin()
  const sb = admin()

  const { data: row } = await sb
    .from('layer4_rewards')
    .select('id, customer_id, kind, value_aed, status')
    .eq('id', rowId)
    .maybeSingle()
  if (!row) return { error: 'row_not_found' }
  if (row.status !== 'pending') return { error: 'row_not_pending' }

  const kind = row.kind as Layer4Kind
  const source = KIND_TO_SOURCE[kind] ?? `layer4_${kind}`
  const valueAed = (row.value_aed as number) ?? LAYER4_VALUE_AED[kind]

  try {
    await autoApproveLayer4Reward(
      sb,
      row.id as string,
      row.customer_id as string,
      valueAed,
      source,
      'Manually approved by admin via /admin/layer4-queue',
    )
  } catch (err) {
    console.error('approveLayer4Row failed:', err)
    return { error: 'approve_failed' }
  }

  // Audit trail — this deposits an AED credit; parity with every other
  // mutating admin action.
  await logAdminAction(adminUser.email, 'approve_layer4_reward', 'layer4_rewards', rowId, {
    customer_id: row.customer_id, kind, value_aed: valueAed,
  })

  revalidatePath('/admin/layer4-queue')
  return { ok: true }
}

export async function rejectLayer4Row(
  rowId: string,
  reason?: string,
): Promise<{ ok: true } | { error: string }> {
  const adminUser = await requireAdmin()
  const sb = admin()

  const { data: row } = await sb
    .from('layer4_rewards')
    .select('id, status')
    .eq('id', rowId)
    .maybeSingle()
  if (!row) return { error: 'row_not_found' }
  if (row.status !== 'pending') return { error: 'row_not_pending' }

  try {
    // For google_review, also delete the screenshot from storage to keep
    // the bucket tidy. Other kinds don't upload screenshots.
    await autoRejectLayer4Reward(
      sb,
      row.id as string,
      reason ?? 'Manually rejected by admin via /admin/layer4-queue',
    )
  } catch (err) {
    console.error('rejectLayer4Row failed:', err)
    return { error: 'reject_failed' }
  }

  await logAdminAction(adminUser.email, 'reject_layer4_reward', 'layer4_rewards', rowId, {
    reason: reason ?? 'unspecified',
  })

  revalidatePath('/admin/layer4-queue')
  return { ok: true }
}
