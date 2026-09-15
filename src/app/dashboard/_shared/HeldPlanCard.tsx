'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CalendarClock } from 'lucide-react'
import { BODY, OG, OG_DEEP, S } from './tokens'
import { heldCardCopy } from './season-break-copy'
import { useSaveSpot } from './use-save-spot'
import { REFUND_COPY } from '@/contexts/season/domain/season-refund'
import { SEASON_REFUNDS_LIVE } from '@/contexts/season/domain/season-release'
import { requestSeasonRefund, cancelSeasonRefundRequest } from '@/contexts/season/usecases/season-refund-actions'
import type { CustomerHold } from '@/contexts/season/domain/customer-hold'

interface Props {
  hold: CustomerHold
  alreadyJoined: boolean
  /** Prospective waitlist credit for this customer's meal preference. */
  creditAed: number
}

/**
 * The plan held over the semester break, on home (desktop and mobile). Same
 * inline card shell as SeasonEndingBanner. Every amount after a join comes
 * from the action's own result. The refund offer and its amounts come from
 * the hold the page loaded (spec §10.3); the button only appears when the
 * offer is there, which needs SEASON_REFUNDS_LIVE.
 */
export function HeldPlanCard({ hold, alreadyJoined, creditAed }: Props) {
  const router = useRouter()
  const { outcome, joining, join } = useSaveSpot()
  const copy = heldCardCopy({ hold, alreadyJoined: alreadyJoined || !!outcome?.joined, creditAed })
  const [confirming, setConfirming] = useState(false)
  const [refundNote, setRefundNote] = useState<{ text: string; error: boolean } | null>(null)
  const [refundPending, startRefund] = useTransition()

  const line = { marginTop: 4, fontFamily: BODY, fontSize: 12.5, color: S.fgMuted, lineHeight: 1.5 } as const
  const pill = (primary: boolean) => ({
    minHeight: 40, padding: '9px 18px', borderRadius: 'var(--radius-pill)',
    border: primary ? 0 : '1px solid var(--ds-border-strong)',
    background: primary ? OG : 'var(--ds-surface2)', color: primary ? '#fff' : S.fg,
    fontFamily: BODY, fontSize: 12.5, fontWeight: 700, cursor: refundPending || joining ? 'default' : 'pointer',
  } as const)

  const askRefund = () => {
    setRefundNote(null)
    startRefund(async () => {
      const result = await requestSeasonRefund(hold.subscriptionId)
      if ('error' in result) { setRefundNote({ text: result.error, error: true }); return }
      setConfirming(false)
      setRefundNote({ text: result.message, error: false })
      router.refresh()
    })
  }
  const cancelRefund = () => {
    setRefundNote(null)
    startRefund(async () => {
      const result = await cancelSeasonRefundRequest(hold.subscriptionId)
      if ('error' in result) { setRefundNote({ text: result.error, error: true }); return }
      setRefundNote({ text: result.message, error: false })
      router.refresh()
    })
  }

  const showJoin = !!copy.joinLine && !outcome?.joined
  const showRefundAsk = SEASON_REFUNDS_LIVE && copy.refundAction === 'ask' && !refundNote?.text.startsWith('Refund requested')
  const showRefundCancel = copy.refundAction === 'cancel'
  const hasActions = showJoin || copy.pickDate || showRefundAsk || showRefundCancel

  return (
    <div
      data-testid="held-plan-card"
      data-state={hold.state}
      role="status"
      style={{
        marginBottom: 18, padding: '14px 18px', borderRadius: 'var(--radius-sm)',
        background: 'var(--ds-og-wash-strong)', border: '1px solid var(--ds-og-border-strong)',
        display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap',
      }}
    >
      <div style={{
        width: 36, height: 36, flexShrink: 0, borderRadius: '50%', background: 'var(--ds-og-wash)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: OG,
      }}>
        <CalendarClock size={18} strokeWidth={2.2} aria-hidden />
      </div>
      <div style={{ flex: '1 1 220px', minWidth: 0 }}>
        <div style={{ fontFamily: BODY, fontSize: 14, fontWeight: 700, color: S.fg, lineHeight: 1.35 }}>{copy.headline}</div>
        <div style={line}>{copy.body}</div>
        {copy.creditLine && <div style={{ ...line, color: OG_DEEP, fontWeight: 700, fontFeatureSettings: '"tnum"' }}>{copy.creditLine}</div>}
        {copy.declineLine && <div data-testid="held-plan-decline" style={line}>{copy.declineLine}</div>}
        {copy.refundLine && <div data-testid="held-plan-refund-line" style={line}>{copy.refundLine}</div>}
        {showJoin && <div style={line}>{copy.joinLine}</div>}
        {outcome?.message && <div style={line}>{outcome.message}</div>}
        {outcome?.error && <div style={{ ...line, color: '#b3261e' }}>{outcome.error}</div>}
        {refundNote && <div data-testid="held-plan-refund-note" style={{ ...line, color: refundNote.error ? '#b3261e' : S.fg, fontWeight: 700 }}>{refundNote.text}</div>}
        {confirming && (
          <div data-testid="held-plan-refund-confirm" style={{ marginTop: 10, padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--ds-surface2)', border: '1px solid var(--ds-border-strong)' }}>
            <div style={{ fontFamily: BODY, fontSize: 13, fontWeight: 700, color: S.fg }}>{REFUND_COPY.confirmTitle}</div>
            <div style={line}>
              {hold.refundOffer ? `Your ${hold.heldMeals === 1 ? 'meal is' : `${hold.heldMeals} meals are`} refunded once we confirm on WhatsApp, and your plan ends. Any wallet credit from the hold stays yours.` : ''}
            </div>
            <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button data-testid="held-plan-refund-keep" type="button" onClick={() => setConfirming(false)} disabled={refundPending} style={pill(false)}>{REFUND_COPY.confirmKeep}</button>
              <button data-testid="held-plan-refund-confirm-ask" type="button" onClick={askRefund} disabled={refundPending} style={pill(true)}>
                {refundPending ? 'Sending' : REFUND_COPY.confirmAsk}
              </button>
            </div>
          </div>
        )}
        {hasActions && !confirming ? (
          <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {showJoin && (
              <button data-testid="held-plan-join" type="button" onClick={join} disabled={joining} style={pill(true)}>
                {joining ? 'Saving your spot' : 'Save my spot'}
              </button>
            )}
            {copy.pickDate && (
              <Link data-testid="held-plan-pick-date" href="/dashboard/plan" style={{ ...pill(true), textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                Pick my start date
              </Link>
            )}
            {showRefundAsk && (
              <button data-testid="held-plan-refund" type="button" onClick={() => { setRefundNote(null); setConfirming(true) }} disabled={refundPending} style={pill(false)}>
                {REFUND_COPY.ask}
              </button>
            )}
            {showRefundCancel && (
              <button data-testid="held-plan-refund-cancel" type="button" onClick={cancelRefund} disabled={refundPending} style={pill(false)}>
                {refundPending ? 'One moment' : REFUND_COPY.cancel}
              </button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
