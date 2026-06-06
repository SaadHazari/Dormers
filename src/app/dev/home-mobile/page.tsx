'use client'

/**
 * DEV-ONLY mobile preview harness for the dashboard Home redesign.
 *
 * Renders the REAL DashboardShell + ActiveDashboard with mock data inside a
 * faithful copy of the dashboard layout wrapper (content-border + the ≤1024
 * media rules), so the mobile redesign can be screenshotted at 390px without a
 * live Supabase session. Gated to non-production. Not linked anywhere.
 *
 * Append ?s=<state> to exercise an action end-state:
 *   active (default) · paused · scheduled · trial · planned · renew
 *   · skipped · delivered · resumed   (the last two force the time/session-
 *     driven hero closure states so they're viewable without waiting for 8 PM)
 * These drive the MobileHome status pill, Skip gate, Pause state machine,
 * Plan-a-skip visibility, the planned-pause boundary marker, and the renew
 * nudge — the parity surfaces the audit flagged.
 */

import { notFound } from 'next/navigation'
import { useEffect, useState } from 'react'
import DashboardShell from '../../dashboard/DashboardShell'
import ClientDashboard from '../../dashboard/ClientDashboard'
import type { Customer, Subscription } from '../../dashboard/_shared/types'
import type { MonthlyReviewWindow } from '@/contexts/subscriptions/domain/monthly-review'

const customer: Customer = {
  id: 'preview',
  cid: 'YUG6750',
  name: 'Amsaa',
  email: 'amsaa@dormers.ae',
  dorm_name: 'YUGO',
  whatsapp_number: '+971500000000',
  meal_preference_type: 'Non Veg',
  allergens: 'None',
  spice_level_preference: 'Medium',
  created_at: '2026-02-01T00:00:00Z',
  week_type: '6DAYS',
  whatsapp_verified: true,
  out_of_zone: false,
  takeout_benchmark_aed: 25,
}

const baseSub: Subscription = {
  id: 'sub1',
  plan_name: 'Monthly Premium',
  status: 'active',
  start_date: '2026-05-10',
  end_date: '2026-06-05',
  total_meals: 24,
  delivered_meals: 20,
  skipped_meals_count: 2,
  has_paused_before: false,
  created_at: '2026-05-10T00:00:00Z',
  week_type: '6DAYS',
  skipped_dates: ['2026-05-15', '2026-05-22'],
}

function subFor(state: string): Subscription {
  switch (state) {
    case 'skipped':
      // status Skipped → localState 'skipped' → hero closure copy. Mid-cycle
      // runway (end far out) so the post-skip "Plan a pause" picker has real
      // future working days to offer.
      return { ...baseSub, status: 'Skipped', delivered_meals: 12, total_meals: 24, end_date: '2026-06-25', skipped_meals_count: 1, skipped_dates: ['2026-06-04'] } as Subscription
    case 'ended':
      // All meals delivered but calendar end is far out → in-card "Plan ended".
      return { ...baseSub, delivered_meals: 24, total_meals: 24, end_date: '2026-08-01', skipped_meals_count: 0, skipped_dates: [] }
    case 'untraced':
      // skipped_meals_count (3) > skipped_dates (1) → untraced-skip footnote.
      return { ...baseSub, skipped_meals_count: 3, skipped_dates: ['2026-05-15'] }
    case 'newuser':
      // First delivery hasn't landed → value line still offers benchmark capture.
      return { ...baseSub, delivered_meals: 0, skipped_meals_count: 0, skipped_dates: [] }
    case 'paused':
      // Resume enabled (paused on an earlier day, not same-day-locked).
      return { ...baseSub, status: 'Paused', has_paused_before: true, pause_date: '2026-06-01' } as Subscription
    case 'scheduled':
      return { ...baseSub, status: 'Scheduled', start_date: '2026-06-20', end_date: '2026-07-16', delivered_meals: 0, skipped_meals_count: 0, skipped_dates: [] }
    case 'trial':
      return { ...baseSub, plan_name: 'One-Time Trial', total_meals: 1, delivered_meals: 0, skipped_meals_count: 0, skipped_dates: [], end_date: '2026-06-10' }
    case 'planned':
      // Active, with a scheduled pause beginning 2026-06-10 (a working day).
      return { ...baseSub, end_date: '2026-07-05', planned_pause_start: '2026-06-10' } as Subscription
    case 'renew':
      // Last day of the cycle → renew banner at daysToEnd 0.
      return { ...baseSub, end_date: '2026-06-03' }
    case 'queued':
      // Active + canPause + a queued next plan → reproduces the tall pause
      // modal (queued-shift warning card) from the bug report.
      return { ...baseSub, end_date: '2026-06-05' }
    case 'longcycle':
      // Long cycle, many future working days → tallest skip-picker grid.
      return { ...baseSub, end_date: '2026-07-31', total_meals: 60, delivered_meals: 6, skipped_meals_count: 0, skipped_dates: [] }
    default:
      return baseSub
  }
}

