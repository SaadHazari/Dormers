'use client'

// TEMP dev-only preview harness for the dashboard Sidebar.
// Delete after the visual pass. Never routed in production.
import { useState } from 'react'
import { notFound } from 'next/navigation'
import Sidebar from '../dashboard/Sidebar'
import type { WeeklyReviewState } from '@/contexts/subscriptions/domain/weekly-review'
import type { MonthlyReviewWindow } from '@/contexts/subscriptions/domain/monthly-review'

const WEEKLY: WeeklyReviewState = {
  current: { week: 3, range: 'Aug 4 — Aug 10', daysLeft: 1 },
  late: [
    { week: 2, range: 'Jul 28 — Aug 3', daysLate: 13 },
    { week: 1, range: 'Jul 21 — Jul 27', daysLate: 20 },
  ],
  justSubmitted: null,
  completed: [],
  rewards: { submitted: 1, total: 4, aedEarned: 5, aedPending: 15, cycle: 'July cycle', label: 'Rewards' },
}

const MONTHLY: MonthlyReviewWindow = {
  eligible: true, locked: false, submitted: false,
  daysLeftForFullReward: 4, daysSinceCycleEnd: 3,
  expired: false, preCron: false, cycleLabel: 'July', planTier: 'monthly',
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
