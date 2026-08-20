'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { Menu as MenuIcon } from 'lucide-react'
import Sidebar from './Sidebar'
import type { CreditRow } from './_shared/credit-outlook'
import type { ReferralData } from '@/infra/supabase/referrals-repo'
import { EMPTY_REVIEW_STATE, type WeeklyReviewState } from '@/contexts/subscriptions/domain/weekly-review'
import type { MonthlyReviewWindow } from '@/contexts/subscriptions/domain/monthly-review'
import { MonthlyWrapForceOverlay } from './_shared/MonthlyWrapForceOverlay'
import { COMPACT } from './_shared/breakpoints'

const DEFAULT_MONTHLY_WINDOW: MonthlyReviewWindow = {
  eligible: false, locked: false, submitted: false,
  daysLeftForFullReward: 0, daysSinceCycleEnd: 0,
  expired: false, preCron: false, cycleLabel: null, planTier: 'monthly',
}

interface Props {
  customerName:  string
  customerCid:   string
  customerDorm:  string
  userEmail:     string
  planName:      string
  isAdmin?:      boolean
  dormWarsEligible?: boolean
  referralData?: ReferralData
  weeklyReviewState?: WeeklyReviewState
  monthlyWindow?: MonthlyReviewWindow
  queuedPlanSummary?: { planName: string; startDate: string } | null
  /** Seasonal intake pause — drives the "New plans paused" Now-tray entry. */
  intakePaused?: boolean
  /** Approved credit rows — drives the sidebar credit chip. */
  creditRows?: CreditRow[]
  children: React.ReactNode
}

const DEFAULT_REFERRAL: ReferralData = { total: 0, converted: 0, creditBalance: 0, creditPending: 0 }

export default function DashboardShell({
  customerName, customerCid, customerDorm, userEmail,
  isAdmin = false,
  dormWarsEligible = false,
  referralData = DEFAULT_REFERRAL,
  weeklyReviewState = EMPTY_REVIEW_STATE,
  monthlyWindow = DEFAULT_MONTHLY_WINDOW,
  queuedPlanSummary = null,
  intakePaused = false,
  creditRows = [],
  children,
}: Props) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()

  // Mark <html> with a plain, stable `dash` class while any dashboard page is
  // mounted. The dashboard's canvas/body backgrounds are also keyed on this class
  // (layout.tsx) as the robust twin of the `:has(.dash-page)` rules: iOS WebKit
  // can drop a :has() match when the DOM mutates (the mobile drawer opening), at
  // which point the global navy <body> bleeds through and stays. A plain class
  // can't be invalidated that way, so the navy can never resurface. Runs after
  // hydration (before any drawer interaction) and cleans up on leaving the
  // dashboard, so marketing keeps its dark canvas.
  useEffect(() => {
    const root = document.documentElement
    root.classList.add('dash')
    return () => root.classList.remove('dash')
  }, [])

  // ── iOS safe-area canvas controller ──────────────────────────────────────
  // The colour iOS paints into the top/bottom safe-areas (and the overscroll band)
  // is the ROOT <html> background. The stylesheet sets it via :has()/class rules, but
  // iOS does NOT reliably repaint the inset when those change post-load — most visibly,
  // closing the navy drawer left the inset stuck navy because nothing's *value* changed.
  // Fix: drive the html background with an INLINE style keyed on (route, drawer). Inline
  // wins over every stylesheet rule AND a value change forces the repaint. Per the brief:
  //   • main dashboard (/dashboard)  → orange   • drawer open (any page) → orange
  //   • every other dashboard page   → beige (matches that page's surface)
  // COMPACT only; in expanded mode we clear the override so the CSS white canvas
  // stands. Keyed on the shared contract so a portrait iPad, which now renders
  // the mobile tree, gets the matching orange/beige canvas rather than a white
  // band in its safe-area. theme-color meta is kept in lock-step for the Safari
  // versions that tint chrome from it.
  useEffect(() => {
    const root = document.documentElement
    const mq = window.matchMedia(COMPACT)
    const ORANGE = '#f57f20'
    const BEIGE = '#efe8dc'

    const setThemeMeta = (color: string) => {
      let m = document.head.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null
      if (!m) { m = document.createElement('meta'); m.name = 'theme-color'; document.head.appendChild(m) }
      m.content = color
    }

    const apply = () => {
      if (!mq.matches) { root.style.removeProperty('background-color'); return }
      const color = pathname === '/dashboard' || mobileOpen ? ORANGE : BEIGE
      root.style.backgroundColor = color
      setThemeMeta(color)
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [pathname, mobileOpen])

  // Clear the inline canvas override when leaving the dashboard, so the marketing
  // site's dark canvas returns.
  useEffect(() => () => { document.documentElement.style.removeProperty('background-color') }, [])

  return (
    <>
      <Sidebar
        customerName={customerName}
        customerCid={customerCid}
        customerDorm={customerDorm}
        userEmail={userEmail}
        isAdmin={isAdmin}
        dormWarsEligible={dormWarsEligible}
        referralData={referralData}
        weeklyReviewState={weeklyReviewState}
        monthlyWindow={monthlyWindow}
        intakePaused={intakePaused}
        creditRows={creditRows}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      {/* Mobile hamburger — only visible on small screens, opens the sidebar drawer. */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="Open menu"
        aria-expanded={mobileOpen}
        data-open={mobileOpen}
        className="dash-mobile-menu"
        style={{
          // Geometry comes from THE BURGER CONTRACT in dashboard/layout.tsx —
          // the same variables the content-clearance rule reserves space with,
          // so the button can never drift away from the space kept for it.
          position: 'fixed',
          top: 'var(--burger-top, 16px)', left: 'var(--burger-left, 16px)', zIndex: 70,
          width: 'var(--burger-size, 44px)', height: 'var(--burger-size, 44px)', display: 'none',
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
        /* The floating burger belongs to drawer mode only. Keyed on the shared
           contract, otherwise a landscape iPad mini (1024 wide, rail visible)
           renders a burger on top of the sidebar logo. */
        @media ${COMPACT} {
          .dash-mobile-menu { display: flex !important; }
          /* When the drawer is open, the close affordance lives at the drawer's
             top-right (in Sidebar); hide the floating burger so it's not duplicated. */
          .dash-mobile-menu[data-open="true"] { display: none !important; }
        }
      `}</style>
    </>
  )
}
