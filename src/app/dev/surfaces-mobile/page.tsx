'use client'

/**
 * DEV-ONLY mobile preview harness for the Profile / History / Support redesign.
 *
 * Renders the REAL Clients (both trees; the <768 toggle picks the mobile tree at
 * phone width) inside a faithful copy of the dashboard's mobile content wrapper
 * (page bg + .dash-content padding), so the surfaces can be screenshotted at
 * 390px without a live Supabase session. Gated to non-production. Not linked.
 *
 * ?surface=profile | history | support   (default profile)
 * ?variant=...  profile: plain | active | religious | pending | unverified
 */

import { notFound } from 'next/navigation'
import { useEffect, useState } from 'react'
import ProfileClient from '../../dashboard/profile/ProfileClient'
import HistoryClient, { type EndedPlan } from '../../dashboard/history/HistoryClient'
import SupportClient from '../../dashboard/support/SupportClient'
import type { Customer } from '../../dashboard/_shared/types'

const baseCustomer: Customer = {
  id: 'preview',
  cid: 'YUG6750',
  name: 'Amsaa Rahman',
  email: 'amsaa@dormers.ae',
  dorm_name: 'YUGO',
  whatsapp_number: '+971 50 123 4567',
  meal_preference_type: 'Non Veg',
  allergens: 'Nuts, Shellfish',
  spice_level_preference: 'Medium',
  created_at: '2026-02-01T00:00:00Z',
  week_type: '6DAYS',
  whatsapp_verified: true,
  out_of_zone: false,
  takeout_benchmark_aed: 25,
}

const endedPlans: EndedPlan[] = [
  { id: 'p1', plan_name: 'Monthly Premium', status: 'Ended', start_date: '2026-02-01T00:00:00Z', end_date: '2026-03-01T00:00:00Z', total_meals: 24, delivered_meals: 22, skipped_meals_count: 2 },
  { id: 'p2', plan_name: 'Weekly Flex', status: 'Ended', start_date: '2026-01-15T00:00:00Z', end_date: '2026-01-22T00:00:00Z', total_meals: 6, delivered_meals: 6, skipped_meals_count: 0 },
  { id: 'p3', plan_name: 'Monthly Max', status: 'Ended', start_date: '2025-12-01T00:00:00Z', end_date: '2026-01-01T00:00:00Z', total_meals: 48, delivered_meals: 40, skipped_meals_count: 4 },
]

export default function SurfacesMobilePreview() {
  if (process.env.NODE_ENV === 'production') notFound()

  const [surface, setSurface] = useState('profile')
  const [variant, setVariant] = useState('active')
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    setSurface(p.get('surface') ?? 'profile')
    setVariant(p.get('variant') ?? 'active')
  }, [])

  const cust: Customer =
    variant === 'religious'
      ? { ...baseCustomer, meal_preference_type: 'Religious Mix', veg_days: ['Monday', 'Wednesday', 'Friday'] }
      : variant === 'pending'
        ? { ...baseCustomer, pending_meal_preference_type: 'Veg', pending_spice_level_preference: 'Mild' }
        : baseCustomer
  const emailConfirmed = variant !== 'unverified'
  const activeSub = variant === 'plain' ? null : { week_type: '6DAYS' as const, veg_days: cust.veg_days ?? null }

  return (
    <div className="dash-page" style={{ minHeight: '100vh' }}>
      {/* Faux hamburger — to verify the surfaces clear it (paddingLeft:56). */}
      <div style={{ position: 'absolute', top: 16, left: 16, width: 44, height: 44, borderRadius: 12, background: 'rgba(253,251,246,0.85)', border: '1px solid rgba(9,24,37,0.10)', boxShadow: '0 2px 8px rgba(9,24,37,0.12)', zIndex: 50 }} />
      <main className="dash-content">
        {surface === 'profile' && (
          <ProfileClient customer={cust} userEmail={cust.email ?? ''} emailConfirmed={emailConfirmed} activeSubscription={activeSub} />
        )}
        {surface === 'history' && <HistoryClient plans={variant === 'empty' ? [] : endedPlans} />}
        {surface === 'support' && <SupportClient customer={cust} userEmail={cust.email ?? ''} totalDelivered={variant === 'empty' ? 0 : 42} />}
      </main>

      <style>{`
        .dash-page {
          background:
            radial-gradient(135% 55% at 50% 0%, rgba(245,127,32,0.06) 0%, rgba(245,127,32,0) 58%),
            linear-gradient(180deg, #efe8dc 0%, #e9e2d5 60%, #e7e0d2 100%);
        }
        .dash-content { padding: 14px 14px 28px 14px; }
      `}</style>
    </div>
  )
}
