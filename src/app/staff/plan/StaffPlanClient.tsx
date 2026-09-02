'use client'

/**
 * Staff plan chooser — the last step of intern onboarding. Two cards:
 *
 *   5 days (Mon–Fri) — FREE. This is their remuneration. One tap,
 *   provisioned server-side, straight to the dashboard.
 *
 *   6 days (Mon–Sat) — the 4 Saturdays are PREPAID (flat AED 20/meal,
 *   AED 80/cycle) through the normal Stripe checkout. Price stated at the
 *   moment of choice — the "post-paid dilemma" rule: nobody discovers a
 *   cost at payday.
 *
 * Same auth-funnel visual language as the claim door.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { CalendarDays, Loader2, Lock, Hourglass } from 'lucide-react'
import { useIsLight } from '@/ui-system/hooks/useIsLight'
import { authTokens } from '@/ui-system/tokens/auth-theme'
import { whatsAppHref } from '@/shared/contacts'
import { staffSurchargeFils, STAFF_PLAN_NAME } from '@/contexts/staff/domain/staff-plan'
import { chooseStaffFiveDay, chooseStaffSixDay } from './actions'

interface Props {
    firstName: string
    /** first = post-claim chooser; renewal = next-cycle chooser (queues
     *  behind admin approval); awaiting = renewal queued, admin pending. */
    mode: 'first' | 'renewal' | 'awaiting'
    surchargeAed: number
    perMealAed: number
    customer: {
        name: string
        email: string
        phone: string
        dorm: string
        preference: string
        vegDays: string[]
    }
}

