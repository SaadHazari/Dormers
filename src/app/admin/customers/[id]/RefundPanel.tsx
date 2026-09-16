'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useAdminTheme } from '../../_components/AdminThemeProvider'
import { AdminSwitch } from '../../_components/AdminSwitch'
import { AdminButton } from '../../_components/AdminButton'
import { ConfirmDialog, Chip } from '../../season/season-ui'
import { formatAed } from '@/contexts/season/domain/meal-value'
import { PLAN_REFUND_STATE_LABEL, type PlanRefundOffer, type PlanRefundState } from '@/contexts/subscriptions/domain/plan-refund'
import { setRefundAllowedAction, retryPlanRefundAction, retryCreditNoteAction } from './refund-actions'

export interface RefundPanelData {
    allowedAt: string | null
    allowedBy: string | null
    currentPlanName: string | null
    /** What the customer's button refunds right now; null when the switch is off or the plan does not qualify. */
    offer: PlanRefundOffer | null
    refunds: Array<{
        id: string
        planName: string
        state: PlanRefundState
        meals: number
        tonightKept: boolean
        cashFils: number
        creditFils: number
        stripeRefundId: string | null
        error: string | null
        at: string
        /** In progress for over 10 minutes: the request that started it died. */
        stuck: boolean
    }>
    creditNotes: Array<{
        id: string
        kind: 'plan_refund' | 'season_refund'
        cashFils: number
        number: string | null
        done: boolean
        error: string | null
        at: string
    }>
}

type Pending =
    | { kind: 'switch'; next: boolean }
    | { kind: 'retry'; refundId: string; cashFils: number }
    | { kind: 'note'; noteId: string; cashFils: number }

function meals(n: number): string {
    return n === 1 ? '1 meal' : `${n} meals`
}

function shortDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Dubai' })
}

/**
 * The owner's "Allow a refund" switch (owner decision 2026-09-16), the
 * refunds it produced, and the Zoho credit notes behind every card refund.
 * Every button opens What happens / Can I undo this? first.
 */
