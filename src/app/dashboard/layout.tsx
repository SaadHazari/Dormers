import { getUserFromHeaders } from '@/utils/supabase/auth'
import { getCustomer, getActiveSubscription, getReferralCount } from '@/utils/supabase/queries'
import DashboardShell from './DashboardShell'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getUserFromHeaders()

  let customerName = ''
  let customerCid  = ''
  let customerDorm = ''
  let planName     = ''
  let referralCount = 0
  const userEmail  = user?.email ?? ''

  if (user) {
    // Cached helpers — pages that re-call these in the same request will
    // hit React's request-scoped cache and skip the network round-trip.
    const [customer, activeSubscription, referrals] = await Promise.all([
      getCustomer(user.id),
      getActiveSubscription(user.id),
      getReferralCount(user.id),
    ])
    customerName  = customer?.name      ?? ''
    customerCid   = customer?.cid       ?? ''
    customerDorm  = customer?.dorm_name ?? ''
    planName      = activeSubscription?.plan_name ?? ''
    referralCount = referrals
  }

  return (
    /* Cream background fills the whole viewport */
    <div style={{ minHeight: '100vh', background: '#ffffff' }}>
      <DashboardShell
        customerName={customerName}
        customerCid={customerCid}
        customerDorm={customerDorm}
        userEmail={userEmail}
        planName={planName}
        referralCount={referralCount}
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
