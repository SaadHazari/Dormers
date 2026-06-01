'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useSearchParams, useRouter } from 'next/navigation'
import { OG, BODY, S } from './_shared/tokens'
import { NoPlanView } from './NoPlanView'
import { ActiveDashboard } from './ActiveDashboard'
import { ProfileBanner } from './_shared/ProfileBanner'
import { OutOfZoneBanner } from './_shared/OutOfZoneBanner'
import { MonthlyWrapEmptyBanner } from './_shared/MonthlyWrapEmptyBanner'
import { CheckoutSuccessTakeover } from './_shared/CheckoutSuccessTakeover'
import { whatsAppHref } from '@/shared/contacts'
import { missingProfileFields } from '@/contexts/subscriptions/domain/profile-completion'
import type { Customer, Subscription } from './_shared/types'
import type { MonthlyReviewWindow } from '@/contexts/subscriptions/domain/monthly-review'

interface RecentOrder {
  id: string
  plan: string | null
  meals_count: number | null
  price_per_meal: number | null
  created_at: string
}

const EMPTY_MONTHLY_WINDOW: MonthlyReviewWindow = {
  eligible: false, submitted: false,
  daysLeftForFullReward: 0, daysSinceCycleEnd: 0,
  expired: false, preCron: false, cycleLabel: null, planTier: 'monthly',
}

// Webhook fallback threshold — if the subscription hasn't been provisioned this
// many ms after Stripe redirects back, swap the cheery "Setting up" copy for a
// reassurance + WhatsApp escape hatch. Norman: errors must offer alternative
// paths; an infinite spinner is a dead-end.
const WEBHOOK_FALLBACK_MS = 20_000

interface Props {
  customer: Customer | null
  activeSubscription: Subscription | null
  allSubscriptions: Subscription[]
  queuedSubscription?: Subscription | null
  userEmail: string
  /** Monthly wrap window — drives the slim dashboard strip (queued-plan, post-cron case)
   *  and the pick-plan-empty banner (no-queued, post-cron case). */
  monthlyWindow?: MonthlyReviewWindow
  /** Most recent order — used by the post-checkout success takeover to display
   *  the just-paid amount. On any non-checkout-success render this is just the
   *  user's most-recent historical order; the takeover only consumes it when
   *  the just-created sub has been detected (i.e. the order is fresh). */
  mostRecentOrder?: RecentOrder | null
}

/**
 * Dashboard route entry. Handles three branches:
 *   1. Just-completed checkout, sub not yet provisioned → loading spinner
 *   2. No active subscription                          → NoPlanView (with optional cancel banner)
 *   3. Active subscription                             → ActiveDashboard (state-owning view)
 *
 * Renewal cancels (active sub + checkout_canceled) strip the param so the user
 * lands back on their existing dashboard rather than the empty-state picker.
 */
