'use client'

import { useState, useTransition } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { pauseSubscription, resumeSubscription, skipMeal } from './actions'
import {
    Calendar, Zap, Pause, Play, SkipForward, User,
    MapPin, Utensils, CreditCard, Clock, ChevronRight,
    Flame, Leaf, Star, X, Check, Gem, CheckCircle2
} from 'lucide-react'
import * as PricingCard from '@/components/ui/pricing-card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

// ─── types ────────────────────────────────────────────────────────────────────

interface Customer {
    id: string; cid?: string | null; name?: string | null; whatsapp_number?: string | null
    dorm_name?: string | null; meal_preference_type?: string | null; allergens?: string | null
    spice_level_preference?: string | null; email?: string | null; created_at: string
}

interface Subscription {
    id: string; plan_name: string; status: string; start_date: string; end_date: string
    total_meals: number; delivered_meals: number; skipped_meals_count: number
    has_paused_before: boolean; pause_date?: string | null; last_skipped_date?: string | null
    paused_days?: number; created_at: string
}

interface Props {
    customer: Customer | null
    activeSubscription: Subscription | null
    allSubscriptions: Subscription[]
    userEmail: string
}

// ─── helpers ──────────────────────────────────────────────────────────────────

const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric' })

const prefIcon = (p?: string | null) => {
    if (p?.includes('Plant'))    return <Leaf size={13} className="text-green-400" />
    if (p?.includes('Religious')) return <Star size={13} className="text-yellow-400" />
    return <Flame size={13} className="text-orange-400" />
}

// ─── plan definitions ─────────────────────────────────────────────────────────

const PLANS = [
    {
        id: 'Monthly Premium 💎',
        label: 'Monthly Premium',
        emoji: '💎',
        tagline: 'Best value',
        tagColor: 'bg-[#0088cc]/20 text-[#0088cc] border-[#0088cc]/30',
        accentBorder: 'border-[#0088cc]',
        accentBg: 'bg-[#0088cc]/[0.06]',
        accentText: 'text-[#0088cc]',
        defaultBorder: 'border-[#0088cc]/25',
        period: '/month',
        meals: 24,
        duration: '4 weeks · 6 days/week',
        features: [
            { text: '24 meals per month',      icon: <Utensils size={13} /> },
            { text: 'Lowest price per meal',    icon: <Check size={13} /> },
            { text: '1 free pause (indefinite)',icon: <Pause size={13} /> },
            { text: '3 meal skips included',    icon: <SkipForward size={13} /> },
            { text: 'Priority delivery slot',   icon: <Zap size={13} /> },
        ],
        getPrice: (isVeg: boolean) => isVeg ? 18 : 22,
        getTotal: (isVeg: boolean) => isVeg ? 432 : 528,
    },
    {
        id: 'Weekly Flex ✨',
        label: 'Weekly Flex',
        emoji: '✨',
        tagline: 'Low commitment',
        tagColor: 'bg-white/[0.06] text-white/50 border-white/10',
        accentBorder: 'border-[#f57f20]',
        accentBg: 'bg-[#f57f20]/[0.05]',
        accentText: 'text-[#f57f20]',
        defaultBorder: 'border-white/[0.08]',
        period: '/week',
        meals: 6,
        duration: '1 week · 6 days/week',
        features: [
            { text: '6 meals per week',         icon: <Utensils size={13} /> },
            { text: '1 meal skip included',      icon: <SkipForward size={13} /> },
            { text: 'Renew or cancel weekly',    icon: <Check size={13} /> },
            { text: 'No long-term lock-in',      icon: <Check size={13} /> },
        ],
        getPrice: (isVeg: boolean) => isVeg ? 19 : 23,
        getTotal: (isVeg: boolean) => isVeg ? 114 : 138,
    },
    {
        id: 'One-Time Trial',
        label: 'One-Time Trial',
        emoji: '🍽️',
        tagline: 'Try first',
        tagColor: 'bg-white/[0.06] text-white/50 border-white/10',
        accentBorder: 'border-[#f57f20]',
        accentBg: 'bg-[#f57f20]/[0.05]',
        accentText: 'text-[#f57f20]',
        defaultBorder: 'border-white/[0.08]',
        period: '/meal',
        meals: 1,
        duration: 'Single delivery',
        features: [
            { text: '1 freshly cooked meal',    icon: <Utensils size={13} /> },
            { text: 'Any cuisine preference',   icon: <Check size={13} /> },
            { text: 'No commitment whatsoever', icon: <Check size={13} /> },
        ],
        getPrice: (isVeg: boolean) => isVeg ? 20 : 25,
        getTotal: (isVeg: boolean) => isVeg ? 20 : 25,
    },
]

