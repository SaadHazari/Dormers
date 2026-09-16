'use client'

/**
 * The break (spec §11.3) as the Season page draws it: the Reopen panel beside
 * the calendar, and the held plans, refunds and customer pauses below it. The
 * refund queue itself lives in Needs you (spec §10.3).
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'
import { useAdminTheme } from '../_components/AdminThemeProvider'
import { AdminButton } from '../_components/AdminButton'
import { formatAed } from '@/contexts/season/domain/meal-value'
import { OG, OG_DEEP } from '@/app/dashboard/_shared/tokens'
import { reopenSeasonAction } from './actions'
import { SEASON_REFUNDS_LIVE } from '@/contexts/season/domain/season-release'
import { holdStateLabel, reopenConfirmLines, type BreakBoardView } from './season-break-view'
import type { SeasonHoldRow } from './season-data'
import { Chip, ConfirmDialog, RowList, Section, plural } from './season-ui'

/** `savedSpots` is the page's own saved-spots count, so the panel and the list never disagree. */
export function ReopenPanel({ view, savedSpots }: { view: BreakBoardView; savedSpots: number }) {
  const { t } = useAdminTheme()
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function reopen() {
    setError(null)
    startTransition(async () => {
      const result = await reopenSeasonAction()
      if ('error' in result) { setError(result.error); return }
      setConfirming(false)
      router.refresh()
    })
  }

  const target = view.reopenTarget
  const pct = target && target > 0 ? Math.min(100, Math.round((savedSpots / target) * 100)) : null

  return (
    <>
      <div>
        <div className={`text-[12px] font-bold ${t.muted}`}>Ready to reopen?</div>
        <div className={`mt-1 text-[28px] font-black tracking-tight tabular-nums ${t.heading}`}>
          {savedSpots}
          <span className={`ml-1 text-[14px] font-bold ${t.muted}`}>{target != null ? `of ${target} saved spots` : 'saved spots'}</span>
        </div>
        {pct != null && (
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[rgba(128,128,128,0.2)]">
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${OG_DEEP} 0%, ${OG} 100%)` }} />
          </div>
        )}
        <dl className={`mt-4 flex flex-col gap-2 text-[13px] ${t.body}`}>
          <Row term="Held plans" value={`${view.heldPlans.length} · ${plural(view.heldMeals, 'meal', 'meals')}`} />
          <Row term="Ready when you reopen" value={plural(view.readyOnReopen, 'plan', 'plans')} />
          <Row term="Waitlist credit added" value={`${view.creditsMinted} · ${formatAed(view.creditsMintedFils)}`} />
        </dl>
      </div>

      {view.cookingDuringBreak.length === 0 && (
        <p data-testid="season-invariant" role="status" className={`flex items-center gap-2 text-[12px] font-bold ${t.success}`}>
          <CheckCircle2 size={14} strokeWidth={2.4} aria-hidden />
          Kitchen halt holding: nothing will cook.
        </p>
      )}

      <AdminButton id="season-reopen" className="w-full" onClick={() => { setError(null); setConfirming(true) }} disabled={pending}>
        Reopen
      </AdminButton>
      {error && !confirming && <p role="alert" className={`text-[12px] font-bold ${t.danger}`}>{error}</p>}

      {confirming && (
        <ConfirmDialog
          title="Reopen for the new semester?"
          lines={reopenConfirmLines(view)}
          cta="Yes, reopen"
          confirmId="season-reopen-confirm"
          pending={pending}
          error={error}
          onCancel={() => setConfirming(false)}
          onConfirm={reopen}
        />
      )}
    </>
  )
}

function Row({ term, value }: { term: string; value: string }) {
  const { t } = useAdminTheme()
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={t.muted}>{term}</dt>
      <dd className={`text-right font-bold tabular-nums ${t.heading}`}>{value}</dd>
    </div>
  )
}

export function BreakLists({ view }: { view: BreakBoardView }) {
  const { t } = useAdminTheme()
  return (
    <div className="flex flex-col gap-8">
      <Section title="Held for next semester" count={view.heldPlans.length}>
        <RowList
          testId="season-held-plans"
          rows={view.heldPlans}
          empty="No plan is held."
          columns="minmax(0,1.2fr) minmax(0,1fr) 80px 96px minmax(0,1.3fr)"
          headers={['Customer', 'Plan', 'Meals', 'Waitlist credit', 'Refund']}
          cells={(h) => [
            <div key="c" className="flex flex-col items-start gap-1">
              <span className={`font-bold ${t.heading}`}>{h.customerName}</span>
              <Chip tone="held">{holdStateLabel(h.state)}</Chip>
            </div>,
            <div key="p" className={t.body}>
              {h.planName}
              <div className={`text-[12px] ${t.muted}`}>{h.mealValueFils != null ? `${formatAed(h.mealValueFils)} a meal` : 'No meal value'}</div>
            </div>,
            <span key="m" className={`tabular-nums ${t.body}`}>{plural(h.heldMeals, 'meal', 'meals')}</span>,
            <span key="w" className={`tabular-nums ${h.waitlistCreditFils != null ? t.body : t.faint}`}>
              <span className={`md:hidden text-[12px] ${t.muted}`}>Credit </span>
              {h.waitlistCreditFils != null ? formatAed(h.waitlistCreditFils) : 'None'}
            </span>,
            <span key="r" className={`text-[12px] ${t.muted}`}>{refundCell(h)}</span>,
          ]}
        />
      </Section>

      {view.refunded.length > 0 && (
        <Section title="Refunded this season" count={view.refunded.length}>
          <RowList
            testId="season-refunded"
            rows={view.refunded}
            empty="No refund has gone through."
            columns="minmax(0,1.2fr) minmax(0,1fr) 80px minmax(0,1.3fr)"
            headers={['Customer', 'Plan', 'Meals', 'Paid back']}
            cells={(h) => [
              <span key="c" className={`font-bold ${t.heading}`}>{h.customerName}</span>,
              <span key="p" className={t.body}>{h.planName}</span>,
              <span key="m" className={`tabular-nums ${t.body}`}>{plural(h.heldMeals, 'meal', 'meals')}</span>,
              <span key="r" className={`text-[12px] tabular-nums ${t.body}`}>{refundCell(h)}</span>,
            ]}
          />
        </Section>
      )}

      <Section title="Customer pauses" count={view.customerPauses.length}>
        <RowList
          testId="season-customer-pauses"
          rows={view.customerPauses}
          empty="No customer pause carried over."
          columns="minmax(0,1.2fr) minmax(0,1fr) 80px minmax(0,1.3fr)"
          headers={['Customer', 'Plan', 'Meals', 'Saved a spot']}
          cells={(h) => [
            <div key="c" className="flex flex-col items-start gap-1">
              <span className={`font-bold ${t.heading}`}>{h.customerName}</span>
              <Chip>{holdStateLabel(h.state)}</Chip>
            </div>,
            <span key="p" className={t.body}>{h.planName}</span>,
            <span key="m" className={`tabular-nums ${t.body}`}>{plural(h.heldMeals, 'meal', 'meals')}</span>,
            <span key="s" className={h.savedSpot ? t.success : t.muted}>{h.savedSpot ? 'Saved a spot' : 'No saved spot'}</span>,
          ]}
        />
      </Section>
    </div>
  )
}

/** What the customer can ask for, or what happened (spec §10.3). Words only until SEASON_REFUNDS_LIVE. */
function refundCell(h: SeasonHoldRow): string {
  if (!SEASON_REFUNDS_LIVE) return 'Not yet'
  if (h.state === 'refunded') return `${formatAed(h.cashRefundFils ?? 0)} to the card${(h.creditShareFils ?? 0) > 0 ? `, ${formatAed(h.creditShareFils ?? 0)} to the wallet` : ''}${h.stripeRefundId ? ` (${h.stripeRefundId})` : ' (credit only)'}`
  if (h.state === 'refund_requested' || h.state === 'refund_processing' || h.state === 'refund_failed') return `${formatAed(h.cashRefundFils ?? 0)} asked, see Needs you`
  if (h.refundOffer) return `Can ask for ${formatAed(h.refundOffer.cashFils)}${h.refundOffer.creditFils > 0 ? ` + ${formatAed(h.refundOffer.creditFils)} credit` : ''}`
  if (h.reason !== 'season') return 'Not offered (customer pause)'
  return h.mealValueFils == null ? 'Not offered (no recorded money)' : 'Not offered'
}