export default function ClientDashboard({ customer, activeSubscription, allSubscriptions, queuedSubscription = null, userEmail, monthlyWindow = EMPTY_MONTHLY_WINDOW, mostRecentOrder = null }: Props) {
  const router           = useRouter()
  const searchParams     = useSearchParams()
  const checkoutSuccess  = searchParams.get('checkout_success')  === 'true'
  const checkoutCanceled = searchParams.get('checkout_canceled') === 'true'

  // Read the handoff timestamp written by CheckoutPanel before redirecting to
  // Stripe. We treat the new sub as "landed" only when at least one sub has
  // been created on/after this moment — gates the spinner for both first-time
  // customers AND existing customers (who'd otherwise see banner content
  // populated from their PREVIOUS active sub before the webhook fires).
  const [handoffAt, setHandoffAt] = useState<number | null>(null)
  useEffect(() => {
    if (!checkoutSuccess) return
    try {
      const v = sessionStorage.getItem('checkout-handoff-at')
      if (v) setHandoffAt(Number(v))
    } catch {}
  }, [checkoutSuccess])

  // True once the webhook has written a sub created on/after the handoff. If
  // we have no handoff (legacy / older session), we trust the activeSubscription
  // signal to avoid a phantom spinner forever.
  const newSubLanded = checkoutSuccess
    ? handoffAt
      ? allSubscriptions.some(s => new Date(s.created_at).getTime() >= handoffAt - 1000)
      : !!activeSubscription
    : true

  // While we're still waiting for the webhook to land the new sub, poll by
  // refreshing the route every 2s. Once newSubLanded is true we stop polling
  // and let the CheckoutSuccessTakeover render — its CTAs are what clear the
  // checkout_success param (router.replace), not this effect. Stripping the
  // param here would race the takeover render and the user would never see it.
  useEffect(() => {
    if (!checkoutSuccess || newSubLanded) return
    const t = setTimeout(() => router.refresh(), 2000)
    return () => clearTimeout(t)
  }, [checkoutSuccess, newSubLanded, router])

  // Webhook-delay fallback: after WEBHOOK_FALLBACK_MS the spinner copy swaps
  // to a reassurance + WhatsApp escape hatch. Resets when the wait ends.
  const [waitedTooLong, setWaitedTooLong] = useState(false)
  useEffect(() => {
    if (!(checkoutSuccess && !newSubLanded)) {
      setWaitedTooLong(false)
      return
    }
    const t = setTimeout(() => setWaitedTooLong(true), WEBHOOK_FALLBACK_MS)
    return () => clearTimeout(t)
  }, [checkoutSuccess, newSubLanded])

  // Renewal-flow cancel: user already has an active plan and bailed out of
  // Stripe. Strip the param so they see their existing dashboard, not the
  // no-plan picker (which would hide their live subscription).
  useEffect(() => {
    if (checkoutCanceled && activeSubscription) router.replace('/dashboard')
  }, [checkoutCanceled, activeSubscription, router])

  // Order received → setting up (with webhook-delay fallback). Spinner now
  // covers BOTH first-time customers (no active sub) and existing customers
  // (active sub but new one hasn't landed yet) — anyone whose new sub the
  // webhook hasn't written yet.
  if (checkoutSuccess && !newSubLanded) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 22, fontFamily: BODY, color: S.fg, padding: 32 }}>
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }}
          style={{ width: 44, height: 44, borderRadius: '50%', border: `2px solid rgba(245,127,32,0.30)`, borderTopColor: OG }} />
        {waitedTooLong ? (
          <div style={{ textAlign: 'center', maxWidth: 420 }}>
            <div style={{ fontFamily: BODY, fontSize: 20, fontWeight: 700, color: S.fg }}>Almost there…</div>
            <div style={{ fontSize: 14, color: S.fgMuted, marginTop: 8, lineHeight: 1.65 }}>
              Your payment went through. Setup is taking longer than usual — your plan should appear in the next minute. If it doesn’t, message us and we’ll sort it out instantly.
            </div>
            <a
              href={whatsAppHref('Hi! I just paid for a meal plan but my dashboard hasn’t updated yet — could you check?')}
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                marginTop: 16, padding: '11px 18px', borderRadius: 999,
                background: '#25D366', color: '#fff',
                fontFamily: BODY, fontSize: 12, fontWeight: 700,
                letterSpacing: '0.06em', textTransform: 'uppercase',
                textDecoration: 'none', boxShadow: '0 6px 18px rgba(37,211,102,0.30)',
              }}
            >
              Message us on WhatsApp →
            </a>
          </div>
        ) : (
          <div style={{ textAlign: 'center', maxWidth: 360 }}>
            <div style={{ fontFamily: BODY, fontSize: 20, fontWeight: 700, color: S.fg }}>Order received!</div>
            <div style={{ fontSize: 14, color: S.fgMuted, marginTop: 8, lineHeight: 1.65 }}>Setting up your meal plan…</div>
          </div>
        )}
      </div>
    )
  }

  // Just-paid success takeover — fires once the webhook has landed the new
  // sub AND we still have the checkout_success URL signal. Replaces the old
  // "auto-strip the param and dump them on the cold dashboard" behaviour
  // with a celebratory moment that confirms the order and points them to
  // the customize-menu next step. The takeover's CTAs are responsible for
  // clearing the param (router.replace / router.push), not this branch.
  if (checkoutSuccess && newSubLanded) {
    const justLandedSub = handoffAt
      ? allSubscriptions.find(
          (s) => new Date(s.created_at).getTime() >= handoffAt - 1000,
        )
      : (activeSubscription ?? allSubscriptions[0])
    const orderTotal =
      mostRecentOrder?.price_per_meal != null && mostRecentOrder.meals_count != null
        ? Number(mostRecentOrder.price_per_meal) * mostRecentOrder.meals_count
        : 0
    const firstName =
      (customer?.name ?? '').trim().split(/\s+/)[0] || 'there'

    const dismiss = () => {
      try { sessionStorage.removeItem('checkout-handoff-at') } catch {}
      router.replace('/dashboard')
    }

    if (justLandedSub) {
      return (
        <CheckoutSuccessTakeover
          firstName={firstName}
          planName={justLandedSub.plan_name ?? 'Dormers Plan'}
          firstDeliveryDateIso={String(justLandedSub.start_date).slice(0, 10)}
          mealsCount={Number(justLandedSub.total_meals ?? 0)}
          totalAed={orderTotal}
          onDismiss={dismiss}
        />
      )
    }
  }

  // Profile-completion gate — non-dismissable, blocks plan purchase. Required
  // fields per src/lib/profile-completion.ts. Server-side checkout also
  // re-validates so a tampered POST can't bypass.
  const missingFields = missingProfileFields(customer)
  // Out-of-zone gate — set at onboarding when dorm is "Other" (outside listed
  // delivery radius). Same blocking behaviour as missingFields; cleared by
  // customer-service via Supabase admin once delivery is confirmed.
  const outOfZone = !!customer?.out_of_zone
  const purchaseGated = missingFields.length > 0 || outOfZone

  // No active plan (with optional cancel banner) → confident plan-picker.
  // Renewal cancels (active sub + canceled param) fall through to ActiveDashboard
  // — the effect above strips the param.
  if (!activeSubscription) {
    return (
      <div style={{ padding: 'clamp(20px, 3vw, 40px)', fontFamily: BODY, color: S.fg }}>
        <div style={{ maxWidth: 1400, margin: '0 auto' }}>
          <OutOfZoneBanner show={outOfZone} />
          <ProfileBanner missing={missingFields} />
          {checkoutCanceled && (
            <div style={{ marginBottom: 22, padding: '12px 18px', borderRadius: 'var(--radius-sm)', background: 'var(--ds-skeleton-base)', border: `1px solid ${S.border}`, color: S.fgMuted, fontSize: 13, fontFamily: BODY, lineHeight: 1.5 }}>
              Checkout was cancelled — no charge was made. Pick a plan when you&rsquo;re ready.
            </div>
          )}
          {/* Phase 7: trial-gift banner removed. Welcome meals are real
              subscriptions now — they hit ActiveDashboard, not this branch. */}
          {/* Monthly wrap banner — only renders when the user's previous
              cycle's wrap is still open AND no plan is currently active. Lives
              ABOVE NoPlanView so the narrative reads "wrap the last cycle
              first, then pick what's next." Self-renders nothing when not
              eligible. See project_now_tray_architecture memory. */}
          <MonthlyWrapEmptyBanner monthlyWindow={monthlyWindow} />
          <NoPlanView
            customer={customer}
            allSubscriptions={allSubscriptions}
            userEmail={userEmail}
            purchaseGated={purchaseGated}
            outOfZone={outOfZone}
          />
        </div>
      </div>
    )
  }

  // Order-confirmation banner fires only once the NEW sub has actually been
  // written by the webhook. For existing customers this is critical — without
  // the gate, the banner would populate from their previous active sub and
  // the user would see "Your Monthly Premium is active" after buying, e.g.,
  // a Monthly Max. The spinner above ensures we never reach this line until
  // the new sub is in `allSubscriptions`.
  const justCheckedOut = checkoutSuccess && newSubLanded

  return (
    <ActiveDashboard
      sub={activeSubscription}
      customer={customer}
      userEmail={userEmail}
      allSubscriptions={allSubscriptions}
      queuedSub={queuedSubscription}
      justCheckedOut={justCheckedOut}
      profileGate={missingFields}
      outOfZone={outOfZone}
      monthlyWindow={monthlyWindow}
    />
  )
}
