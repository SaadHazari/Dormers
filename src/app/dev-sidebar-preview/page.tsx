'use client'

/**
 * TEMP dev-only harness — screenshot verification for the sidebar + Credit
 * Wallet critique session. DELETE after QA; never commit. Mounts the real
 * Sidebar with realistic fixture props so collapsed/hover/drawer/dropdown
 * states can be captured headlessly without auth.
 *
 * ?drawer=1  → force the mobile drawer open (mobileOpen)
 * ?empty=1   → zero wallet + empty review state (baseline rail)
 */

import { notFound, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import Sidebar from '../dashboard/Sidebar'
import { MobileCreditChip } from '../dashboard/_mobile/MobileCreditChip'
import { EMPTY_REVIEW_STATE, type WeeklyReviewState } from '@/contexts/subscriptions/domain/weekly-review'
import type { MonthlyReviewWindow } from '@/contexts/subscriptions/domain/monthly-review'

const REVIEW_STATE: WeeklyReviewState = {
  current: { week: 3, range: 'Aug 10 to Aug 16', daysLeft: 4 },
  late: [],
  justSubmitted: null,
  completed: [
    { week: 1, range: 'Jul 27 to Aug 2', rewardPct: 100 },
    { week: 2, range: 'Aug 3 to Aug 9', rewardPct: 100 },
  ],
  rewards: {
    submitted: 2, total: 4, aedEarned: 10, aedPending: 5,
    cycle: 'This cycle', label: 'Rewards',
  },
}

const MONTHLY_WINDOW: MonthlyReviewWindow = {
  eligible: false, locked: false, submitted: false,
  daysLeftForFullReward: 0, daysSinceCycleEnd: 0,
  expired: false, preCron: false, cycleLabel: null, planTier: 'monthly',
}

function Preview() {
  const params = useSearchParams()
  const drawer = params.get('drawer') === '1'
  const empty = params.get('empty') === '1'

  // ?homechip=1 — the MobileCreditChip in home context: mock hero card above,
  // mock plan card below, on the beige canvas, both credit states.
  if (params.get('homechip') === '1') {
    const mockCard = (label: string) => (
      <div style={{ borderRadius: 24, padding: 22, background: '#fdfbf6', border: '1px solid rgba(9,24,37,0.06)', fontFamily: 'var(--font-montserrat), sans-serif' }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#f57f20', marginBottom: 10 }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#091825' }}>Mock card body</div>
      </div>
    )
    return (
      <div style={{ minHeight: '100vh', background: '#ede8da', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 375 }}>
        {mockCard('Tonight')}
        <MobileCreditChip rows={[{ amount_aed: 50, eligible_plan_ids: null }, { amount_aed: 100, eligible_plan_ids: ['monthly-premium'] }]} />
        {mockCard('Plan')}
        <MobileCreditChip rows={[{ amount_aed: 100, eligible_plan_ids: ['monthly-max', 'monthly-premium'] }]} />
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#ede8da' }}>
      <Sidebar
        customerName="Sara Al Marri"
        customerCid="DM-1042"
        customerDorm="Al Reef"
        userEmail="sara@example.com"
        referralData={{ total: 3, converted: 2, creditBalance: 40, creditPending: 20 }}
        dormWarsEligible
        creditRows={
          empty ? []
          : params.get('paused-only') === '1'
            ? [{ amount_aed: 100, eligible_plan_ids: ['monthly-max', 'monthly-premium'] }]
            : [
                { amount_aed: 50, eligible_plan_ids: null },
                { amount_aed: 100, eligible_plan_ids: ['monthly-max', 'monthly-premium'] },
              ]
        }
        weeklyReviewState={empty ? EMPTY_REVIEW_STATE : REVIEW_STATE}
        monthlyWindow={MONTHLY_WINDOW}
        mobileOpen={drawer}
        onMobileClose={() => {}}
      />
    </div>
  )
}

export default function DevSidebarPreview() {
  if (process.env.NODE_ENV !== 'development') notFound()
  return (
    <Suspense fallback={null}>
      <Preview />
    </Suspense>
  )
}