export function RefundPanel({ customerId, firstName, data }: { customerId: string; firstName: string; data: RefundPanelData }) {
    const { t } = useAdminTheme()
    const router = useRouter()
    const [pending, setPending] = useState<Pending | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
    const [busy, start] = useTransition()
    const allowed = !!data.allowedAt

    function run() {
        if (!pending) return
        setError(null)
        start(async () => {
            const res = pending.kind === 'switch'
                ? await setRefundAllowedAction(customerId, pending.next)
                : pending.kind === 'retry'
                    ? await retryPlanRefundAction(customerId, pending.refundId)
                    : await retryCreditNoteAction(customerId, pending.noteId)
            if (!res.ok) { setError(res.message); return }
            setPending(null)
            setResult(res)
            router.refresh()
        })
    }

    const dialog = (() => {
        if (!pending) return null
        if (pending.kind === 'switch' && pending.next) {
            return {
                title: `Let ${firstName} refund their plan?`,
                lines: [
                    `${firstName} sees **Refund my remaining meals** on My Plan.`,
                    'Pressing it refunds **straight away**, with no second approval from you: the meals left go back to their card, and the share they paid with wallet credit goes back to their wallet.',
                    "The plan ends **then and there**. After 2 PM, tonight's dinner is already cooking, so it is delivered and left out of the refund.",
                    'They get the refund WhatsApp, the refund email and the **credit note PDF** from Zoho. You get a WhatsApp too.',
                    'The switch turns itself **off** after one refund.',
                ],
                undo: 'Yes, until they press the button: turn the switch off and the button disappears. Once they press it, the refund cannot be undone.',
                cta: 'Allow a refund',
                danger: false,
            }
        }
        if (pending.kind === 'switch') {
            return {
                title: 'Hide the refund button?',
                lines: [`${firstName} no longer sees **Refund my remaining meals** on My Plan. Nothing else changes.`],
                undo: 'Yes. Turn the switch on again any time.',
                cta: 'Hide the button',
                danger: false,
            }
        }
        if (pending.kind === 'retry') {
            return {
                title: 'Try the refund again?',
                lines: [
                    `We refund **${formatAed(pending.cashFils)}** to the card, the same amount as before.`,
                    'Then the wallet share goes back, the credit note is sent, and the customer is told.',
                ],
                undo: 'No, but it never pays twice: we first look in Stripe for a refund an earlier attempt already made, and use that one.',
                cta: 'Try the refund again',
                danger: false,
            }
        }
        return {
            title: 'Send the credit note again?',
            lines: [
                `Zoho makes the credit note for **${formatAed(pending.cashFils)}** against the order's invoice, records the refund, and emails the PDF to the customer.`,
                'Steps that already worked are skipped, so there is never a second credit note.',
            ],
            undo: 'No. If a credit note is wrong, void it in Zoho Books.',
            cta: 'Send the credit note',
            danger: false,
        }
    })()

    return (
        <div className={`${t.card} rounded-xl p-4`} data-testid="refund-panel">
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <h3 className={`text-[10px] font-black tracking-[0.14em] uppercase ${t.muted}`}>Refund</h3>
                    <div className={`mt-2 text-[14px] font-bold ${t.heading}`}>Allow a refund</div>
                    <p className={`mt-0.5 text-[12px] leading-relaxed ${t.muted}`}>
                        When this is on, {firstName} sees <strong className={t.body}>Refund my remaining meals</strong> on My Plan. It turns itself off after one refund.
                    </p>
                </div>
                <AdminSwitch
                    checked={allowed}
                    label="Allow a refund"
                    disabled={busy}
                    onChange={(next) => { setError(null); setResult(null); setPending({ kind: 'switch', next }) }}
                />
            </div>

            {allowed && (
                <div className={`mt-3 rounded-lg px-3 py-2 text-[12px] leading-relaxed border ${t.border}`} data-testid="refund-panel-status">
                    <div className={t.muted}>
                        On since {shortDate(data.allowedAt!)}{data.allowedBy ? `, by ${data.allowedBy}` : ''}.
                    </div>
                    {data.offer ? (
                        <div className={`mt-1 ${t.body}`}>
                            Right now the button refunds <strong className={t.heading}>{meals(data.offer.refundedMeals)}</strong> of {data.currentPlanName}:{' '}
                            <strong className={t.heading}>{formatAed(data.offer.cashFils)}</strong> to the card and{' '}
                            <strong className={t.heading}>{formatAed(data.offer.creditFils)}</strong> to the wallet.
                            {data.offer.tonightKept ? " Tonight's dinner still goes out." : ''}
                        </div>
                    ) : (
                        <div className={`mt-1 font-bold ${t.danger}`}>
                            {data.currentPlanName
                                ? `${firstName} sees no button: ${data.currentPlanName} cannot be refunded this way. Only a paid plan on a real card payment, with meals left, not kept for next semester and not already partly refunded in Stripe, qualifies.`
                                : `${firstName} has no current plan, so there is nothing to refund.`}
                        </div>
                    )}
                </div>
            )}

            {data.refunds.length > 0 && (
                <div className="mt-4 flex flex-col gap-2">
                    {data.refunds.map(r => (
                        <div key={r.id} className={`flex flex-wrap items-center justify-between gap-2 border-t pt-2 ${t.border}`}>
                            <div className="min-w-0 text-[12px]">
                                <div className={`font-bold ${t.body}`}>
                                    {r.planName}: {meals(r.meals)}, {formatAed(r.cashFils)} to the card, {formatAed(r.creditFils)} to the wallet
                                </div>
                                <div className={t.faint}>
                                    {shortDate(r.at)}{r.stripeRefundId ? ` · ${r.stripeRefundId}` : ''}{r.tonightKept ? " · ended after that night's dinner" : ''}
                                </div>
                                {r.state === 'failed' && r.error && <div className={`font-bold ${t.danger}`}>{r.error}</div>}
                                {r.stuck && <div className={`font-bold ${t.danger}`}>Stuck for over 10 minutes. Check Stripe, then try again.</div>}
                            </div>
                            <div className="flex items-center gap-2">
                                <Chip tone={r.state === 'refunded' ? 'done' : r.state === 'failed' ? 'wait' : 'quiet'}>{PLAN_REFUND_STATE_LABEL[r.state]}</Chip>
                                {(r.state === 'failed' || r.stuck) && (
                                    <AdminButton variant="primary" disabled={busy} onClick={() => { setError(null); setPending({ kind: 'retry', refundId: r.id, cashFils: r.cashFils }) }}>
                                        Try the refund again
                                    </AdminButton>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {data.creditNotes.length > 0 && (
                <div className="mt-4 flex flex-col gap-2">
                    <div className={`text-[10px] font-black tracking-[0.14em] uppercase ${t.muted}`}>Credit notes</div>
                    {data.creditNotes.map(n => (
                        <div key={n.id} className={`flex flex-wrap items-center justify-between gap-2 border-t pt-2 ${t.border}`}>
                            <div className="min-w-0 text-[12px]">
                                <div className={`font-bold ${t.body}`}>
                                    {n.number ?? 'Not made yet'}: {formatAed(n.cashFils)} ({n.kind === 'season_refund' ? 'season refund' : 'plan refund'})
                                </div>
                                <div className={t.faint}>{shortDate(n.at)}</div>
                                {!n.done && n.error && <div className={`font-bold ${t.danger}`}>{n.error}</div>}
                            </div>
                            <div className="flex items-center gap-2">
                                <Chip tone={n.done ? 'done' : 'wait'}>{n.done ? 'Sent' : 'Not sent'}</Chip>
                                {!n.done && (
                                    <AdminButton variant="primary" disabled={busy} onClick={() => { setError(null); setPending({ kind: 'note', noteId: n.id, cashFils: n.cashFils }) }}>
                                        Send the credit note again
                                    </AdminButton>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {result && (
                <div className={`mt-3 px-3 py-2 rounded-lg text-[12px] font-bold border ${result.ok ? t.successBg : t.dangerBg} ${result.ok ? t.success : t.danger}`}>
                    {result.message}
                </div>
            )}

            {dialog && (
                <ConfirmDialog
                    title={dialog.title}
                    lines={dialog.lines}
                    undo={dialog.undo}
                    cta={dialog.cta}
                    danger={dialog.danger}
                    pending={busy}
                    error={error}
                    onCancel={() => { setPending(null); setError(null) }}
                    onConfirm={run}
                />
            )}
        </div>
    )
}