export default function StaffPlanClient({ firstName, mode, surchargeAed, perMealAed, customer }: Props) {
    const router = useRouter()
    const isLight = useIsLight()
    const tokens = authTokens(isLight)
    const [busy, setBusy] = useState<'5' | '6' | null>(null)
    const [error, setError] = useState('')
    const [, startTransition] = useTransition()

    const pickFiveDay = () => {
        if (busy) return
        setBusy('5'); setError('')
        startTransition(async () => {
            const res = await chooseStaffFiveDay()
            if ('error' in res) { setError(res.error); setBusy(null); return }
            // Renewals land back here to see the "awaiting approval" state;
            // a first plan goes straight to the live dashboard.
            if (mode === 'renewal') router.refresh()
            else router.replace('/dashboard')
        })
    }

    const pickSixDay = () => {
        if (busy) return
        setBusy('6'); setError('')
        startTransition(async () => {
            // Pin the profile to 6DAYS first — the checkout gate validates
            // the amount against the profile week type. Renewals also get
            // their mandatory start date (day after the current cycle).
            const res = await chooseStaffSixDay()
            if ('error' in res) { setError(res.error); setBusy(null); return }
            try {
                const isReligious = /religious/i.test(customer.preference)
                const resp = await fetch('/api/checkout', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        amount: staffSurchargeFils('6DAYS'),
                        name: customer.name,
                        email: customer.email,
                        phone: customer.phone,
                        location: customer.dorm,
                        preference: customer.preference,
                        plan: STAFF_PLAN_NAME,
                        vegDays: isReligious ? customer.vegDays : [],
                        ...(res.startDate ? { start_date: res.startDate } : {}),
                        cancel_path: '/staff/plan',
                    }),
                })
                const data = await resp.json()
                if (data.url) { window.location.href = data.url; return }
                setError(data.message ?? data.error ?? 'Could not start the payment. Try again.')
                setBusy(null)
            } catch {
                setError('Could not reach our payment system. Check your connection and try again.')
                setBusy(null)
            }
        })
    }

    const cardBase = `rounded-2xl border p-6 text-left transition-all ${tokens.card} ${tokens.cardShadow}`

    if (mode === 'awaiting') {
        return (
            <div
                className="min-h-screen flex items-center justify-center px-5 py-10"
                style={{ background: tokens.pageBackground, fontFamily: 'var(--font-montserrat), Arial, Helvetica, sans-serif' }}
            >
                <motion.div
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                    className={`w-full max-w-[420px] rounded-2xl border p-7 text-center ${tokens.card} ${tokens.cardShadow}`}
                >
                    <Hourglass size={32} className="mx-auto text-[#f57f20]" strokeWidth={2} />
                    <h1 className={`mt-3 text-[20px] font-extrabold ${tokens.heading}`}>
                        Renewal queued, {firstName}.
                    </h1>
                    <p className={`mt-2 text-[13px] leading-relaxed ${tokens.subline}`}>
                        Your next cycle is waiting for a quick approval from the team — you don&apos;t need to do anything. Your first delivery day is set the moment it&apos;s approved.
                    </p>
                </motion.div>
            </div>
        )
    }

    return (
        <div
            className="min-h-screen flex items-center justify-center px-5 py-10"
            style={{ background: tokens.pageBackground, fontFamily: 'var(--font-montserrat), Arial, Helvetica, sans-serif' }}
        >
            <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="w-full max-w-[460px]"
            >
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#f57f20]">
                    {mode === 'renewal' ? `Next cycle, ${firstName}` : `Last step, ${firstName}`}
                </p>
                <h1 className={`mt-1.5 text-[24px] font-extrabold leading-tight ${tokens.heading}`}>
                    {mode === 'renewal' ? <>Renew your plan<span className="text-[#f57f20]">.</span></> : <>Pick your delivery week<span className="text-[#f57f20]">.</span></>}
                </h1>
                <p className={`mt-2 text-[13px] leading-relaxed ${tokens.subline}`}>
                    {mode === 'renewal'
                        ? 'Same deal as always — weekdays on us, Saturdays optional and prepaid. Your renewal gets a quick approval from the team before it starts.'
                        : 'Your weekday dinners are on us — that’s the deal. Saturdays are optional and prepaid, so there are no surprises later.'}
                </p>

                <div className="mt-6 flex flex-col gap-3">
                    <button type="button" onClick={pickFiveDay} disabled={!!busy} className={`${cardBase} hover:border-[#f57f20]/60`}>
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5">
                                <CalendarDays size={18} className="text-[#f57f20]" strokeWidth={2.2} />
                                <span className={`text-[16px] font-extrabold ${tokens.heading}`}>5 days · Mon–Fri</span>
                            </div>
                            <span className="text-[14px] font-extrabold text-[#1d8a30]">Free</span>
                        </div>
                        <p className={`mt-2 text-[12.5px] leading-relaxed ${tokens.subline}`}>
                            20 dinners a cycle, on the house. {busy === '5' && <Loader2 size={13} className="inline animate-spin ml-1" />}
                        </p>
                    </button>

                    <button type="button" onClick={pickSixDay} disabled={!!busy} className={`${cardBase} hover:border-[#f57f20]/60`}>
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5">
                                <CalendarDays size={18} className="text-[#f57f20]" strokeWidth={2.2} />
                                <span className={`text-[16px] font-extrabold ${tokens.heading}`}>6 days · Mon–Sat</span>
                            </div>
                            <span className={`text-[14px] font-extrabold ${tokens.heading}`}>AED {surchargeAed} today</span>
                        </div>
                        <p className={`mt-2 text-[12.5px] leading-relaxed ${tokens.subline}`}>
                            Weekdays free + 4 Saturdays at AED {perMealAed} each, paid now by card.
                            {busy === '6' && <Loader2 size={13} className="inline animate-spin ml-1" />}
                        </p>
                    </button>
                </div>

                {error && (
                    <p className="mt-4 text-[12.5px] leading-relaxed font-semibold text-[#e5484d]" role="alert">
                        {error}{' '}
                        <a href={whatsAppHref('Hi! I\'m setting up my staff plan and hit an error — can you help?')} target="_blank" rel="noreferrer" className="underline underline-offset-2 text-[#f57f20]">
                            WhatsApp us
                        </a>
                    </p>
                )}

                <p className={`mt-5 inline-flex items-center gap-1.5 text-[11px] ${tokens.helpText}`}>
                    <Lock size={11} strokeWidth={2.4} className="text-[#1d8a30]" />
                    Saturdays are charged by Stripe — card details never touch our servers.
                </p>
            </motion.div>
        </div>
    )
}
