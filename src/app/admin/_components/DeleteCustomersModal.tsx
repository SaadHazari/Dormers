'use client'

import { useMemo, useState, useTransition } from 'react'
import { AlertTriangle, Trash2 } from 'lucide-react'
import { useAdminTheme } from './AdminThemeProvider'
import { AdminModal } from './AdminModal'
import { AdminButton } from './AdminButton'
import { AdminBadge } from './AdminBadge'
import { describeImpact, planDeletion, type DeleteImpactRow } from '@/contexts/admin/domain/deletion-plan'
import { deleteCustomers } from '../customers/delete-actions'
import { isStaleActionError, STALE_ACTION_MESSAGE } from '@/ui-system/observability/stale-action'

/**
 * The screen between selecting people and destroying them.
 *
 * Everything here exists so the decision is made against facts rather than a
 * count: what each person takes with them, who cannot go and why, and a
 * separate acknowledgement for the one thing that cannot be undone — a
 * waitlist member's pause credit.
 */
export function DeleteCustomersModal({
    rows, onClose, onDone,
}: {
    rows: DeleteImpactRow[]
    onClose: () => void
    onDone: (message: string, deletedIds: string[]) => void
}) {
    const { t } = useAdminTheme()
    const plan = useMemo(() => planDeletion(rows), [rows])
    const [confirmText, setConfirmText] = useState('')
    const [waitlistAck, setWaitlistAck] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [busy, startDelete] = useTransition()

    const canDelete =
        plan.totalPeople > 0
        && confirmText.trim().toUpperCase() === 'DELETE'
        && (!plan.requiresWaitlistAck || waitlistAck)

    function handleDelete() {
        setError(null)
        startDelete(async () => {
            try {
                const res = await deleteCustomers(plan.deletable.map(r => r.customer_id), waitlistAck)
                if (!res.ok) { setError(res.message); return }
                onDone(res.message, res.deletedIds)
            } catch (err) {
                if (isStaleActionError(err)) {
                    // The page is from an older deploy; retrying cannot help.
                    setError(STALE_ACTION_MESSAGE)
                    setTimeout(() => window.location.reload(), 900)
                    return
                }
                console.error('deleteCustomers failed', err)
                setError('Could not reach the server. Nothing was deleted. Try again.')
            }
        })
    }

    return (
        <AdminModal
            label="Confirm deletion"
            maxW="max-w-[560px]"
            onBackdrop={() => { if (!busy) onClose() }}
        >
            <div className={`px-5 py-4 border-b ${t.border}`}>
                <div className={`text-[15px] font-black ${t.heading}`}>
                    {plan.totalPeople === 0
                        ? 'Nothing here can be deleted'
                        : `Delete ${plan.totalPeople} ${plan.totalPeople === 1 ? 'person' : 'people'}?`}
                </div>
                {plan.totalPeople > 0 && (
                    <div className={`text-[12px] font-medium mt-0.5 ${t.muted}`}>
                        {plan.totalRows} other {plan.totalRows === 1 ? 'record' : 'records'} go with them. This cannot be undone.
                    </div>
                )}
            </div>

            <div className="px-5 py-4 max-h-[46vh] overflow-y-auto">
                {plan.deletable.length > 0 && (
                    <div className="flex flex-col gap-2 mb-4">
                        {plan.deletable.map(r => (
                            <div key={r.customer_id} className={`rounded-lg border px-3 py-2 ${t.border}`}>
                                <div className="flex items-baseline justify-between gap-2 flex-wrap">
                                    <span className={`text-[13px] font-bold ${t.heading}`}>{r.name || '(no name)'}</span>
                                    <span className={`text-[11px] font-medium ${t.faint}`}>{r.email || r.cid}</span>
                                </div>
                                <div className={`text-[11px] font-medium mt-0.5 ${t.muted}`}>
                                    Takes {describeImpact(r.impact)}
                                </div>
                                <div className="flex gap-1.5 flex-wrap mt-1.5">
                                    {r.on_waitlist && (
                                        <AdminBadge variant="warning">
                                            Waitlist{r.waitlist_credit_aed > 0 ? ` · AED ${r.waitlist_credit_aed}` : ''}
                                        </AdminBadge>
                                    )}
                                    {r.delivered_meals > 0 && (
                                        <AdminBadge variant="warning">{r.delivered_meals} meals delivered</AdminBadge>
                                    )}
                                    {r.is_staff && <AdminBadge variant="warning">Staff</AdminBadge>}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {plan.blocked.length > 0 && (
                    <div className={`rounded-lg border px-3 py-2.5 mb-4 ${t.border}`}>
                        <div className={`text-[11px] font-black uppercase tracking-[0.08em] mb-1.5 ${t.muted}`}>
                            Refused — these stay
                        </div>
                        {plan.blocked.map(r => (
                            <div key={r.customer_id} className={`text-[12px] font-medium ${t.body}`}>
                                {r.name || '(no name)'} — {r.blocked_reason}
                            </div>
                        ))}
                    </div>
                )}

                {/* The irreversible one. A separate tick from the typed word,
                    because the typed word is muscle memory by the third batch. */}
                {plan.requiresWaitlistAck && (
                    <label className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 mb-4 cursor-pointer ${t.dangerBg}`}>
                        <input
                            type="checkbox"
                            checked={waitlistAck}
                            onChange={e => setWaitlistAck(e.target.checked)}
                            className="mt-0.5"
                        />
                        <span className={`text-[12px] font-bold leading-snug ${t.danger}`}>
                            {plan.needsWaitlistAck.length === 1 ? 'One of these is' : `${plan.needsWaitlistAck.length} of these are`} on
                            the waitlist{plan.totalCreditAed > 0 ? `, holding AED ${plan.totalCreditAed} of pause credit` : ''}.
                            <span className="block font-medium mt-0.5">
                                Deleting them destroys that credit and their saved spot. There is no way back.
                            </span>
                        </span>
                    </label>
                )}

                {plan.totalPeople > 0 && (
                    <>
                        <p className={`text-[12px] font-medium ${t.body}`}>Type DELETE to confirm.</p>
                        <input
                            type="text"
                            value={confirmText}
                            autoFocus
                            onChange={e => setConfirmText(e.target.value)}
                            placeholder="DELETE"
                            aria-label="Type DELETE to confirm"
                            className={`w-full mt-2 rounded-lg border px-3 py-2 text-[13px] font-black tracking-[0.12em] uppercase transition-colors ${t.input} ${t.inputFocus}`}
                        />
                    </>
                )}

                {error && (
                    <p className={`mt-3 text-[12px] font-bold flex items-start gap-1.5 ${t.danger}`}>
                        <AlertTriangle size={13} strokeWidth={2.4} className="mt-px shrink-0" />
                        {error}
                    </p>
                )}
            </div>

            <div className={`flex gap-3 px-5 py-4 border-t ${t.border}`}>
                <AdminButton variant="ghost" onClick={onClose} disabled={busy}>Cancel</AdminButton>
                <AdminButton
                    variant="danger"
                    icon={<Trash2 size={14} strokeWidth={2.5} />}
                    onClick={handleDelete}
                    loading={busy}
                    disabled={!canDelete}
                >
                    Delete for good
                </AdminButton>
            </div>
        </AdminModal>
    )
}
