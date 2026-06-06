import { getUserFromHeaders } from '@/utils/supabase/auth'
import { getCustomer, getAllSubscriptions } from '@/infra/supabase/subscriptions-repo'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import SupportClient from './SupportClient'
import { findDishForDate } from '@/contexts/menu/domain/catalog-data'

interface Sub {
  plan_name: string | null
  status: string
  start_date: string
  end_date: string
  delivered_meals: number | null
  total_meals: number | null
  week_type: string | null
  skipped_meals_count: number | null
  has_paused_before: boolean | null
  [key: string]: unknown
}

function buildCustomerContext(
  customer: Record<string, unknown> | null,
  activeSub: Sub | undefined,
  queuedSub: Sub | undefined,
  totalDelivered: number,
): string {
  const lines: string[] = []
  lines.push('# THIS CUSTOMER')
  if (customer?.name) lines.push(`Name: ${customer.name}`)
  if (customer?.cid) lines.push(`Customer ID: ${customer.cid}`)
  if (customer?.dorm_name) lines.push(`Dorm: ${customer.dorm_name}`)
  if (customer?.meal_preference_type) lines.push(`Meal preference: ${customer.meal_preference_type}`)
  if (customer?.spice_level_preference) lines.push(`Spice level: ${customer.spice_level_preference}`)
  if (customer?.week_type) lines.push(`Preferred week type: ${customer.week_type === '5DAYS' ? '5-day (Mon–Fri)' : '6-day (Mon–Sat)'}`)
  const allergens = Array.isArray(customer?.allergens) ? customer.allergens : []
  if (allergens.length) lines.push(`Allergens flagged: ${allergens.join(', ')}`)
  else lines.push('Allergens: none flagged')
  if (customer?.veg_days && Array.isArray(customer.veg_days) && (customer.veg_days as string[]).length > 0) {
    lines.push(`Veg days (religious mix): ${(customer.veg_days as string[]).join(', ')}`)
  }
  lines.push(`Total meals delivered (all time): ${totalDelivered}`)

  if (activeSub) {
    lines.push('')
    lines.push('# CURRENT PLAN (this is the plan the customer is on RIGHT NOW)')
    lines.push(`Plan: ${activeSub.plan_name ?? 'Unknown'}`)
    lines.push(`Status: ${activeSub.status}`)
    lines.push(`Start date: ${activeSub.start_date}`)
    lines.push(`End date: ${activeSub.end_date}`)
    const delivered = activeSub.delivered_meals ?? 0
    const total = activeSub.total_meals ?? 0
    lines.push(`Meals this cycle: ${delivered} delivered of ${total} total`)
    lines.push(`Meals remaining: ${Math.max(0, total - delivered)}`)
    if (activeSub.week_type) lines.push(`Week type: ${activeSub.week_type === '5DAYS' ? '5-day (Mon–Fri)' : '6-day (Mon–Sat)'}`)
    const skipsUsed = activeSub.skipped_meals_count ?? 0
    const isMonthly = (activeSub.plan_name ?? '').includes('Monthly')
    const isWeekly = (activeSub.plan_name ?? '').includes('Weekly')
    const skipsAllowed = isMonthly ? 3 : isWeekly ? 1 : 0
    lines.push(`Skips: ${skipsUsed} used of ${skipsAllowed} allowed`)

    const mealsPerDel = (activeSub.plan_name ?? '').includes('Monthly Max') ? 2 : 1
    const totalDeliveries = Math.max(1, Math.ceil(total / mealsPerDel))
    const aeNow = new Date(Date.now() + 4 * 60 * 60 * 1000)
    const todayIso = `${aeNow.getUTCFullYear()}-${String(aeNow.getUTCMonth() + 1).padStart(2, '0')}-${String(aeNow.getUTCDate()).padStart(2, '0')}`
    const startD = new Date(activeSub.start_date + 'T00:00:00')
    const targetD = new Date(todayIso + 'T00:00:00')
    let todayIsMakeup = false
    if (targetD >= startD && (activeSub.status === 'Active' || activeSub.status === 'Skipped')) {
      let pos = 0
      const d = new Date(startD)
      const wt = activeSub.week_type === '5DAYS' ? '5DAYS' : '6DAYS'
      while (d <= targetD) {
        const isoDow = ((d.getDay() + 6) % 7) + 1
        const isWork = wt === '6DAYS' ? isoDow !== 7 : isoDow !== 6 && isoDow !== 7
        if (isWork) pos++
        if (d.getFullYear() === targetD.getFullYear() && d.getMonth() === targetD.getMonth() && d.getDate() === targetD.getDate()) break
        d.setDate(d.getDate() + 1)
      }
      todayIsMakeup = pos > totalDeliveries
    }
    if (todayIsMakeup) {
      lines.push('!! TODAY IS A MAKE-UP DAY. This meal is a bonus earned from an earlier skip. The customer CANNOT skip today — no one can, this is a hard system rule. Do NOT escalate to WhatsApp for this — explain it directly.')
    }

    if (activeSub.status === 'Paused') {
      lines.push('!! Plan is currently PAUSED. No deliveries until the customer resumes from the dashboard. "When is my next delivery?" → they need to resume first, then next weekday after resuming.')
    }
    if (activeSub.status === 'Skipped') {
      lines.push('Today\'s meal was skipped by the customer. Plan is still live — deliveries resume tomorrow.')
    }
    if (activeSub.status === 'Active' || activeSub.status === 'Skipped') {
      if (activeSub.status === 'Active') lines.push('Plan is actively delivering meals on weekdays by 7–8 PM.')
      const isVeg = customer?.meal_preference_type === 'Veg'
      const todayDish = findDishForDate(new Date(), isVeg)
      if (todayDish) {
        lines.push('')
        lines.push('# TONIGHT\'S MEAL')
        lines.push(`Dish: ${todayDish.name}`)
        lines.push(`Description: ${todayDish.description}`)
        lines.push(`Type: ${todayDish.isVeg ? 'Vegetarian' : 'Non-Vegetarian'}`)
        lines.push(`Spice level: ${todayDish.spiceLevel}/3`)
        lines.push(`Calories: ${todayDish.nutrients.calories} · Protein: ${todayDish.nutrients.protein} · Carbs: ${todayDish.nutrients.carbs} · Fat: ${todayDish.nutrients.fat}`)
        if (todayDish.allergens.length) lines.push(`Allergens: ${todayDish.allergens.join(', ')}`)
      }
    }
  } else {
    lines.push('')
    lines.push('# NO ACTIVE PLAN')
    lines.push('This customer does not have an active subscription right now.')
  }

  if (queuedSub) {
    lines.push('')
    lines.push('# QUEUED NEXT PLAN (has NOT started yet — do NOT cite these dates as current)')
    lines.push(`Plan: ${queuedSub.plan_name ?? 'Unknown'}`)
    lines.push(`Starts: ${queuedSub.start_date}`)
    lines.push(`Ends: ${queuedSub.end_date}`)
  }

  return lines.join('\n')
}

