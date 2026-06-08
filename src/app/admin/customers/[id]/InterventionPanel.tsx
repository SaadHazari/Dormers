'use client'

import { useState, useTransition } from 'react'
import { Gift, SkipForward, Coins, Pause, Play } from 'lucide-react'
import { useAdminTheme } from '../../_components/AdminThemeProvider'
import { AdminButton } from '../../_components/AdminButton'
import {
    adminCompMeal, adminAdjustSkips, adminIssueCredit,
    adminPauseSub, adminResumeSub,
} from './actions'

interface Props {
    customerId: string
    activeSub: Record<string, unknown> | null
}

export function InterventionPanel({ customerId, activeSub }: Props) {
    const { t } = useAdminTheme()
    const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

    return (
        <div className={`${t.card} rounded-xl p-4`}>
            <h3 className={`text-[10px] font-black tracking-[0.14em] uppercase mb-3 ${t.muted}`}>
                Manual Interventions
            </h3>

            <div className="flex flex-wrap gap-2">
                <CompMealAction customerId={customerId} activeSub={activeSub} onResult={setResult} />
                <AdjustSkipsAction activeSub={activeSub} onResult={setResult} />
                <IssueCreditAction customerId={customerId} onResult={setResult} />
                {activeSub?.status === 'Active' && (
                    <PauseAction subId={activeSub.id as string} onResult={setResult} />
                )}
                {activeSub?.status === 'Paused' && (
                    <ResumeAction subId={activeSub.id as string} onResult={setResult} />
                )}
            </div>

            {result && (
                <div className={`mt-3 px-3 py-2 rounded-lg text-[12px] font-bold border ${
                    result.ok ? t.successBg : t.dangerBg
                } ${result.ok ? t.success : t.danger}`}>
                    {result.message}
                </div>
            )}
        </div>
    )
}

function CompMealAction({
    customerId,
    activeSub,
    onResult,
}: {
    customerId: string
    activeSub: Record<string, unknown> | null
    onResult: (r: { ok: boolean; message: string }) => void
}) {
    const [isPending, startTransition] = useTransition()

    function handle() {
        const reason = window.prompt('Reason for comped meal (e.g. "delivery issue", "kitchen error"):')
        if (!reason) return
        startTransition(async () => {
            const res = await adminCompMeal(customerId, activeSub?.id as string | undefined, reason)
            onResult(res)
        })
    }

    return (
        <AdminButton variant="ghost" loading={isPending} icon={<Gift size={13} />} onClick={handle}>
            Comp Meal
        </AdminButton>
    )
}

function AdjustSkipsAction({
    activeSub,
    onResult,
}: {
    activeSub: Record<string, unknown> | null
    onResult: (r: { ok: boolean; message: string }) => void
}) {
    const [isPending, startTransition] = useTransition()

    function handle() {
        if (!activeSub) {
            onResult({ ok: false, message: 'No active subscription to adjust skips on' })
            return
        }
        const input = window.prompt(`Current bonus skips: ${activeSub.bonus_skips ?? 0}. Enter new bonus skip count:`)
        if (!input) return
        const count = parseInt(input, 10)
        if (isNaN(count) || count < 0) {
            onResult({ ok: false, message: 'Invalid number' })
            return
        }
        startTransition(async () => {
            const res = await adminAdjustSkips(activeSub.id as string, count)
            onResult(res)
        })
    }

    return (
        <AdminButton variant="ghost" loading={isPending} icon={<SkipForward size={13} />} onClick={handle} disabled={!activeSub}>
            Adjust Skips
        </AdminButton>
    )
}

function IssueCreditAction({
    customerId,
    onResult,
}: {
    customerId: string
    onResult: (r: { ok: boolean; message: string }) => void
}) {
    const [isPending, startTransition] = useTransition()

    function handle() {
        const amountStr = window.prompt('Credit amount in AED:')
        if (!amountStr) return
        const amount = parseFloat(amountStr)
        if (isNaN(amount) || amount <= 0) {
            onResult({ ok: false, message: 'Invalid amount' })
            return
        }
        const reason = window.prompt('Reason for manual credit:') ?? 'admin_manual'
        startTransition(async () => {
            const res = await adminIssueCredit(customerId, amount, reason)
            onResult(res)
        })
    }

    return (
        <AdminButton variant="ghost" loading={isPending} icon={<Coins size={13} />} onClick={handle}>
            Issue Credit
        </AdminButton>
    )
}

function PauseAction({
    subId,
    onResult,
}: {
    subId: string
    onResult: (r: { ok: boolean; message: string }) => void
}) {
    const [isPending, startTransition] = useTransition()

    function handle() {
        if (!confirm('Pause this subscription? The customer will stop receiving meals.')) return
        startTransition(async () => {
            const res = await adminPauseSub(subId)
            onResult(res)
        })
    }

    return (
        <AdminButton variant="danger" loading={isPending} icon={<Pause size={13} />} onClick={handle}>
            Pause Sub
        </AdminButton>
    )
}

function ResumeAction({
    subId,
    onResult,
}: {
    subId: string
    onResult: (r: { ok: boolean; message: string }) => void
}) {
    const [isPending, startTransition] = useTransition()

    function handle() {
        if (!confirm('Resume this subscription?')) return
        startTransition(async () => {
            const res = await adminResumeSub(subId)
            onResult(res)
        })
    }

    return (
        <AdminButton variant="primary" loading={isPending} icon={<Play size={13} />} onClick={handle}>
            Resume Sub
        </AdminButton>
    )
}
