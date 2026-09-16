'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { BODY, OG, TIER_POP_TEXT } from './tokens'
import { refundRemainingMeals } from '@/contexts/subscriptions/usecases/plan-refund-actions'
import {
  PLAN_REFUND_COPY, planRefundConfirmLines, planRefundMoneyPhrase, type PlanRefundOffer,
} from '@/contexts/subscriptions/domain/plan-refund'

/** What My Plan knows about a refund of the current plan. */
export interface PlanRefundView {
  /** Only set while the owner's switch is on and the plan qualifies. */
  offer: PlanRefundOffer | null
  /** The plan was refunded after 2 PM: tonight's dinner is the last one. */
  lastDinnerTonight: boolean
}

/**
 * Refund my remaining meals, inside the dark current-plan card on My Plan
 * (desktop and mobile). Hidden unless the owner turned the switch on for this
 * customer. The confirm step is inline, like the held-plan refund on home.
 */
export function PlanRefundBlock({ subscriptionId, refund }: { subscriptionId: string; refund: PlanRefundView | null | undefined }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null)
  const [pending, start] = useTransition()

  if (!refund || (!refund.offer && !refund.lastDinnerTonight && !note)) return null

  const line = { fontFamily: BODY, fontSize: 12.5, color: TIER_POP_TEXT.muted, lineHeight: 1.5, margin: 0 } as const
  const pill = (primary: boolean) => ({
    minHeight: 40, padding: '9px 18px', borderRadius: 999,
    border: primary ? 0 : '1px solid rgba(245,240,232,0.28)',
    background: primary ? OG : 'rgba(245,240,232,0.10)',
    color: primary ? '#fff' : TIER_POP_TEXT.primary,
    fontFamily: BODY, fontSize: 12.5, fontWeight: 700, cursor: pending ? 'default' : 'pointer',
  } as const)

  const confirm = () => {
    setNote(null)
    start(async () => {
      const result = await refundRemainingMeals(subscriptionId)
      setConfirming(false)
      if ('error' in result) { setNote({ text: result.error, error: true }); return }
      // No refresh yet: the plan may have ended, which would take this card
      // (and the confirmation) off the page before it is read.
      setNote({ text: result.message, error: false })
    })
  }

  return (
    <div data-testid="plan-refund" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ height: 1, background: 'rgba(245,240,232,0.15)' }} />
      {note && (
        <p data-testid="plan-refund-note" role="status" style={{ ...line, fontWeight: 700, color: note.error ? '#FFB4A8' : TIER_POP_TEXT.primary }}>{note.text}</p>
      )}
      {note && (
        <div>
          <button data-testid="plan-refund-done" type="button" onClick={() => router.refresh()} style={pill(false)}>Done</button>
        </div>
      )}
      {refund.lastDinnerTonight && !note && (
        <p data-testid="plan-refund-last-dinner" style={{ ...line, color: TIER_POP_TEXT.primary }}>
          Your plan is refunded. Tonight&apos;s dinner is your last one.
        </p>
      )}
      {refund.offer && !note && !confirming && (
        <>
          <p style={line}>
            You can refund the {refund.offer.refundedMeals === 1 ? 'meal' : `${refund.offer.refundedMeals} meals`} you have left: {planRefundMoneyPhrase(refund.offer.cashFils, refund.offer.creditFils)}.
          </p>
          <div>
            <button data-testid="plan-refund-open" type="button" onClick={() => setConfirming(true)} style={pill(false)}>
              {PLAN_REFUND_COPY.button}
            </button>
          </div>
        </>
      )}
      {refund.offer && confirming && (
        <div data-testid="plan-refund-confirm" style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(245,240,232,0.06)', border: '1px solid rgba(245,240,232,0.18)' }}>
          <div style={{ fontFamily: BODY, fontSize: 14, fontWeight: 700, color: TIER_POP_TEXT.primary }}>{PLAN_REFUND_COPY.confirmTitle}</div>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {planRefundConfirmLines(refund.offer).map((l) => <li key={l} style={line}>{l}</li>)}
          </ul>
          <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button data-testid="plan-refund-keep" type="button" onClick={() => setConfirming(false)} disabled={pending} style={pill(false)}>{PLAN_REFUND_COPY.keep}</button>
            <button data-testid="plan-refund-confirm-yes" type="button" onClick={confirm} disabled={pending} style={pill(true)}>
              {pending ? PLAN_REFUND_COPY.pending : PLAN_REFUND_COPY.confirm}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
