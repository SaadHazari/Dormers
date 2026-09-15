'use client'

/**
 * The owner's refund queue (spec §10.3, §11.3, D6): every hold whose customer
 * asked for a refund, with Approve and Decline on a request and Retry on a
 * failure. Shown on the break board and, after reopening, above the planner
 * until the queue is empty. Every amount comes from the hold row: SQL stored
 * it at request time and recomputes it at approval.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Banknote } from 'lucide-react'
import { useAdminTheme } from '../_components/AdminThemeProvider'
import { AdminModal } from '../_components/AdminModal'
import { AdminButton } from '../_components/AdminButton'
import { formatAed } from '@/contexts/season/domain/meal-value'
import { SEASON_REFUNDS_LIVE } from '@/contexts/season/domain/season-release'
import { approveSeasonRefundAction, declineSeasonRefundAction } from './actions'
import { holdStateLabel, refundExposure } from './season-break-view'
import type { SeasonHoldRow } from './season-data'

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

export function RefundQueue({ queue }: { queue: SeasonHoldRow[] }) {
  const { t } = useAdminTheme()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null)
  const [declining, setDeclining] = useState<SeasonHoldRow | null>(null)
  const [reason, setReason] = useState('')

  if (!SEASON_REFUNDS_LIVE || queue.length === 0) return null
  const exposure = refundExposure(queue)

  function approve(hold: SeasonHoldRow) {
    setNote(null)
    setBusyId(hold.id)
    startTransition(async () => {
      const result = await approveSeasonRefundAction(hold.id)
      setBusyId(null)
      if ('error' in result) { setNote({ text: result.error, error: true }); return }
      setNote({ text: `${hold.customerName}: ${result.message}`, error: false })
      router.refresh()
    })
  }

  function decline() {
    if (!declining) return
    setNote(null)
    setBusyId(declining.id)
    startTransition(async () => {
      const result = await declineSeasonRefundAction(declining.id, reason)
      setBusyId(null)
      if ('error' in result) { setNote({ text: result.error, error: true }); return }
      setNote({ text: `${declining.customerName}: ${result.message}`, error: false })
      setDeclining(null)
      setReason('')
      router.refresh()
    })
  }

  return (
    <div data-testid="season-refund-queue" className={`rounded-xl border p-4 mt-3 ${t.warningBg} ${t.warning}`}>
      <div className="flex items-start gap-3">
        <Banknote size={16} strokeWidth={2.2} className="mt-0.5 shrink-0" />
        <div>
          <div className="text-[14px] font-black">{plural(queue.length, 'refund request', 'refund requests')} waiting for you</div>
          <div className={`text-[12px] font-medium mt-0.5 max-w-[72ch] ${t.body}`}>
            {formatAed(exposure.cashFils)} back to cards and {formatAed(exposure.creditFils)} back to wallets if you approve everything. Approving refunds the card through Stripe and ends the plan; the waitlist credit stays with the customer.
          </div>
        </div>
      </div>

      <div className={`mt-3 rounded-xl border overflow-x-auto ${t.border} ${t.card}`}>
        <table className="w-full text-[12px]">
          <thead className={t.tableHeader}>
            <tr>
              {['Customer', 'Plan', 'Meals held', 'To the card', 'To the wallet', 'State', ''].map((h) => (
                <th key={h} className="text-left font-black uppercase tracking-[0.06em] text-[10px] px-3 py-2 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {queue.map((h) => {
              const busy = pending && busyId === h.id
              return (
                <tr key={h.id} className={t.tableRow} data-testid={`refund-row-${h.state}`}>
                  <td className={`px-3 py-2 font-bold ${t.heading}`}>{h.customerName}</td>
                  <td className={`px-3 py-2 whitespace-nowrap ${t.body}`}>{h.planName}</td>
                  <td className={`px-3 py-2 whitespace-nowrap tabular-nums ${t.body}`}>{plural(h.heldMeals, 'meal', 'meals')}</td>
                  <td className={`px-3 py-2 whitespace-nowrap tabular-nums ${t.body}`}>{formatAed(h.cashRefundFils ?? 0)}</td>
                  <td className={`px-3 py-2 whitespace-nowrap tabular-nums ${t.body}`}>{formatAed(h.creditShareFils ?? 0)}</td>
                  <td className={`px-3 py-2 ${t.body}`}>
                    <div className="font-bold whitespace-nowrap">{holdStateLabel(h.state)}</div>
                    {h.state === 'refund_failed' && h.lastError && (
                      <div className={`text-[11px] mt-0.5 max-w-[40ch] ${t.danger}`}><AlertTriangle size={11} className="inline mr-1 -mt-0.5" />{h.lastError}</div>
                    )}
                    {h.state === 'refund_processing' && <div className={`text-[11px] mt-0.5 ${t.muted}`}>Stripe is processing. If this stays for 30 minutes you will get a WhatsApp.</div>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {h.state === 'refund_requested' && (
                      <div className="flex gap-2">
                        <AdminButton id={`refund-approve-${h.id}`} className="!px-3 !py-1.5 !text-[11px]" onClick={() => approve(h)} loading={busy} disabled={pending}>Approve</AdminButton>
                        <AdminButton id={`refund-decline-${h.id}`} className="!px-3 !py-1.5 !text-[11px]" variant="ghost" onClick={() => { setNote(null); setReason(''); setDeclining(h) }} disabled={pending}>Decline</AdminButton>
                      </div>
                    )}
                    {h.state === 'refund_failed' && (
                      <AdminButton id={`refund-retry-${h.id}`} className="!px-3 !py-1.5 !text-[11px]" onClick={() => approve(h)} loading={busy} disabled={pending}>Retry</AdminButton>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {note && <p data-testid="season-refund-note" className={`mt-3 text-[12px] font-bold ${note.error ? t.danger : t.success}`}>{note.text}</p>}

      {declining && (
        <AdminModal label="Decline this refund?" maxW="max-w-[520px]" onBackdrop={() => { if (!pending) setDeclining(null) }}>
          <div className={`px-5 py-4 border-b ${t.border}`}>
            <div className={`text-[15px] font-black ${t.heading}`}>Decline {declining.customerName}&apos;s refund?</div>
          </div>
          <div className="px-5 py-4 flex flex-col gap-3">
            <p className={`text-[13px] font-medium leading-relaxed ${t.body}`}>
              Their {plural(declining.heldMeals, 'meal stays', 'meals stay')} kept for next semester. They read your reason on their plan card and get it by email, so write it to them.
            </p>
            <textarea
              id="refund-decline-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={300}
              placeholder="For example: the card on this order has expired, so message us on WhatsApp and we will sort it out by transfer."
              className={`w-full rounded-lg border px-3 py-2 text-[13px] ${t.border} ${t.input ?? ''}`}
            />
            {note?.error && <p className={`text-[12px] font-bold ${t.danger}`}>{note.text}</p>}
          </div>
          <div className={`flex gap-3 px-5 py-4 border-t ${t.border}`}>
            <AdminButton variant="ghost" onClick={() => setDeclining(null)} disabled={pending}>Keep the request</AdminButton>
            <AdminButton id="refund-decline-confirm" onClick={decline} loading={pending && busyId === declining.id} disabled={reason.trim().length === 0}>Decline and tell them</AdminButton>
          </div>
        </AdminModal>
      )}
    </div>
  )
}
