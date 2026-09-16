'use client'

/**
 * The owner's refund queue (spec §10.3, §11.3, D6): every hold whose customer
 * asked for a refund, with Give the refund and Say no on a request and Try
 * the refund again on a failure, each behind a dialog that says what happens. It lives in the Season page's Needs you list, in every phase,
 * until the queue is empty. Every amount comes from the hold row: SQL stored
 * it at request time and recomputes it at approval.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useAdminTheme } from '../_components/AdminThemeProvider'
import { AdminButton } from '../_components/AdminButton'
import { formatAed } from '@/contexts/season/domain/meal-value'
import { SEASON_REFUNDS_LIVE } from '@/contexts/season/domain/season-release'
import { approveSeasonRefundAction, declineSeasonRefundAction } from './actions'
import { holdStateLabel, refundExposure } from './season-break-view'
import type { SeasonHoldRow } from './season-data'
import { ConfirmDialog, plural } from './season-ui'

export function RefundQueue({ queue }: { queue: SeasonHoldRow[] }) {
  const { t } = useAdminTheme()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null)
  const [declining, setDeclining] = useState<SeasonHoldRow | null>(null)
  const [approving, setApproving] = useState<SeasonHoldRow | null>(null)
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
      setApproving(null)
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
    <div data-testid="season-refund-queue">
      <div className={`text-[13px] font-bold ${t.heading}`}>
        {plural(queue.length, 'refund request', 'refund requests')} waiting for you
      </div>
      <div className={`text-[12px] mt-1 ${t.muted}`}>
        If you say yes to all of them: {formatAed(exposure.cashFils)} goes back to cards and {formatAed(exposure.creditFils)} back to Dormers wallets.
      </div>

      <ul className="mt-3 flex flex-col gap-2">
        {queue.map((h) => {
          const busy = pending && busyId === h.id
          return (
            <li key={h.id} data-testid={`refund-row-${h.state}`} className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg px-3 py-3 ${t.card}`}>
              <div className="min-w-[160px] flex-1">
                <div className={`text-[13px] font-bold ${t.heading}`}>{h.customerName}</div>
                <div className={`text-[12px] ${t.muted}`}>{h.planName} · {plural(h.heldMeals, 'meal', 'meals')} kept</div>
              </div>
              <div className="min-w-[120px] tabular-nums">
                <div className={`text-[13px] font-bold ${t.heading}`}>{formatAed(h.cashRefundFils ?? 0)} <span className={`font-medium ${t.muted}`}>to their card</span></div>
                {(h.creditShareFils ?? 0) > 0 && <div className={`text-[12px] ${t.muted}`}>{formatAed(h.creditShareFils ?? 0)} to their wallet</div>}
              </div>
              <div className="min-w-[140px] flex-1">
                <div className={`text-[12px] font-bold ${h.state === 'refund_failed' ? t.danger : t.body}`}>{holdStateLabel(h.state)}</div>
                {h.state === 'refund_failed' && h.lastError && <div className={`text-[12px] ${t.danger}`}>{h.lastError}</div>}
                {h.state === 'refund_processing' && <div className={`text-[12px] ${t.muted}`}>Stripe is sending it. You get a WhatsApp if it takes over 30 minutes.</div>}
              </div>
              <div className="flex gap-2">
                {h.state === 'refund_requested' && (
                  <>
                    <AdminButton id={`refund-decline-${h.id}`} variant="ghost" onClick={() => { setNote(null); setReason(''); setDeclining(h) }} disabled={pending}>Say no</AdminButton>
                    <AdminButton id={`refund-approve-${h.id}`} onClick={() => { setNote(null); setApproving(h) }} loading={busy} disabled={pending}>Give the refund</AdminButton>
                  </>
                )}
                {h.state === 'refund_failed' && (
                  <AdminButton id={`refund-retry-${h.id}`} onClick={() => { setNote(null); setApproving(h) }} loading={busy} disabled={pending}>Try the refund again</AdminButton>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      {note && <p data-testid="season-refund-note" role="status" className={`mt-3 text-[12px] font-bold ${note.error ? t.danger : t.success}`}>{note.text}</p>}

      {approving && (
        <ConfirmDialog
          title={approving.state === 'refund_failed' ? `Try ${approving.customerName}'s refund again?` : `Give ${approving.customerName} a refund?`}
          lines={[
            ...(approving.state === 'refund_failed' && approving.lastError ? [`Last time it did not work. Stripe said: ${approving.lastError}`] : []),
            `**${formatAed(approving.cashRefundFils ?? 0)}** goes back to the card they paid with, through Stripe.`,
            ...((approving.creditShareFils ?? 0) > 0 ? [`**${formatAed(approving.creditShareFils ?? 0)}** goes back to their Dormers wallet, for the part they paid with credit.`] : []),
            `Their ${approving.planName} plan ends, and the ${plural(approving.heldMeals, 'kept meal is', 'kept meals are')} cancelled.`,
            'They keep the credit they got for joining the waiting list.',
            'They get a message saying the refund is on its way.',
          ]}
          undo={approving.state === 'refund_failed'
            ? 'No. But trying again is safe: they can never be paid twice.'
            : 'No. Once Stripe sends the money, the plan cannot be brought back.'}
          cta={approving.state === 'refund_failed' ? 'Yes, try again' : 'Yes, give the refund'}
          confirmId="refund-approve-confirm"
          pending={pending && busyId === approving.id}
          error={note?.error ? note.text : null}
          onCancel={() => setApproving(null)}
          onConfirm={() => approve(approving)}
        />
      )}

      {declining && (
        <ConfirmDialog
          title={`Say no to ${declining.customerName}'s refund?`}
          lines={[
            `No money moves. Their **${plural(declining.heldMeals, 'meal stays', 'meals stay')}** kept for next semester.`,
            'They see your reason on their plan page and by email, so write it to them.',
          ]}
          undo="Not from here. They can ask for a refund again from their plan page."
          cta="Say no and tell them"
          confirmId="refund-decline-confirm"
          pending={pending && busyId === declining.id}
          error={note?.error ? note.text : null}
          onCancel={() => setDeclining(null)}
          onConfirm={decline}
          confirmDisabled={reason.trim().length === 0}
        >
          <textarea
            id="refund-decline-reason"
            aria-label="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={300}
            placeholder="For example: the card on this order has expired, so message us on WhatsApp and we will sort it out by transfer."
            className={`w-full rounded-lg border px-3 py-2 text-[13px] ${t.input} ${t.inputFocus}`}
          />
        </ConfirmDialog>
      )}
    </div>
  )
}
