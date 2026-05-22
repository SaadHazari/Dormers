import { createClient as createAdminClient } from '@supabase/supabase-js'
import { getUserFromHeaders } from '@/utils/supabase/auth'
import { getCustomer, getActiveSubscription, getReferralData, type ReferralData } from '@/utils/supabase/queries'
import { promotePendingPreferencesIfStale } from './actions'
import DashboardShell from './DashboardShell'
import { badgeFromReviewState, type WeeklyReviewBadge } from '@/lib/weekly-review'
import { getWeeklyReviewState } from '@/utils/supabase/weekly-review-queries'
import { rejectExpiredWeeklyReviewPending } from '@/lib/dorm-wars/review-cleanup'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getUserFromHeaders()

  let customerName = ''
  let customerCid  = ''
  let customerDorm = ''
  let planName     = ''
  let referralData: ReferralData = { total: 0, converted: 0, creditBalance: 0, creditPending: 0 }
  let weeklyReviewBadge: WeeklyReviewBadge = 'none'
  const userEmail  = user?.email ?? ''

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
    const [customer, activeSubscription, referrals, weeklyReviewState] = await Promise.all([
      getCustomer(user.id),
      getActiveSubscription(user.id),
      getReferralData(user.id),
      getWeeklyReviewState(user.id),
    ])
    customerName = customer?.name      ?? ''
    customerCid  = customer?.cid       ?? ''
    customerDorm = customer?.dorm_name ?? ''
    planName     = activeSubscription?.plan_name ?? ''
    referralData = referrals
    weeklyReviewBadge = badgeFromReviewState(weeklyReviewState)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#ffffff' }}>
      <DashboardShell
        customerName={customerName}
        customerCid={customerCid}
        customerDorm={customerDorm}
        userEmail={userEmail}
        planName={planName}
        referralData={referralData}
        weeklyReviewBadge={weeklyReviewBadge}
      >
        {/* Main content area — sidebar (76px rail + 16px gap = 92px left), 16px breathing room top */}
        <div style={{ display: 'flex', paddingTop: 16 }}>
          <main className="dash-content" style={{ flex: 1, marginLeft: 92, minWidth: 0, padding: '0 16px 16px 8px' }}>
            {/* Tinted container — the visual surface for all dashboard content.
                Right padding accommodates the floating utility cluster (3 icons at top-right). */}
            <div className="content-border" style={{
              borderRadius: 'var(--radius-md)',
              border: '1px solid rgba(245,127,32,0.45)',
              background: '#ede8da',
              minHeight: 'calc(100vh - 32px)',
              overflow: 'hidden',
            }}>
              {children}
            </div>
          </main>
        </div>
      </DashboardShell>

      <style>{`
        @media (max-width: 1024px) {
          .dash-content {
            margin-left: 0 !important;
            padding: 8px !important;
          }
          .content-border {
            border-radius: 16px !important;
            min-height: auto !important;
          }
        }
      `}</style>
    </div>
  )
}
