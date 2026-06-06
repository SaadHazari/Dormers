/**
 * Delivery-arrival label, in Asia/Dubai time (UTC+4, no DST). Mirrors the
 * countdown copy HeroToday renders, extracted so the mobile home can show the
 * same "Arriving in ~Nh / soon / now / Delivered / No delivery today" line
 * without duplicating the AE-time math. (HeroToday keeps its own ticking copy
 * for the desktop card; this is the static, render-time version for mobile.)
 *
 * Countdown is deliberately imprecise — rounded ~Nh, "Arriving soon" under
 * 30 min, never minutes. See project_delivery_countdown_imprecise.
 */

export type DeliveryWeekType = '5DAYS' | '6DAYS' | '7DAYS'

function aeNow(now: Date): { hour: number; minute: number; isoDow: number } {
  const ae = new Date(now.getTime() + 4 * 60 * 60 * 1000)
  const jsDow = ae.getUTCDay()
  return { hour: ae.getUTCHours(), minute: ae.getUTCMinutes(), isoDow: jsDow === 0 ? 7 : jsDow }
}

function isDeliveryDow(isoDow: number, weekType: DeliveryWeekType): boolean {
  if (weekType === '7DAYS') return true
  if (weekType === '6DAYS') return isoDow !== 7
  return isoDow !== 6 && isoDow !== 7
}

export function computeArrivalLabel(now: Date, weekType: DeliveryWeekType): string {
  const { hour, minute, isoDow } = aeNow(now)
  if (!isDeliveryDow(isoDow, weekType)) return 'No delivery today'
  if (hour >= 20) return 'Delivered'
  if (hour === 19) return 'Arriving now'
  if (hour === 18 && minute >= 30) return 'Arriving soon'

  const aeOffsetMs = 4 * 60 * 60 * 1000
  const aeMidnightUtc = Math.floor((now.getTime() + aeOffsetMs) / 86400000) * 86400000 - aeOffsetMs
  const targetUtc = aeMidnightUtc + 19 * 60 * 60 * 1000
  const diffMs = targetUtc - now.getTime()
  const totalMinutes = Math.max(0, Math.floor(diffMs / 60000))
  if (totalMinutes <= 30) return 'Arriving soon'
  const hours = Math.max(1, Math.round(diffMs / 3600000))
  return `Arriving in ~${hours} ${hours === 1 ? 'hour' : 'hours'}`
}
