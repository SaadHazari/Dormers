// ─────────────────────────────────────────────────────────────────────────────
// Daily label data — the ONE place that decides who gets a box today.
//
// Used by both the /admin/labels page (stats + grouping) and the PDF routes,
// so the preview and the printed batch can never disagree about the day's
// orders. Delivery rules mirror the admin delivery queue:
//   • status = Active, start_date ≤ today ≤ end_date
//   • Sundays: no deliveries; Saturdays: 5-day plans excluded
//   • today ∈ skipped_dates → excluded (skip-meal is irreversible kitchen ops)
//   • veg/non-veg: preference, with religious-mix resolved via veg_days
//
// Order IDs are PERSISTED (label_orders): the first generation of a given
// (day, subscription) claims a global DM-number that never changes — reprints
// and late additions can't renumber boxes already in the kitchen.
// ─────────────────────────────────────────────────────────────────────────────

import 'server-only'
import QRCode from 'qrcode'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { findDishForDate } from '@/contexts/menu/domain/catalog-data'
import { getDormMapping, type DormShape } from './dorm-shapes'
import { qrUrl, formatCustomerName, type LabelData, INK, CREAM } from './label-spec'

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function aeToday(): Date {
  // UAE is UTC+4, no DST.
  return new Date(Date.now() + 4 * 60 * 60 * 1000)
}

function isoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/** What the admin UI needs per label (no QR payload — previews come from the PDF). */
export interface LabelMeta {
  orderId: string
  dishName: string
  customerName: string         // display-formatted: "Aman V."
  dormDisplayName: string
  dormNumber: number
  dormShape: DormShape
  mealPref: 'VEG' | 'NON-VEG'
}

export interface DailyLabels {
  dateIso: string
  dayName: string
  labels: LabelMeta[]
  noDeliveryReason?: string
}

interface CustomerRow {
  id: string
  name: string | null
  dorm_name: string | null
  meal_preference_type: string | null
  veg_days: string[] | null
}

interface SubRow {
  id: string
  customer_id: string
  week_type: string
  skipped_dates: string[] | null
}

export async function getDailyLabels(): Promise<DailyLabels> {
  const today = aeToday()
  const dateIso = isoDate(today)
  const jsDow = today.getUTCDay()
  const dayName = DAYS_OF_WEEK[jsDow]

  if (jsDow === 0) {
    return { dateIso, dayName, labels: [], noDeliveryReason: 'Sunday — no deliveries' }
  }

  const sb = createAdminSupabaseClient()
  const [subsRes, customersRes] = await Promise.all([
    sb.from('subscriptions')
      .select('id, customer_id, week_type, skipped_dates')
      .eq('status', 'Active')
      .lte('start_date', dateIso)
      .gte('end_date', dateIso),
    sb.from('customers')
      .select('id, name, dorm_name, meal_preference_type, veg_days'),
  ])
  if (subsRes.error) throw new Error(`subscriptions query failed: ${subsRes.error.message}`)
  if (customersRes.error) throw new Error(`customers query failed: ${customersRes.error.message}`)

  const customers = new Map<string, CustomerRow>()
  for (const c of (customersRes.data ?? []) as CustomerRow[]) customers.set(c.id, c)

  const isSaturday = jsDow === 6
  const vegDish = findDishForDate(today, true)
  const nonVegDish = findDishForDate(today, false)

  type Pending = Omit<LabelMeta, 'orderId'> & { subscriptionId: string }
  const pending: Pending[] = []

  for (const sub of (subsRes.data ?? []) as SubRow[]) {
    if (sub.week_type === '5DAYS' && isSaturday) continue
    if ((sub.skipped_dates ?? []).includes(dateIso)) continue

    const cust = customers.get(sub.customer_id)
    if (!cust) continue

    const pref = cust.meal_preference_type?.toLowerCase() ?? ''
    let isVegToday: boolean
    if (pref === 'veg' || pref.includes('vegetarian')) {
      isVegToday = true
    } else if (pref.includes('religious')) {
      const vegDays = (cust.veg_days ?? []).map(d => d.toLowerCase())
      isVegToday = vegDays.includes(dayName.toLowerCase())
    } else {
      isVegToday = false
    }

    const dish = isVegToday ? vegDish : nonVegDish
    if (!dish) continue

    const dorm = getDormMapping(cust.dorm_name)
    pending.push({
      subscriptionId: sub.id,
      dishName: dish.name,
      customerName: formatCustomerName(cust.name ?? 'Unknown'),
      dormDisplayName: dorm.displayName,
      dormNumber: dorm.number,
      dormShape: dorm.shape,
      mealPref: isVegToday ? 'VEG' : 'NON-VEG',
    })
  }

  if (pending.length === 0) {
    return { dateIso, dayName, labels: [], noDeliveryReason: 'No active deliveries today' }
  }

  // Claim/fetch the day's permanent order numbers. ignoreDuplicates keeps
  // already-claimed rows (and their numbers) untouched on regeneration.
  const upsert = await sb.from('label_orders').upsert(
    pending.map(p => ({ delivery_date: dateIso, subscription_id: p.subscriptionId })),
    { onConflict: 'delivery_date,subscription_id', ignoreDuplicates: true },
  )
  if (upsert.error) throw new Error(`label_orders upsert failed: ${upsert.error.message}`)

  const ordersRes = await sb.from('label_orders')
    .select('order_no, subscription_id')
    .eq('delivery_date', dateIso)
  if (ordersRes.error) throw new Error(`label_orders query failed: ${ordersRes.error.message}`)

  const orderNoBySub = new Map<string, number>(
    (ordersRes.data ?? []).map(r => [r.subscription_id as string, r.order_no as number]),
  )

  const labels: LabelMeta[] = pending.map(p => {
    const orderNo = orderNoBySub.get(p.subscriptionId)
    if (!orderNo) throw new Error(`no order number for subscription ${p.subscriptionId}`)
    const { subscriptionId: _drop, ...meta } = p
    void _drop
    return { ...meta, orderId: `DM-${orderNo}` }
  })

  // Kitchen/driver order: by dorm (routing number), then customer.
  labels.sort((a, b) =>
    a.dormNumber !== b.dormNumber
      ? a.dormNumber - b.dormNumber
      : a.customerName.localeCompare(b.customerName),
  )

  return { dateIso, dayName, labels }
}

/** Attaches QR payloads — only the PDF renderer needs these. */
export async function toLabelData(labels: LabelMeta[]): Promise<LabelData[]> {
  return Promise.all(labels.map(async l => ({
    ...l,
    qrPngBase64: (await QRCode.toBuffer(qrUrl(l.orderId), {
      errorCorrectionLevel: 'M',
      margin: 1,                 // + the tile's own 1.6mm padding = full quiet zone
      scale: 16,                 // integer px per module — razor-sharp modules
      color: { dark: INK, light: CREAM },
    })).toString('base64'),
  })))
}