// ─── plan picker modal ────────────────────────────────────────────────────────

function PlanPickerModal({
    customer, userEmail, onClose,
}: { customer: Customer | null; userEmail: string; onClose: () => void }) {
    const [selected, setSelected] = useState<string | null>(null)
    const [loading, setLoading]   = useState(false)

    const isVeg = customer?.meal_preference_type?.includes('Plant') ?? false

    const handleCheckout = async () => {
        if (!selected) return
        const plan = PLANS.find(p => p.id === selected)
        if (!plan) return
        setLoading(true)
        try {
            const res = await fetch('/api/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount:     plan.getTotal(isVeg) * 100,
                    name:       customer?.name ?? '',
                    email:      customer?.email ?? userEmail,
                    phone:      customer?.whatsapp_number ?? '',
                    location:   customer?.dorm_name ?? '',
                    preference: customer?.meal_preference_type ?? '',
                    plan:       plan.id,
                    vegDays:    [],
                }),
            })
            const data = await res.json()
            if (data.url) { window.location.href = data.url }
            else           { alert(data.error ?? 'Checkout failed. Please try again.') }
        } catch {
            alert('Network error. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        >
            <motion.div
                initial={{ scale: 0.96, y: 12, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.96, y: 12, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                className="relative w-full max-w-3xl bg-[#07161f] border border-white/[0.08] rounded-3xl shadow-[0_40px_100px_rgba(0,0,0,0.7)] overflow-hidden max-h-[90vh] overflow-y-auto"
            >
                {/* header */}
                <div className="sticky top-0 z-10 bg-[#07161f]/95 backdrop-blur-md px-6 pt-6 pb-4 border-b border-white/[0.06] flex items-start justify-between gap-4">
                    <div>
                        <h2 className="text-[22px] sm:text-[26px] font-black text-white tracking-tight">Pick your plan.</h2>
                        <p className="text-white/40 text-[13px] mt-0.5">
                            {isVeg ? 'Plant-based pricing.' : 'Non-veg pricing.'} Cancel or change any time.
                        </p>
                    </div>
                    <button onClick={onClose} className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-white/[0.04] border border-white/[0.07] text-white/40 hover:text-white hover:bg-white/[0.08] transition-all">
                        <X size={15} strokeWidth={2} />
                    </button>
                </div>

                {/* plan cards */}
                <div className="px-6 pt-5 pb-2">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {PLANS.map(plan => {
                            const isSel = selected === plan.id
                            const price = plan.getPrice(isVeg)
                            const total = plan.getTotal(isVeg)
                            const planIcon =
                                plan.id === 'Monthly Premium 💎' ? <Gem size={14} /> :
                                plan.id === 'Weekly Flex ✨'     ? <Zap size={14} /> :
                                                                   <Utensils size={14} />
                            return (
                                <PricingCard.Card
                                    key={plan.id}
                                    onClick={() => setSelected(plan.id)}
                                    className={cn(
                                        'max-w-none cursor-pointer transition-all duration-200',
                                        isSel
                                            ? `${plan.accentBorder} ${plan.accentBg}`
                                            : `${plan.defaultBorder} bg-white/[0.02] hover:bg-white/[0.04]`
                                    )}
                                >
                                    <PricingCard.Header>
                                        <PricingCard.Plan>
                                            <PricingCard.PlanName>
                                                {planIcon}
                                                <span>{plan.label}</span>
                                            </PricingCard.PlanName>
                                            <PricingCard.Badge className={plan.tagColor}>
                                                {plan.tagline}
                                            </PricingCard.Badge>
                                        </PricingCard.Plan>
                                        <PricingCard.Price>
                                            <PricingCard.MainPrice className="text-white">{price}</PricingCard.MainPrice>
                                            <PricingCard.Period>AED / meal</PricingCard.Period>
                                        </PricingCard.Price>
                                        <p className={cn('text-[11px] font-bold uppercase tracking-wide mb-3', isSel ? plan.accentText : 'text-white/30')}>
                                            {total} AED{plan.period}
                                        </p>
                                        <p className="text-white/30 text-[11px] mb-3">{plan.duration}</p>
                                        <Button
                                            onClick={e => { e.stopPropagation(); setSelected(plan.id) }}
                                            className={cn(
                                                'w-full font-semibold text-white',
                                                isSel
                                                    ? 'bg-gradient-to-b from-orange-500 to-orange-600 shadow-[0_10px_25px_rgba(255,115,0,0.3)]'
                                                    : 'bg-white/[0.06] hover:bg-white/[0.10] border border-white/10'
                                            )}
                                        >
                                            {isSel ? <><Check size={13} strokeWidth={3} /> Selected</> : 'Select Plan'}
                                        </Button>
                                    </PricingCard.Header>

                                    <PricingCard.Body>
                                        <PricingCard.List>
                                            {plan.features.map(f => (
                                                <PricingCard.ListItem key={f.text}>
                                                    <span className={cn('mt-0.5 shrink-0', isSel ? plan.accentText : 'text-white/30')}>
                                                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                                                    </span>
                                                    <span>{f.text}</span>
                                                </PricingCard.ListItem>
                                            ))}
                                        </PricingCard.List>
                                    </PricingCard.Body>

                                    {isSel && (
                                        <motion.div
                                            initial={{ opacity: 0, scale: 0.7 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            className="absolute top-3 right-3 w-5 h-5 rounded-full flex items-center justify-center"
                                            style={{ background: plan.id === 'Monthly Premium 💎' ? '#0088cc' : '#f57f20' }}
                                        >
                                            <Check size={10} className="text-white" strokeWidth={3} />
                                        </motion.div>
                                    )}
                                </PricingCard.Card>
                            )
                        })}
                    </div>
                </div>

                {/* CTA */}
                <div className="px-6 pb-6 pt-4">
                    <AnimatePresence>
                        {selected && (
                            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                                <button
                                    onClick={handleCheckout}
                                    disabled={loading}
                                    className="w-full flex items-center justify-center gap-2 bg-[#f57f20] hover:bg-[#ff8f36] disabled:opacity-60 disabled:pointer-events-none text-white font-black text-[15px] py-4 rounded-2xl transition-all shadow-[0_0_28px_rgba(245,127,32,0.28)] hover:shadow-[0_0_40px_rgba(245,127,32,0.45)]"
                                >
                                    {loading
                                        ? <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Redirecting to checkout…</>
                                        : <>Checkout Securely <ChevronRight size={16} strokeWidth={2.5} /></>
                                    }
                                </button>
                                <p className="text-center text-white/20 text-[11px] mt-3">
                                    Powered by Stripe · We never store your card details.
                                </p>
                            </motion.div>
                        )}
                    </AnimatePresence>
                    {!selected && (
                        <p className="text-center text-white/20 text-[12px]">← Select a plan above to continue</p>
                    )}
                </div>
            </motion.div>
        </motion.div>
    )
}

// ─── active subscription view ─────────────────────────────────────────────────

function ActiveDashboard({ sub, customer }: { sub: Subscription; customer: Customer | null }) {
    const [isPending, startTransition] = useTransition()
    const [actionError, setActionError] = useState<string | null>(null)

    const isWeekly  = sub.plan_name.includes('Weekly Flex')
    const isOneTime = sub.plan_name.includes('One-Time')
    const maxSkips  = isWeekly ? 1 : 3
    const skipsLeft = maxSkips - (sub.skipped_meals_count ?? 0)
    const isPaused  = sub.status === 'Paused'
    const canPause  = !sub.has_paused_before && !isWeekly && !isOneTime && sub.status !== 'Ended'
    const pct       = sub.total_meals > 0 ? Math.round((sub.delivered_meals / sub.total_meals) * 100) : 0
    const custId    = customer?.cid ?? `DRM-${sub.id.slice(0, 8).toUpperCase()}`

    const act = (fn: () => Promise<{ error?: string } | { success: boolean }>) => {
        setActionError(null)
        startTransition(async () => {
            const res = await fn()
            if (res && 'error' in res && res.error) setActionError(res.error)
        })
    }

    return (
        <div className="space-y-5">
            <AnimatePresence>
                {actionError && (
                    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm p-4 rounded-2xl flex items-center justify-between gap-3">
                        <span>{actionError}</span>
                        <button onClick={() => setActionError(null)} className="text-red-400/50 hover:text-red-400 shrink-0"><X size={14} /></button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Hero */}
            <div className="relative bg-white/[0.03] border border-white/[0.07] rounded-3xl p-6 sm:p-8 overflow-hidden">
                <div className="pointer-events-none absolute top-0 right-0 w-64 h-64 bg-[#f57f20]/[0.07] blur-[80px] rounded-full" />
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-5 relative z-10">
                    <div>
                        <div className="flex items-center gap-3 flex-wrap mb-1.5">
                            <h3 className="text-2xl font-black text-white tracking-tight">{sub.plan_name}</h3>
                            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider border ${
                                sub.status === 'Active' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                                sub.status === 'Paused' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' :
                                'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                                {sub.status}
                            </span>
                        </div>
                        <p className="text-white/35 text-[13px]">{fmt(sub.start_date)} → <span className="text-white/60">{fmt(sub.end_date)}</span></p>
                    </div>
                    <div className="bg-black/25 border border-white/[0.05] p-4 rounded-2xl text-center min-w-[120px]">
                        <p className="text-white/35 text-[10px] font-bold uppercase tracking-wider mb-1">Delivered</p>
                        <p className="text-3xl font-black text-white">{sub.delivered_meals}<span className="text-lg text-white/30 font-medium"> / {sub.total_meals}</span></p>
                    </div>
                </div>
                <div className="mt-5 relative z-10">
                    <div className="flex justify-between items-center mb-2">
                        <p className="text-white/35 text-[12px] font-semibold">Delivery Progress</p>
                        <p className="text-[#f57f20] text-[13px] font-black">{pct}%</p>
                    </div>
                    <div className="w-full h-2 bg-black/35 rounded-full overflow-hidden">
                        <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 1, ease: 'easeOut' }}
                            className="h-full bg-gradient-to-r from-[#f57f20] to-[#ffaa00] rounded-full" />
                    </div>
                </div>
            </div>

            {/* Controls grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {/* Skip */}
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-3xl p-6 flex flex-col justify-between gap-5">
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center"><SkipForward size={13} className="text-white/50" strokeWidth={2} /></div>
                                <h4 className="text-white font-bold text-[14px]">Skip Meal</h4>
                            </div>
                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${skipsLeft > 0 ? 'bg-green-500/10 text-green-400' : 'bg-white/5 text-white/25'}`}>{skipsLeft} left</span>
                        </div>
                        <p className="text-white/35 text-[12px] leading-relaxed">Not home tomorrow? Skip extends your plan by 1 day.</p>
                        {sub.last_skipped_date && (
                            <p className="text-white/20 text-[11px] mt-2 flex items-center gap-1.5"><Clock size={10} /> Last: {fmt(sub.last_skipped_date)}</p>
                        )}
                    </div>
                    <button onClick={() => act(() => skipMeal(sub.id))}
                        disabled={skipsLeft <= 0 || sub.status !== 'Active' || isPending}
                        className="w-full py-2.5 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] text-white font-semibold text-[13px] transition-all disabled:opacity-25 disabled:pointer-events-none">
                        {isPending ? 'Processing…' : 'Skip Tomorrow'}
                    </button>
                </div>

                {/* Pause */}
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-3xl p-6 flex flex-col justify-between gap-5">
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center"><Pause size={13} className="text-white/50" strokeWidth={2} /></div>
                                <h4 className="text-white font-bold text-[14px]">Pause Plan</h4>
                            </div>
                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${sub.has_paused_before ? 'bg-white/5 text-white/25' : 'bg-green-500/10 text-green-400'}`}>
                                {sub.has_paused_before ? 'Used' : '1 available'}
                            </span>
                        </div>
                        <p className="text-white/35 text-[12px] leading-relaxed">Travelling? Pause indefinitely — your end date extends automatically.</p>
                        {sub.pause_date && isPaused && (
                            <p className="text-yellow-400/50 text-[11px] mt-2 flex items-center gap-1.5"><Clock size={10} /> Paused since: {fmt(sub.pause_date)}</p>
                        )}
                    </div>
                    {isPaused ? (
                        <button onClick={() => act(() => resumeSubscription(sub.id))} disabled={isPending}
                            className="w-full py-2.5 rounded-xl bg-[#f57f20] hover:bg-[#ff8f36] text-white font-bold text-[13px] transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                            <Play size={13} strokeWidth={2.5} />{isPending ? 'Processing…' : 'Resume Deliveries'}
                        </button>
                    ) : (
                        <button onClick={() => act(() => pauseSubscription(sub.id))} disabled={!canPause || isPending}
                            className="w-full py-2.5 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] text-white font-semibold text-[13px] transition-all disabled:opacity-25 disabled:pointer-events-none">
                            {isPending ? 'Processing…' : isWeekly ? 'Not available on Weekly Flex' : isOneTime ? 'Not available on Trial' : sub.status === 'Ended' ? 'Plan Ended' : 'Pause Deliveries'}
                        </button>
                    )}
                </div>

                {/* Plan details */}
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-3xl p-6">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center"><Utensils size={13} className="text-white/50" strokeWidth={2} /></div>
                        <h4 className="text-white font-bold text-[14px]">Plan Details</h4>
                    </div>
                    <div className="space-y-2.5">
                        {[
                            { icon: <CreditCard size={12} />, label: 'Customer ID',  value: custId },
                            { icon: prefIcon(customer?.meal_preference_type), label: 'Preference', value: customer?.meal_preference_type ?? '—' },
                            { icon: <MapPin size={12} />,     label: 'Dorm',        value: customer?.dorm_name ?? '—' },
                            { icon: <Zap size={12} />,        label: 'Spice',       value: customer?.spice_level_preference ?? '—' },
                        ].map(r => (
                            <div key={r.label} className="flex items-center justify-between py-1.5 border-b border-white/[0.04] last:border-0">
                                <div className="flex items-center gap-2 text-white/30">{r.icon}<span className="text-[12px]">{r.label}</span></div>
                                <span className="text-white/65 text-[12px] font-semibold">{r.value}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Account */}
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-3xl p-6">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center"><User size={13} className="text-white/50" strokeWidth={2} /></div>
                        <h4 className="text-white font-bold text-[14px]">Account</h4>
                    </div>
                    <div className="space-y-2.5">
                        {[
                            { icon: <User size={12} />,     label: 'Name',         value: customer?.name ?? '—' },
                            { icon: <Calendar size={12} />, label: 'Member Since', value: fmt(customer?.created_at ?? sub.created_at) },
                            { icon: <Zap size={12} />,      label: 'WhatsApp',     value: customer?.whatsapp_number ?? '—' },
                            ...(customer?.allergens && customer.allergens !== 'None'
                                ? [{ icon: <Zap size={12} />, label: 'Allergens', value: customer.allergens }]
                                : []),
                        ].map(r => (
                            <div key={r.label} className="flex items-center justify-between py-1.5 border-b border-white/[0.04] last:border-0">
                                <div className="flex items-center gap-2 text-white/30">{r.icon}<span className="text-[12px]">{r.label}</span></div>
                                <span className="text-white/65 text-[12px] font-semibold truncate max-w-[150px]">{r.value}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}

// ─── no-plan view (cards + floating CTA) ─────────────────────────────────────

function NoPlanView({ customer, userEmail }: { customer: Customer | null; userEmail: string }) {
    const [open, setOpen] = useState(false)

    return (
        <>
            {/* Dimmed / disabled dashboard skeleton */}
            <div className="space-y-5 opacity-30 pointer-events-none select-none" aria-hidden>
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-3xl p-6 sm:p-8">
                    <div className="flex flex-col sm:flex-row justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-3 mb-2"><div className="h-7 w-48 bg-white/10 rounded-lg" /><div className="h-5 w-16 bg-green-500/20 rounded-full" /></div>
                            <div className="h-3.5 w-52 bg-white/5 rounded mt-2" />
                        </div>
                        <div className="bg-black/20 p-4 rounded-2xl border border-white/5 w-36">
                            <div className="h-3 w-16 bg-white/10 rounded mb-2" /><div className="h-8 w-20 bg-white/10 rounded" />
                        </div>
                    </div>
                    <div className="mt-5"><div className="flex justify-between mb-2"><div className="h-3 w-24 bg-white/10 rounded" /><div className="h-3 w-8 bg-[#f57f20]/30 rounded" /></div>
                    <div className="w-full h-2 bg-black/30 rounded-full"><div className="h-full w-[38%] bg-[#f57f20]/30 rounded-full" /></div></div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    {[0, 1, 2, 3].map(i => (
                        <div key={i} className="bg-white/[0.02] border border-white/[0.05] rounded-3xl p-6">
                            <div className="h-4 w-28 bg-white/10 rounded mb-3" />
                            <div className="h-3 w-full bg-white/5 rounded mb-1.5" /><div className="h-3 w-3/4 bg-white/5 rounded mb-6" />
                            <div className="h-9 w-full bg-white/5 rounded-xl" />
                        </div>
                    ))}
                </div>
            </div>

            {/* Floating pick-a-plan banner */}
            <div className="mt-8">
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                    className="bg-[#07161f] border border-[#f57f20]/25 rounded-3xl p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-5 shadow-[0_0_40px_rgba(245,127,32,0.08)]"
                >
                    <div>
                        <p className="text-[#f57f20] text-[11px] font-bold uppercase tracking-widest mb-1">Get started</p>
                        <h3 className="text-white font-black text-[20px] sm:text-[22px] tracking-tight">You don&apos;t have an active plan.</h3>
                        <p className="text-white/40 text-[13px] mt-1">Choose a plan to unlock daily deliveries and your full dashboard.</p>
                    </div>
                    <button
                        onClick={() => setOpen(true)}
                        className="shrink-0 flex items-center gap-2 bg-[#f57f20] hover:bg-[#ff8f36] text-white font-black text-[14px] px-6 py-3.5 rounded-xl transition-all shadow-[0_0_20px_rgba(245,127,32,0.22)] hover:shadow-[0_0_32px_rgba(245,127,32,0.38)] whitespace-nowrap"
                    >
                        Pick a Plan <ChevronRight size={16} strokeWidth={2.5} />
                    </button>
                </motion.div>
            </div>

            <AnimatePresence>
                {open && (
                    <PlanPickerModal customer={customer} userEmail={userEmail} onClose={() => setOpen(false)} />
                )}
            </AnimatePresence>
        </>
    )
}

// ─── main export ──────────────────────────────────────────────────────────────

export default function ClientDashboard({ customer, activeSubscription, allSubscriptions, userEmail }: Props) {
    const searchParams   = useSearchParams()
    const checkoutSuccess  = searchParams.get('checkout_success') === 'true'
    const checkoutCanceled = searchParams.get('checkout_canceled') === 'true'
    const endedPlans     = allSubscriptions.filter(s => s.status === 'Ended')

    if (checkoutSuccess) {
        return (
            <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center justify-center py-20 text-center gap-5">
                <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }}
                    className="w-12 h-12 rounded-full border-2 border-[#f57f20]/30 border-t-[#f57f20]" />
                <div>
                    <h2 className="text-2xl font-black text-white">Order received!</h2>
                    <p className="text-white/40 text-sm mt-1">Activating your plan — this takes just a moment.</p>
                </div>
                <Link href="/dashboard" className="text-[#f57f20] text-sm font-semibold hover:underline">Refresh dashboard →</Link>
            </motion.div>
        )
    }

    if (checkoutCanceled) {
        return (
            <div className="space-y-6">
                <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 p-4 rounded-2xl text-sm">
                    Checkout was cancelled — no charge was made.
                </div>
                <NoPlanView customer={customer} userEmail={userEmail} />
            </div>
        )
    }

    if (activeSubscription) {
        return (
            <div className="space-y-8">
                <ActiveDashboard sub={activeSubscription} customer={customer} />
                {endedPlans.length > 0 && (
                    <div>
                        <h3 className="text-white/30 text-[11px] font-bold uppercase tracking-widest mb-3">Past Plans</h3>
                        <div className="space-y-2.5">
                            {endedPlans.map(s => (
                                <div key={s.id} className="bg-white/[0.02] border border-white/[0.05] rounded-2xl px-5 py-3.5 flex items-center justify-between gap-4">
                                    <div>
                                        <p className="text-white/50 font-semibold text-[13px]">{s.plan_name}</p>
                                        <p className="text-white/25 text-[11px] mt-0.5">{fmt(s.start_date)} → {fmt(s.end_date)} · {s.delivered_meals}/{s.total_meals} meals</p>
                                    </div>
                                    <span className="bg-white/5 text-white/25 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0">Ended</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        )
    }

    return <NoPlanView customer={customer} userEmail={userEmail} />
}
