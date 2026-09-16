// Dev-only harness for the customer page's refund panel (the owner's
// "Allow a refund" switch). /admin/* needs a real admin session, so this
// renders RefundPanel against fixtures. Unreachable in production. The
// buttons open their dialogs; confirming calls the real action, which
// refuses without an admin session.
//
// Query params:
//   ?state=off          switch off, no history (default)
//   ?state=on           switch on, the plan qualifies
//   ?state=blocked      switch on, the plan does not qualify
//   ?state=failed       a refund failed at Stripe, and a credit note failed
//   ?state=done         a finished refund with its credit note
import { notFound } from 'next/navigation'
import { AdminThemeProvider } from '@/app/admin/_components/AdminThemeProvider'
import { PreviewSurface } from '../season-admin/PreviewSurface'
import { RefundPanel, type RefundPanelData } from '@/app/admin/customers/[id]/RefundPanel'

export const dynamic = 'force-dynamic'

const EMPTY: RefundPanelData = { allowedAt: null, allowedBy: null, currentPlanName: 'Monthly Premium', offer: null, refunds: [], creditNotes: [] }

const REFUND = {
  id: 'r-1', planName: 'Monthly Premium', meals: 14, tonightKept: true, cashFils: 28000, creditFils: 1400,
  stripeRefundId: 're_3Q2fixture', error: null, at: '2026-09-16T15:10:00Z', stuck: false,
}
const NOTE = { id: 'n-1', kind: 'plan_refund' as const, cashFils: 28000, number: 'CN-YUG1243-20260916', done: true, error: null, at: '2026-09-16T15:10:05Z' }

function fixture(state: string | undefined): RefundPanelData {
  switch (state) {
    case 'on':
      return { ...EMPTY, allowedAt: '2026-09-16T09:00:00Z', allowedBy: 'saad@dormers.co', offer: { refundedMeals: 16, tonightKept: false, cashFils: 35200, creditFils: 1600 } }
    case 'blocked':
      return { ...EMPTY, allowedAt: '2026-09-16T09:00:00Z', allowedBy: 'saad@dormers.co', currentPlanName: 'Staff Monthly' }
    case 'failed':
      return {
        ...EMPTY,
        currentPlanName: null,
        refunds: [
          { ...REFUND, state: 'failed', stripeRefundId: null, error: 'Stripe: This charge is disputed and cannot be refunded.' },
          { ...REFUND, id: 'r-2', planName: 'Weekly Flex', meals: 5, cashFils: 12500, creditFils: 0, state: 'processing', stripeRefundId: null, stuck: true },
        ],
        creditNotes: [{ ...NOTE, id: 'n-2', kind: 'season_refund', number: null, done: false, error: 'The order has no Zoho invoice yet, so there is nothing to credit.' }],
      }
    case 'done':
      return { ...EMPTY, currentPlanName: null, refunds: [{ ...REFUND, state: 'refunded' }], creditNotes: [NOTE] }
    default:
      return EMPTY
  }
}

export default async function RefundPanelPreviewPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  if (process.env.NODE_ENV === 'production') notFound()
  const { state } = await searchParams
  return (
    <AdminThemeProvider>
      <PreviewSurface>
        <div className="max-w-[1100px] mx-auto">
          <RefundPanel customerId="preview-customer" firstName="Omar" data={fixture(state)} />
        </div>
      </PreviewSurface>
    </AdminThemeProvider>
  )
}
