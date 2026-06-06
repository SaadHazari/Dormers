import { createClient as createAdminClient } from '@supabase/supabase-js'
import { getUserFromHeaders } from '@/utils/supabase/auth'
import { getCustomer, getActiveSubscription, getQueuedSubscription } from '@/infra/supabase/subscriptions-repo'
import { getReferralData, type ReferralData } from '@/infra/supabase/referrals-repo'
import { resolvePlan } from '@/contexts/subscriptions/domain/plans'
import { promotePendingPreferencesIfStale } from '@/contexts/subscriptions/usecases/preferences-actions'
import DashboardShell from './DashboardShell'
import { BugReportTrigger } from './_shared/BugReportTrigger'
import { IdleRefreshToast } from './_shared/IdleRefreshToast'
import { EMPTY_REVIEW_STATE, type WeeklyReviewState } from '@/contexts/subscriptions/domain/weekly-review'
import { getWeeklyReviewState } from '@/utils/supabase/weekly-review-queries'
import { getMonthlyReviewWindow } from '@/utils/supabase/monthly-review-queries'
import type { MonthlyReviewWindow } from '@/contexts/subscriptions/domain/monthly-review'

const EMPTY_MONTHLY_WINDOW: MonthlyReviewWindow = {
  eligible: false, submitted: false,
  daysLeftForFullReward: 0, daysSinceCycleEnd: 0,
  expired: false, preCron: false, cycleLabel: null, planTier: 'monthly',
}
import { rejectExpiredWeeklyReviewPending } from '@/contexts/dorm-wars/domain/review-cleanup'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getUserFromHeaders()

  let customerName = ''
  let customerCid = ''
  let customerDorm = ''
  let planName = ''
  let referralData: ReferralData = { total: 0, converted: 0, creditBalance: 0, creditPending: 0 }
  let weeklyReviewState: WeeklyReviewState = EMPTY_REVIEW_STATE
  let monthlyWindow: MonthlyReviewWindow = EMPTY_MONTHLY_WINDOW
  // Queued-plan summary for the pre-cron overlay's copy variant — when a
  // queued plan exists the overlay reframes the wrap as "close out before
  // your new plan starts". Null when no queued plan.
  let queuedPlanSummary: { planName: string; startDate: string } | null = null
  const userEmail = user?.email ?? ''

  if (user) {
    // Drain pending preferences if the customer's last sub ended without a
    // renewal. Must run BEFORE the cached getCustomer/getActiveSubscription
    // helpers so every nested page reads post-promotion canonical values.
    // Idempotent: a no-op when a live/scheduled sub exists or when no
    // pending changes are queued.
    await promotePendingPreferencesIfStale(user.id)

    // Phase 8K — lazy reconciliation of stranded weekly-review pending
    // credits. Originally lived on the dorm-wars hub only, but users
    // who never visit that page would have stranded pending AED stuck
    // in their wallet forever. Running it from the layout means every
    // dashboard navigation resolves drift. The query is cheap when
    // nothing's stranded (single SELECT, short-circuits on empty
    // result), and the admin client is needed because credits RLS
    // doesn't grant customers direct UPDATE access. Fire-and-forget —
    // never block the page render on cleanup outcomes.
    const reviewCleanupAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    )
    await rejectExpiredWeeklyReviewPending(reviewCleanupAdmin, user.id).catch((err) => {
      console.error('layout: rejectExpiredWeeklyReviewPending failed:', err)
    })

    // Cached helpers — pages that re-call these in the same request will
    // hit React's request-scoped cache and skip the network round-trip.
    const [customer, activeSubscription, queuedSub, referrals, reviewState, monthlyWin] = await Promise.all([
      getCustomer(user.id),
      getActiveSubscription(user.id),
      getQueuedSubscription(user.id),
      getReferralData(user.id),
      getWeeklyReviewState(user.id),
      getMonthlyReviewWindow(user.id),
    ])
    customerName = customer?.name ?? ''
    customerCid = customer?.cid ?? ''
    customerDorm = customer?.dorm_name ?? ''
    planName = activeSubscription?.plan_name ?? ''
    referralData = referrals
    weeklyReviewState = reviewState
    monthlyWindow = monthlyWin
    if (queuedSub) {
      queuedPlanSummary = {
        planName: (queuedSub.plan_name as string) ?? 'Plan',
        startDate: (queuedSub.start_date as string) ?? '',
      }
    }
  }

  // Dorm Wars rewards are Premium/Max-gated (same rule as the hub gate). Users
  // without access (Weekly Flex / Trial / no sub) treat Refer & Earn as their
  // standalone earning model, so its sidebar badge shows referral-only earnings
  // rather than the Dorm Wars wallet.
  const dormWarsEligible = ['monthly-premium', 'monthly-max'].includes(resolvePlan(planName)?.id ?? '')

  return (
    <div className="dash-page" style={{ minHeight: '100vh', background: '#ffffff' }}>
      <DashboardShell
        customerName={customerName}
        customerCid={customerCid}
        customerDorm={customerDorm}
        userEmail={userEmail}
        planName={planName}
        dormWarsEligible={dormWarsEligible}
        referralData={referralData}
        weeklyReviewState={weeklyReviewState}
        monthlyWindow={monthlyWindow}
        queuedPlanSummary={queuedPlanSummary}
      >
        {/* Main content area — sidebar (76px rail + 16px gap = 92px left), 16px breathing room top */}
        <div className="dash-main-row" style={{ display: 'flex', paddingTop: 16 }}>
          <main className="dash-content" style={{ flex: 1, marginLeft: 92, minWidth: 0, padding: '0 16px 16px 8px' }}>
            {/* Tinted container — the visual surface for all dashboard content.
                Right padding accommodates the floating utility cluster (3 icons at top-right). */}
            <div className="content-border" style={{
              position: 'relative',
              borderRadius: 'var(--radius-md)',
              border: '1px solid rgba(245,127,32,0.45)',
              background: '#ede8da',
              minHeight: 'calc(100vh - 32px)',
              overflow: 'hidden',
            }}>
              {children}
              <BugReportTrigger />
            </div>
            <IdleRefreshToast />
          </main>
        </div>
      </DashboardShell>

      <style>{`
        /* The dashboard is a LIGHT interface, but the global navy <body>
           background (for the dark marketing site) propagates to the canvas the
           browser paints in the overscroll rubber-band (pull-to-refresh). A
           GRADIENT on <body> does NOT fill that rubber-band — iOS only honours a
           solid color there, and the gradient shorthand reset background-color to
           transparent, so the navy kept bleeding through. Fix: a solid
           background-color on the ROOT <html>. An explicit html background takes
           over the canvas (body no longer propagates), so the overscroll matches
           the page. Scoped via .dash-page so marketing keeps its dark canvas. */
        html:has(.dash-page) { background-color: #ffffff; }
        /* STABLE twin of the rule above. iOS WebKit can drop a :has() match when
           the subtree mutates (e.g. the mobile drawer opening) — when that happens
           html loses its canvas colour and the global navy body (#091825) bleeds
           through, and stays until a repaint. DashboardShell adds a plain "dash"
           class to html on mount; this class-based rule can't be invalidated, so
           the canvas never falls back to navy. (See the matching body rule below.) */
        html.dash { background-color: #ffffff; }

        @media (max-width: 1024px) {
          .dash-content {
            margin-left: 0 !important;
            /* Top inset clears the fixed hamburger (top:16 + 44h = 60) so page
               content never renders under it — applies to every dashboard page. */
            padding: 52px 8px 8px 8px !important;
          }
          .content-border {
            border-radius: 16px !important;
            min-height: auto !important;
          }
        }
        /* Mobile redesign (≤768): warm grayish-beige page with a faint orange
           breath; the cream orange-bordered content-frame is removed so cards
           float directly on the page. Desktop + tablet keep the cream frame. */
        @media (max-width: 768px) {
          .dash-page {
            background: radial-gradient(135% 55% at 50% 0%, rgba(245,127,32,0.06) 0%, rgba(245,127,32,0) 58%), linear-gradient(180deg, #efe8dc 0%, #e9e2d5 60%, #e7e0d2 100%) !important;
          }
          /* Overscroll rubber-band colour — a solid warm beige so a pull-to-
             refresh shows beige behind the page, never the marketing navy. */
          html:has(.dash-page) { background-color: #efe8dc; }
          html.dash { background-color: #efe8dc; }   /* stable twin (see desktop note) */
          /* HOME canvas is orange. iOS paints this single root background-COLOR into
             BOTH safe-areas / overscroll bands (top AND bottom) — there is NO per-edge
             control, and nothing on the page (fixed, absolute, or in-flow) can override
             the inset (proven exhaustively). So orange shows top AND bottom. The top
             matches the canopy; the bottom strip is embraced as an intentional orange
             base — see the rounded page floor + footer treatment. */
          html:has(.home-mobile) { background-color: #f57f20; }
          /* STABLE twin of the rule above (mirrors html.dash / html:has(.dash-page)).
             iOS WebKit drops the :has(.home-mobile) match when the drawer mutates the
             DOM, so the orange canvas would be lost and the navy body bleed into the
             safe-area chrome and stay. ActiveDashboard marks html with a plain
             dash-home class that can't be invalidated; this holds the orange canvas.
             Placed AFTER the :has rule (equal specificity) so it wins on source order. */
          html.dash-home { background-color: #f57f20; }
          /* Body carries the marketing navy (globals.css) — normally hidden under
             the opaque .dash-page. The home "sunrise wall" is a fixed z-index:-1
             layer, and a negative-z-index layer paints BEHIND in-flow block
             backgrounds (incl. body's), so an opaque body would cover the wall.
             Neutralise it on the dashboard (the canvas colour is owned by the
             html rule above; body's fill is redundant here). */
          body:has(.dash-page) { background: transparent !important; }
          html.dash body { background: transparent !important; }   /* stable twin — the one that stops the navy */
          .dash-content { padding: 14px 14px 28px 14px !important; }
          .content-border {
            background: transparent !important;
            border: none !important;
            border-radius: 0 !important;
            overflow: visible !important;
          }

          /* ── Dorm Wars hub — FULL-BLEED immersive dark ──────────────────────
             Unlike the other mobile surfaces (light cards floating on beige),
             the hub is its own dark world. On phones it runs edge-to-edge so
             there is NO theme-jump from the full-screen navy loading state into
             the loaded hub. Kill the shell gutter + top rail for THIS page only
             (the hub owns all its own padding + safe-area insets internally) and
             paint the root canvas navy so the status-bar / overscroll bands stay
             dark instead of flashing beige. Scoped three ways — :has(.hub-root)
             (loaded), :has(.hub-loading) (suspense), and an html.dash-dormwars
             stable twin (HubClient sets it on mount) so an iOS WebKit :has()
             drop on drawer-open can't revert the bleed. Mirrors the home-orange
             canopy treatment below. */
          .dash-page:has(.hub-root) .dash-main-row,
          .dash-page:has(.hub-loading) .dash-main-row,
          html.dash-dormwars .dash-main-row { padding-top: 0 !important; }
          .dash-page:has(.hub-root) .dash-content,
          .dash-page:has(.hub-loading) .dash-content,
          html.dash-dormwars .dash-content { padding: 0 !important; }
          html:has(.hub-root), html:has(.hub-loading),
          html.dash-dormwars { background-color: #091825 !important; }
          .dash-page:has(.hub-root) .dash-mobile-menu,
          .dash-page:has(.hub-loading) .dash-mobile-menu,
          html.dash-dormwars .dash-mobile-menu { top: calc(16px + env(safe-area-inset-top)) !important; }

          /* ── Main dashboard (home) ONLY — convex orange "sun" canopy ─────────
             A brand-orange band across the top with a SHARP convex lower arc (the
             bottom edge of a setting sun). It sits DISTINCT against the beige and
             never fades or bleeds into it. Two stacked layers, held in --sun-bg:
               1) a radial gradient used as a MASK — transparent INSIDE the
                  ellipse, solid beige (#e7e0d2) OUTSIDE, with a crisp ~1.5px arc
                  edge. That hard edge is what keeps orange and beige separate.
               2) the orange itself — a VERTICAL gradient (full #f57f20 up top,
                  warming LIGHTER toward the arc, never darker than the brand
                  ceiling). It shows ONLY through the hole, sized to the band
                  height so the gradient runs its full range inside the band.
             --sun-h is the single depth dial (raise it to drop the arc lower);
             the 120% width keeps the arc wide + gentle. The canopy is painted as
             .dash-page's OWN scroll-attached background (see below) — NOT a pinned
             fixed layer — so it scrolls away with the content. An earlier version
             pinned it (fixed ::before, a parallax) but that caused iOS scroll jank,
             so it was un-pinned. Scoped via .home-mobile (/dashboard). */
          .dash-page:has(.home-mobile) {
            --sun-h: calc(env(safe-area-inset-top) + 250px);
            --sun-bg:
              radial-gradient(80% var(--sun-h) at 50% 0,
                transparent 0, transparent calc(100% - 1.5px), #e7e0d2 100%)
                0 0 / 100% 100% no-repeat,
              linear-gradient(180deg, #f57f20 0%, #f88e38 50%, #fcab63 100%)
                0 0 / 100% var(--sun-h) no-repeat,
              #e7e0d2;
            /* Canopy painted as the page's OWN (scroll-attached) background — NOT a
               fixed/pinned layer. It scrolls away with the content (no parallax) and
               covers the full scrollable height: arc at the top, beige #e7e0d2 floor
               everywhere below. Un-pinned from the old fixed ::before because that
               fixed layer made iOS scroll janky and let the orange root canvas peek
               through at the bottom; a scroll-attached background is smooth and keeps
               beige over the whole document (only the OS safe-area inset stays root-
               orange — that one is unreachable by any page layer). */
            background: var(--sun-bg) !important;
          }
          /* Clear the notch on home: pad content + the floating burger below the
             safe-area inset so the greeting sits ON the orange, not under the
             status bar. env() resolves to 0 on non-notch devices — a no-op there. */
          .dash-page:has(.home-mobile) .dash-content {
            padding-top: calc(14px + env(safe-area-inset-top)) !important;
          }
          .dash-page:has(.home-mobile) .dash-mobile-menu {
            top: calc(16px + env(safe-area-inset-top)) !important;
          }
        }
        /* NOTE: the canopy is no longer a pinned fixed layer (it was a parallax via
           a fixed ::before). It's now .dash-page's scroll-attached background, which
           scrolls with the content — smoother on iOS, no motion to gate. */
      `}</style>
    </div>
  )
}
