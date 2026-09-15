'use client'

/**
 * The break board (spec §11.3): the kitchen halt, held plans, customer pauses,
 * the refund queue (spec §10.3) and Reopen.
 */

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CalendarClock, CheckCircle2, Play } from 'lucide-react'
import { useAdminTheme } from '../_components/AdminThemeProvider'
import { AdminModal } from '../_components/AdminModal'
import { AdminButton } from '../_components/AdminButton'
import type { AdminTokens } from '@/ui-system/tokens/admin-theme'
import { formatAed } from '@/contexts/season/domain/meal-value'
import { formatShortDay } from '@/contexts/season/domain/season-dates'
import { reopenSeasonAction } from './actions'
import { RefundQueue } from './RefundQueue'
import { SEASON_REFUNDS_LIVE } from '@/contexts/season/domain/season-release'
import { breakBoardView, holdStateLabel, reopenConfirmLines } from './season-break-view'
import type { SeasonHoldRow, SeasonPageData } from './season-data'

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

export function BreakBoard({ data }: { data: SeasonPageData }) {
  const { t } = useAdminTheme()
  const router = useRouter()
  const view = useMemo(() => breakBoardView(data), [data])
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

  const lastKitchenDay = data.snapshot.closeDay ? formatShortDay(data.snapshot.closeDay) : null
  const cooking = view.cookingDuringBreak

  return (
    <div className={`mt-6 rounded-xl border p-5 ${t.card}`}>
      <div data-testid="season-status" className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${t.dangerBg} ${t.danger}`}>
        <CalendarClock size={16} strokeWidth={2.2} className="mt-0.5 shrink-0" />
        <div>
          <div className="text-[14px] font-black">On the break</div>
          <div className={`text-[12px] font-medium mt-0.5 max-w-[72ch] ${t.body}`}>
            {lastKitchenDay ? `The last kitchen day was ${lastKitchenDay}. ` : ''}No sales and no cooking until you reopen. Held plans restart only when their customers tap Resume or pick a start date.
          </div>
        </div>
      </div>

      <div
        data-testid="season-invariant"
        role={cooking.length > 0 ? 'alert' : 'status'}
        className={`flex items-start gap-3 px-4 py-3 rounded-xl border mt-3 ${cooking.length > 0 ? `${t.dangerBg} ${t.danger}` : `${t.successBg} ${t.success}`}`}
      >
        {cooking.length > 0
          ? <AlertTriangle size={16} strokeWidth={2.2} className="mt-0.5 shrink-0" />
          : <CheckCircle2 size={16} strokeWidth={2.2} className="mt-0.5 shrink-0" />}
        <div className="text-[12px] font-semibold max-w-[72ch]">
          {cooking.length === 0
            ? 'Kitchen halt holding: no plan is set to cook during the break.'
            : `${plural(cooking.length, 'plan is', 'plans are')} Active during the break and would cook: ${cooking.map((p) => `${p.customerName} (${p.planName})`).join(', ')}. Pause each one from its customer page.`}
        </div>
      </div>

      <RefundQueue queue={view.refundQueue} />

      <div className="grid sm:grid-cols-3 gap-3 mt-4">
        <Fact t={t} label="Held for next semester" value={String(view.heldPlans.length)} detail={plural(view.heldMeals, 'meal', 'meals')} />
        <Fact t={t} label="Waitlist credit added" value={String(view.creditsMinted)} detail={formatAed(view.creditsMintedFils)} />
        <Fact
          t={t}
          label="Waitlist"
          value={String(view.waitlistCount)}
          detail={view.reopenTarget != null ? `Reopen target ${view.reopenTarget}` : 'No reopen target set'}
        />
      </div>

      <div className="mt-5">
        <div className={`text-[11px] font-black uppercase tracking-[0.1em] mb-2 ${t.muted}`}>Held plans</div>
        <HoldsTable
          testId="season-held-plans"
          rows={view.heldPlans}
          empty="No plan is held."
          columns={['Customer', 'Plan', 'Meals held', 'Meal value', 'State', 'Waitlist credit', 'Refund']}
          cells={(h) => [
            h.planName,
            plural(h.heldMeals, 'meal', 'meals'),
            h.mealValueFils != null ? formatAed(h.mealValueFils) : 'Not recorded',
            holdStateLabel(h.state),
            h.waitlistCreditFils != null ? formatAed(h.waitlistCreditFils) : 'None',
            refundCell(h),
          ]}
          t={t}
        />
      </div>

      {view.refunded.length > 0 && (
        <div className="mt-5">
          <div className={`text-[11px] font-black uppercase tracking-[0.1em] mb-2 ${t.muted}`}>Refunded this season</div>
          <HoldsTable
            testId="season-refunded"
            rows={view.refunded}
            empty="No refund has gone through."
            columns={['Customer', 'Plan', 'Meals', 'To the card', 'To the wallet', 'Stripe refund']}
            cells={(h) => [
              h.planName,
              plural(h.heldMeals, 'meal', 'meals'),
              formatAed(h.cashRefundFils ?? 0),
              formatAed(h.creditShareFils ?? 0),
              h.stripeRefundId ?? 'Credit only',
            ]}
            t={t}
          />
        </div>
      )}

      <div className="mt-5">
        <div className={`text-[11px] font-black uppercase tracking-[0.1em] mb-2 ${t.muted}`}>Customer pauses</div>
        <HoldsTable
          testId="season-customer-pauses"
          rows={view.customerPauses}
          empty="No customer pause carried over."
          columns={['Customer', 'Plan', 'Meals', 'State', 'Saved a spot']}
          cells={(h) => [
            h.planName,
            plural(h.heldMeals, 'meal', 'meals'),
            holdStateLabel(h.state),
            (h as SeasonHoldRow & { savedSpot: boolean }).savedSpot ? 'Yes' : 'No',
          ]}
          t={t}
        />
      </div>

      <div className={`mt-5 pt-4 border-t flex items-center gap-3 flex-wrap ${t.border}`}>
        <AdminButton id="season-reopen" icon={<Play size={14} strokeWidth={2.5} />} onClick={() => { setError(null); setConfirming(true) }} disabled={pending}>
          Reopen
        </AdminButton>
        <span className={`text-[12px] font-medium ${t.muted}`}>
          {plural(view.readyOnReopen, 'plan becomes', 'plans become')} ready when you reopen.
        </span>
      </div>
      {error && !confirming && <p className={`mt-3 text-[12px] font-bold ${t.danger}`}>{error}</p>}

      {confirming && (
        <AdminModal label="Reopen for the new semester?" maxW="max-w-[500px]" onBackdrop={() => { if (!pending) setConfirming(false) }}>
          <div className={`px-5 py-4 border-b ${t.border}`}>
            <div className={`text-[15px] font-black ${t.heading}`}>Reopen for the new semester?</div>
          </div>
          <div className="px-5 py-4 flex flex-col gap-2">
            {reopenConfirmLines(view).map((line) => (
              <p key={line} className={`text-[13px] font-medium leading-relaxed ${t.body}`}>{line}</p>
            ))}
            {error && <p className={`text-[12px] font-bold ${t.danger}`}>{error}</p>}
          </div>
          <div className={`flex gap-3 px-5 py-4 border-t ${t.border}`}>
            <AdminButton variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>Cancel</AdminButton>
            <AdminButton id="season-reopen-confirm" onClick={reopen} loading={pending}>Yes, reopen</AdminButton>
          </div>
        </AdminModal>
      )}
    </div>
  )
}

/** What the customer can ask for, or what happened (spec §10.3). Words only until SEASON_REFUNDS_LIVE. */
function refundCell(h: SeasonHoldRow): string {
  if (!SEASON_REFUNDS_LIVE) return 'Not yet'
  if (h.state === 'refunded') return `${formatAed(h.cashRefundFils ?? 0)} to the card${(h.creditShareFils ?? 0) > 0 ? `, ${formatAed(h.creditShareFils ?? 0)} to the wallet` : ''}${h.stripeRefundId ? ` (${h.stripeRefundId})` : ''}`
  if (h.state === 'refund_requested' || h.state === 'refund_processing' || h.state === 'refund_failed') return `${formatAed(h.cashRefundFils ?? 0)} asked (see the queue above)`
  if (h.refundOffer) return `Can ask for ${formatAed(h.refundOffer.cashFils)}${h.refundOffer.creditFils > 0 ? ` + ${formatAed(h.refundOffer.creditFils)} credit` : ''}`
  if (h.reason !== 'season') return 'Not offered (customer pause)'
  return h.mealValueFils == null ? 'Not offered (no recorded money)' : 'Not offered'
}

function Fact({ label, value, detail, t }: { label: string; value: string; detail: string; t: AdminTokens }) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${t.border}`}>
      <div className={`text-[10px] font-black uppercase tracking-[0.1em] ${t.muted}`}>{label}</div>
      <div className={`text-[20px] font-black mt-1 tabular-nums ${t.heading}`}>{value}</div>
      <div className={`text-[12px] font-medium mt-0.5 ${t.muted}`}>{detail}</div>
    </div>
  )
}

function HoldsTable({ testId, rows, empty, columns, cells, t }: {
  testId: string
  rows: SeasonHoldRow[]
  empty: string
  columns: string[]
  cells: (h: SeasonHoldRow) => string[]
  t: AdminTokens
}) {
  if (rows.length === 0) {
    return <p data-testid={testId} className={`text-[13px] font-medium ${t.muted}`}>{empty}</p>
  }
  return (
    <div data-testid={testId} className={`rounded-xl border overflow-x-auto ${t.border}`}>
      <table className="w-full text-[12px]">
        <thead className={t.tableHeader}>
          <tr>
            {columns.map((h) => (
              <th key={h} className="text-left font-black uppercase tracking-[0.06em] text-[10px] px-3 py-2 whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((h) => (
            <tr key={h.id} className={t.tableRow}>
              <td className={`px-3 py-2 font-bold ${t.heading}`}>{h.customerName}</td>
              {cells(h).map((c, i) => (
                <td key={i} className={`px-3 py-2 whitespace-nowrap tabular-nums ${t.body}`}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