// Queued (Scheduled) next plan — only for the 'queued' variant, so the
// pause/skip modals render their "queued plan shifts later" warning card.
function queuedFor(state: string): Subscription | null {
  // 'planned' also gets a queued plan so the Tentative up-next variant is testable.
  if (state !== 'queued' && state !== 'planned') return null
  return {
    ...baseSub,
    id: 'sub-queued',
    status: 'Scheduled',
    start_date: '2026-06-08',
    end_date: '2026-07-04',
    delivered_meals: 0,
    skipped_meals_count: 0,
    skipped_dates: [],
  }
}

const monthlyWindow: MonthlyReviewWindow = {
  eligible: true,
  submitted: false,
  daysLeftForFullReward: 3,
  daysSinceCycleEnd: 0,
  expired: false,
  preCron: false,
  cycleLabel: 'May',
  planTier: 'monthly',
}

export default function HomeMobilePreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound()

  const [state, setState] = useState('active')
  // ?refer=N (converted subscribers) · ?dw=1 (has Dorm Wars access) — exercise
  // the Refer & Earn badge: wallet for DW users, referral-only earnings for the rest.
  const [refer, setRefer] = useState(0)
  const [dw, setDw] = useState(false)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    setState(p.get('s') ?? 'active')
    setRefer(parseInt(p.get('refer') ?? '0', 10) || 0)
    setDw(p.get('dw') === '1')
  }, [])
  const referralData = { total: refer, converted: refer, creditBalance: 9, creditPending: 0 }

  const sub = subFor(state === 'nobench' ? 'active' : state)
  const queued = queuedFor(state)
  // 'nobench'/'newuser' null the benchmark to exercise the savings-line capture
  // invite ('newuser' also has zero deliveries — the pre-first-delivery case).
  const cust = state === 'nobench' || state === 'newuser' ? { ...customer, takeout_benchmark_aed: null } : customer

  return (
    <div style={{ minHeight: '100vh', background: '#ffffff' }}>
      <DashboardShell
        customerName={customer.name ?? ''}
        customerCid={customer.cid ?? ''}
        customerDorm={customer.dorm_name ?? ''}
        userEmail={customer.email ?? ''}
        planName={sub.plan_name}
        referralData={referralData}
        dormWarsEligible={dw}
        monthlyWindow={monthlyWindow}
      >
        <div style={{ display: 'flex', paddingTop: 16 }}>
          <main className="dash-content" style={{ flex: 1, marginLeft: 92, minWidth: 0, padding: '0 16px 16px 8px' }}>
            <div className="content-border" style={{
              position: 'relative',
              borderRadius: 'var(--radius-md)',
              border: '1px solid rgba(245,127,32,0.45)',
              background: '#ede8da',
              minHeight: 'calc(100vh - 32px)',
              overflow: 'hidden',
            }}>
              <ClientDashboard
                key={state}
                customer={cust}
                activeSubscription={sub}
                queuedSubscription={queued}
                allSubscriptions={queued ? [sub, queued] : [sub]}
                userEmail={customer.email ?? ''}
                monthlyWindow={monthlyWindow}
                previewState={state}
              />
            </div>
          </main>
        </div>
      </DashboardShell>

      <style>{`
        @media (max-width: 1024px) {
          .dash-content { margin-left: 0 !important; padding: 52px 8px 8px 8px !important; }
          .content-border { border-radius: 16px !important; min-height: auto !important; }
        }
      `}</style>
    </div>
  )
}
