import 'server-only'
import { headers } from 'next/headers'
import type { ReferralData } from '@/infra/supabase/referrals-repo'
import { EMPTY_REVIEW_STATE, type WeeklyReviewState } from '@/contexts/subscriptions/domain/weekly-review'
import type { MonthlyReviewWindow } from '@/contexts/subscriptions/domain/monthly-review'
import type { CreditRow } from './credit-outlook'

/**
 * DEV-ONLY preview fixtures for the dashboard SHELL (sidebar rail, mobile
 * drawer, Now tray, credit chip). Pages already render from fixtures under
 * `?preview=1`, but the layout cannot read searchParams — so middleware
 * forwards the query string as `x-dash-preview` and this builds the shell
 * props from it. Returns null outside development or without the header.
 *
 *   /dashboard?preview=1&shell=<comma list>
 *     credit          → approved credit rows (AED 100 monthly-only + AED 30 universal)
 *     weekly          → a pending weekly review, 4 days left (weekly-urgent → 1 day)
 *     late            → one late (catch-up) weekly review
 *     submitted       → the just-submitted row
 *     monthly         → monthly wrap open (monthly-locked → locked; monthly-late → past full-reward window)
 *     precron         → last-delivery-evening forcing overlay (with `queued` → the queued-plan copy)
 *     queued          → a queued next plan
 *     intakepaused    → the "New plans paused" Now-tray note
 *     admin           → admin rail link
 *     referrals       → referral badge numbers
 *   &plan=monthly-premium|monthly-max|weekly-flex|trial|none  (default monthly-premium)
 */
export interface PreviewShellProps {
  customerName: string
  customerCid: string
  customerDorm: string
  userEmail: string
  planName: string
  isAdmin: boolean
  referralData: ReferralData
  weeklyReviewState: WeeklyReviewState
  monthlyWindow: MonthlyReviewWindow
  queuedPlanSummary: { planName: string; startDate: string } | null
  intakePaused: boolean
  creditRows: CreditRow[]
}

const PLAN_NAMES: Record<string, string> = {
  'monthly-premium': 'Monthly Premium',
  'monthly-max': 'Monthly Max',
  'weekly-flex': 'Weekly Flex',
  'trial': 'Trial',
  'none': '',
}

export async function getPreviewShellProps(): Promise<PreviewShellProps | null> {
  if (process.env.NODE_ENV !== 'development') return null
  const raw = (await headers()).get('x-dash-preview')
  if (raw == null) return null
  const params = new URLSearchParams(raw)
  if (params.get('preview') !== '1') return null
  const shell = new Set((params.get('shell') ?? '').split(',').map(s => s.trim()).filter(Boolean))
  const has = (k: string) => shell.has(k)
  const day = 86400000
  const dateOnly = (t: number) => new Date(t).toISOString().slice(0, 10)
  const fmt = (t: number) => new Date(t).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  const range = (startOff: number) => `${fmt(Date.now() + startOff * day)} — ${fmt(Date.now() + (startOff + 5) * day)}`

  const weekly: WeeklyReviewState = {
    ...EMPTY_REVIEW_STATE,
    current: has('weekly') || has('weekly-urgent') ? { week: 2, range: range(-8), daysLeft: has('weekly-urgent') ? 1 : 4 } : null,
    late: has('late') ? [{ week: 1, range: range(-15), daysLate: 3 }] : [],
    justSubmitted: has('submitted') ? { week: 2, rewardPct: 100 } : null,
    completed: has('weekly') || has('weekly-urgent') || has('submitted') ? [{ week: 1, range: range(-15), rewardPct: 100 }] : [],
    rewards: { submitted: has('submitted') ? 2 : 1, total: 4, aedEarned: has('submitted') ? 10 : 5, aedPending: 0, cycle: 'sep-2026', label: 'Monthly Premium' },
  }
  const monthlyOn = has('monthly') || has('monthly-late') || has('precron')
  const monthly: MonthlyReviewWindow = {
    eligible: monthlyOn,
    locked: has('monthly-locked'),
    submitted: false,
    daysLeftForFullReward: has('monthly-late') ? 0 : 7,
    daysSinceCycleEnd: has('monthly-late') ? 9 : has('precron') ? 0 : 1,
    expired: false,
    preCron: has('precron'),
    cycleLabel: 'Monthly Premium',
    planTier: 'monthly',
  }
  const planKey = params.get('plan') ?? 'monthly-premium'
  return {
    customerName: 'Saad Hazari',
    customerCid: 'YUG6750',
    customerDorm: 'YUGO',
    userEmail: 'preview@dormers.ae',
    planName: PLAN_NAMES[planKey] ?? 'Monthly Premium',
    isAdmin: has('admin'),
    referralData: has('referrals')
      ? { total: 3, converted: 1, creditBalance: 66, creditPending: 10 }
      : { total: 0, converted: 0, creditBalance: 0, creditPending: 0 },
    weeklyReviewState: weekly,
    monthlyWindow: monthly,
    queuedPlanSummary: has('queued') ? { planName: 'Monthly Max', startDate: dateOnly(Date.now() + 4 * day) } : null,
    intakePaused: has('intakepaused'),
    creditRows: has('credit')
      ? [{ amount_aed: 100, eligible_plan_ids: ['monthly-max', 'monthly-premium'] }, { amount_aed: 30, eligible_plan_ids: null }]
      : [],
  }
}
