'use client'

import { useState } from 'react'
import { Menu as MenuIcon } from 'lucide-react'
import Sidebar from './Sidebar'
import type { ReferralData } from '@/utils/supabase/queries'
import { EMPTY_REVIEW_STATE, type WeeklyReviewState } from '@/contexts/subscriptions/domain/weekly-review'
import type { MonthlyReviewWindow } from '@/contexts/subscriptions/domain/monthly-review'
import { MonthlyWrapForceOverlay } from './_shared/MonthlyWrapForceOverlay'

const DEFAULT_MONTHLY_WINDOW: MonthlyReviewWindow = {
  eligible: false, submitted: false,
  daysLeftForFullReward: 0, daysSinceCycleEnd: 0,
  expired: false, preCron: false, cycleLabel: null, planTier: 'monthly',
}

interface Props {
  customerName:  string
  customerCid:   string
  customerDorm:  string
  userEmail:     string
  planName:      string
  referralData?: ReferralData
  weeklyReviewState?: WeeklyReviewState
  monthlyWindow?: MonthlyReviewWindow
  queuedPlanSummary?: { planName: string; startDate: string } | null
  children: React.ReactNode
}

const DEFAULT_REFERRAL: ReferralData = { total: 0, converted: 0, creditBalance: 0, creditPending: 0 }

export default function DashboardShell({
  customerName, customerCid, customerDorm, userEmail,
  referralData = DEFAULT_REFERRAL,
  weeklyReviewState = EMPTY_REVIEW_STATE,
  monthlyWindow = DEFAULT_MONTHLY_WINDOW,
  queuedPlanSummary = null,
  children,
}: Props) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <>
      <Sidebar
        customerName={customerName}
        customerCid={customerCid}
        customerDorm={customerDorm}
        userEmail={userEmail}
        referralData={referralData}
        weeklyReviewState={weeklyReviewState}
        monthlyWindow={monthlyWindow}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      {/* Mobile hamburger — only visible on small screens, opens the sidebar drawer. */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="Open menu"
        className="dash-mobile-menu"
        style={{
          position: 'fixed', top: 16, left: 16, zIndex: 70,
          width: 44, height: 44, display: 'none',
          alignItems: 'center', justifyContent: 'center',
          borderRadius: 'var(--radius-md)',
          background: 'rgba(255,255,255,0.85)',
          border: '1px solid rgba(9,24,37,0.10)',
          backdropFilter: 'blur(20px) saturate(1.4)',
          boxShadow: 'var(--shadow-md)',
          cursor: 'pointer', color: '#091825',
        }}
      >
        <MenuIcon size={18} strokeWidth={2} />
      </button>

      {children}

      {/* Pre-cron forcing overlay — fires once per session on the evening
          of the last delivery day of a cycle. Component self-gates on
          monthlyWindow.preCron and sessionStorage dismissal. Mounting it
          here (in the shell) means it fires on whichever dashboard page
          the user lands on, not just /dashboard. */}
      <MonthlyWrapForceOverlay
        monthlyWindow={monthlyWindow}
        queuedPlanSummary={queuedPlanSummary}
      />

      <style jsx global>{`
        @media (max-width: 1024px) {
          .dash-mobile-menu { display: flex !important; }
        }
      `}</style>
    </>
  )
}
