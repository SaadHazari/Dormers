'use client'

// TEMP dev-only preview harness for the dashboard Sidebar.
// Delete after the visual pass. Never routed in production.
import { useState } from 'react'
import { notFound } from 'next/navigation'
import Sidebar from '../dashboard/Sidebar'
import type { WeeklyReviewState } from '@/contexts/subscriptions/domain/weekly-review'
import type { MonthlyReviewWindow } from '@/contexts/subscriptions/domain/monthly-review'

// Mirrors the live QA scenario: week 3 open (2d left), weeks 1+2 late
// (19d/12d → oldest expires in 11d), nothing submitted, week 4 upcoming.
// Consistent by construction: submitted must equal completed.length, and
// aedPending = open×5 + late×2 (see weekly-review-queries.ts).
const WEEKLY: WeeklyReviewState = {
  current: { week: 3, range: 'Aug 7 — Aug 13', daysLeft: 2 },
  late: [
    { week: 2, range: 'Jul 31 — Aug 6', daysLate: 12 },
    { week: 1, range: 'Jul 24 — Jul 30', daysLate: 19 },
  ],
  justSubmitted: null,
  completed: [],
  rewards: { submitted: 0, total: 4, aedEarned: 0, aedPending: 9, cycle: 'August cycle', label: 'Rewards' },
}

const MONTHLY: MonthlyReviewWindow = {
  eligible: false, locked: false, submitted: false,
  daysLeftForFullReward: 0, daysSinceCycleEnd: 0,
  expired: false, preCron: false, cycleLabel: null, planTier: 'monthly',
}

export default function DevSidebarPreview() {
  if (process.env.NODE_ENV !== 'development') notFound()
  const [open, setOpen] = useState(false)
  return (
    <div style={{ minHeight: '100vh', background: 'var(--ds-bg-gradient, #efe9dd)' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{ position: 'fixed', top: 12, right: 12, zIndex: 10, padding: '10px 14px' }}
      >
        toggle drawer
      </button>
      <Sidebar
        customerName="Omar Patel"
        customerCid="DM1042"
        customerDorm="UOWD"
        userEmail="omar@example.com"
        isAdmin
        referralData={{ total: 3, converted: 1, creditBalance: 55, creditPending: 20 }}
        dormWarsEligible
        mobileOpen={open}
        onMobileClose={() => setOpen(false)}
        weeklyReviewState={WEEKLY}
        monthlyWindow={MONTHLY}
        intakePaused
        walletRows={[
          { amount_aed: 30, eligible_plan_ids: null },
          { amount_aed: 20, eligible_plan_ids: ['monthly-max', 'monthly-premium'] },
        ]}
      />
    </div>
  )
}