export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>
}) {
  const params = await searchParams
  const isPreview = process.env.NODE_ENV === 'development' && params.preview === '1'

  if (isPreview) {
    return (
      <Suspense>
        <SupportClient
          customer={{ id: 'preview', cid: 'TST0001', name: 'Test User', email: 'test@dormers.ae', created_at: new Date().toISOString() }}
          userEmail="test@dormers.ae"
          totalDelivered={42}
        />
      </Suspense>
    )
  }

  const user = await getUserFromHeaders()
  if (!user) redirect('/login')

  const [customer, allSubscriptions] = await Promise.all([
    getCustomer(user.id),
    getAllSubscriptions(user.id),
  ])
  const totalDelivered = allSubscriptions.reduce((acc, s) => acc + (s.delivered_meals ?? 0), 0)

  const activeSub = allSubscriptions.find(s => s.status === 'Active')
    ?? allSubscriptions.find(s => s.status === 'Skipped')
    ?? allSubscriptions.find(s => s.status === 'Paused')
  const queuedSub = allSubscriptions.find(s => s.status === 'Scheduled')
  const customerContext = buildCustomerContext(customer, activeSub, queuedSub, totalDelivered)

  return (
    <Suspense>
      <SupportClient customer={customer} userEmail={user.email} totalDelivered={totalDelivered} customerContext={customerContext} />
    </Suspense>
  )
}
