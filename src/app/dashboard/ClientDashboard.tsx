'use client'

import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { useSearchParams, useRouter } from 'next/navigation'
import { OG, NV, BODY, S } from './_shared/tokens'
import { NoPlanView } from './NoPlanView'
import { ActiveDashboard } from './ActiveDashboard'
import type { Customer, Subscription } from './_shared/types'

interface Props {
  customer: Customer | null
  activeSubscription: Subscription | null
  allSubscriptions: Subscription[]
  userEmail: string
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
export default function ClientDashboard({ customer, activeSubscription, allSubscriptions, userEmail }: Props) {
  const router           = useRouter()
  const searchParams     = useSearchParams()
  const checkoutSuccess  = searchParams.get('checkout_success')  === 'true'
  const checkoutCanceled = searchParams.get('checkout_canceled') === 'true'

  useEffect(() => {
    if (!checkoutSuccess) return
    if (activeSubscription) { router.replace('/dashboard'); return }
    const t = setTimeout(() => router.refresh(), 2000)
    return () => clearTimeout(t)
  }, [checkoutSuccess, activeSubscription, router])

  // Renewal-flow cancel: user already has an active plan and bailed out of
  // Stripe. Strip the param so they see their existing dashboard, not the
  // no-plan picker (which would hide their live subscription).
  useEffect(() => {
    if (checkoutCanceled && activeSubscription) router.replace('/dashboard')
  }, [checkoutCanceled, activeSubscription, router])

  // Order received → setting up
  if (checkoutSuccess && !activeSubscription) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 22, fontFamily: BODY, color: NV, padding: 32 }}>
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }}
          style={{ width: 44, height: 44, borderRadius: '50%', border: `2px solid rgba(245,127,32,0.30)`, borderTopColor: OG }} />
        <div style={{ textAlign: 'center', maxWidth: 360 }}>
          <div style={{ fontFamily: BODY, fontSize: 20, fontWeight: 700, color: NV }}>Order received!</div>
          <div style={{ fontSize: 14, color: S.fgMuted, marginTop: 8, lineHeight: 1.65 }}>Setting up your meal plan…</div>
        </div>
      </div>
    )
  }

  // No active plan (with optional cancel banner) → confident plan-picker.
  // Renewal cancels (active sub + canceled param) fall through to ActiveDashboard
  // — the effect above strips the param.
  if (!activeSubscription) {
    return (
      <div style={{ padding: 'clamp(20px, 3vw, 40px)', fontFamily: BODY, color: NV }}>
        <div style={{ maxWidth: 1400, margin: '0 auto' }}>
          {checkoutCanceled && (
            <div style={{ marginBottom: 22, padding: '12px 18px', borderRadius: 'var(--radius-sm)', background: 'rgba(9,24,37,0.04)', border: `1px solid ${S.border}`, color: S.fgMuted, fontSize: 13, fontFamily: BODY, lineHeight: 1.5 }}>
              Checkout was cancelled — no charge was made. Pick a plan when you&rsquo;re ready.
            </div>
          )}
          <NoPlanView />
        </div>
      </div>
    )
  }

  return (
    <ActiveDashboard
      sub={activeSubscription}
      customer={customer}
      userEmail={userEmail}
      allSubscriptions={allSubscriptions}
    />
  )
}
