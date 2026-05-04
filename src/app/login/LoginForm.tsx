'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff } from 'lucide-react'
import { login } from './actions'
import { ForgotPasswordFlow } from './ForgotPasswordFlow'

type Tab = 'signin' | 'signup' | 'forgot'

interface Props {
    error?: string
    message?: string
    nextUrl: string
    prefillEmail?: string
    /** ?step=set-password — present when the user lands here from the magic
        link in their reset-password email. Routes them straight to the
        set-new-password phase of the forgot flow. */
    step?: string
}

export default function LoginForm({ error, message, nextUrl, prefillEmail, step }: Props) {
    const router = useRouter()
    const initialTab: Tab = step === 'set-password' ? 'forgot' : 'signin'
    const [tab, setTab] = useState<Tab>(initialTab)
    const [showPassword, setShowPassword] = useState(false)
    const [capsOn, setCapsOn] = useState(false)
    const [isPending, startTransition] = useTransition()
    const formRef = useRef<HTMLFormElement>(null)

    // Clear URL params when user switches tabs so old errors don't linger
    const clearUrlState = () => {
        if (window.location.search) router.replace('/login', { scroll: false })
    }

    // Auto-clear error/message banners 6s after first paint
    useEffect(() => {
        if (!error && !message) return
        const t = setTimeout(() => clearUrlState(), 6000)
        return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [error, message])

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        if (tab === 'signup') {
            router.push('/onboarding')
            return
        }
        // The forgot tab is rendered by <ForgotPasswordFlow> which owns its
        // own form, so we never receive its submit events here. Sign-in only.
        const formData = new FormData(e.currentTarget)
        formData.set('next_url', nextUrl)
        startTransition(async () => { await login(formData) })
    }

    const switchTab = (next: Tab) => {
        if (next === tab || isPending) return
        setShowPassword(false)
        setCapsOn(false)
        setTab(next)
        clearUrlState()
        if (formRef.current) formRef.current.reset()
    }

    const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
        setCapsOn(e.getModifierState && e.getModifierState('CapsLock'))
    }

    return (
        <div
            className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
            style={{ background: 'linear-gradient(160deg, #f5f0e8 0%, #ede8da 60%, #e4dfd6 100%)' }}
        >
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute -bottom-32 -left-32 w-[560px] h-[560px] rounded-full bg-[#f57f20]/[0.08] blur-[140px]" />
                <div className="absolute -top-20 -right-20 w-[420px] h-[420px] rounded-full bg-[#f57f20]/[0.05] blur-[120px]" />
            </div>

            <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                className="relative z-10 w-full max-w-[400px] flex flex-col items-center"
            >
                <Link href="/home" className="mb-7 block opacity-90 hover:opacity-100 transition-opacity">
                    <Image src="/logo.png" alt="Dormers" width={100} height={100} className="object-contain" priority />
                </Link>

                <div className="w-full rounded-[28px] bg-white/70 border border-[#091825]/[0.08] shadow-[0_8px_40px_rgba(9,24,37,0.10),inset_0_1px_0_rgba(255,255,255,0.90)] backdrop-blur-2xl overflow-hidden">

                    {/* Tab switcher (sign-in / sign-up only; forgot is a sub-state of sign-in) */}
                    {tab !== 'forgot' && (
                        <div className="px-5 pt-5">
                            <div className="relative flex bg-[#091825]/[0.05] border border-[#091825]/[0.08] rounded-2xl p-1">
                                <motion.div
                                    className="absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-[14px] bg-white border border-[#091825]/[0.10] shadow-[0_2px_8px_rgba(9,24,37,0.08)]"
                                    animate={{ left: tab === 'signin' ? '4px' : 'calc(50%)' }}
                                    transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                                />
                                {(['signin', 'signup'] as Tab[]).map((t) => (
                                    <button
                                        key={t}
                                        type="button"
                                        onClick={() => switchTab(t)}
                                        className={`relative z-10 flex-1 py-2.5 text-[13px] font-semibold rounded-[14px] transition-colors duration-200 ${
                                            tab === t ? 'text-[#091825]' : 'text-[#091825]/60 hover:text-[#091825]/80'
                                        }`}
                                    >
                                        {t === 'signin' ? 'Sign In' : 'Create Account'}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="px-5 pt-5 pb-6">
                        <AnimatePresence mode="wait" initial={false}>
                            <motion.div
                                key={tab}
                                initial={{ opacity: 0, x: 8 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -8 }}
                                transition={{ duration: 0.18, ease: 'easeOut' }}
                            >

                                {/* Sign-in — owns its own form so Enter submits credentials */}
                                {tab === 'signin' && (
                                <form ref={formRef} onSubmit={handleSubmit}>
                                    <div className="mb-5">
                                        <h1 className="text-[20px] font-bold text-[#091825] tracking-tight leading-snug">Welcome back.</h1>
                                        <p className="text-[#091825]/55 text-[13px] mt-1">Sign in to manage your meal plan.</p>
                                    </div>

                                    <div className="mb-3.5">
                                        <label className="block text-[11px] font-semibold uppercase tracking-widest text-[#091825]/55 mb-2">Email</label>
                                        <input
                                            name="email"
                                            type="email"
                                            required
                                            autoComplete="email"
                                            autoFocus
                                            defaultValue={prefillEmail ?? ''}
                                            placeholder="you@example.com"
                                            className="w-full bg-white/80 border border-[#091825]/[0.12] hover:border-[#091825]/[0.22] focus:border-[#f57f20]/70 focus:bg-white focus:shadow-[0_0_0_3px_rgba(245,127,32,0.09)] rounded-xl px-4 py-3 text-[#091825] text-[14px] placeholder-[#091825]/30 outline-none transition-all duration-200"
                                        />
                                    </div>

                                    <div className="mb-2">
                                        <div className="flex items-center justify-between mb-2">
                                            <label className="block text-[11px] font-semibold uppercase tracking-widest text-[#091825]/55">Password</label>
                                            <button
                                                type="button"
                                                onClick={() => switchTab('forgot')}
                                                className="text-[11px] font-semibold text-[#f57f20] hover:text-[#ff8f36] transition-colors"
                                            >
                                                Forgot password?
                                            </button>
                                        </div>
                                        <div className="relative">
                                            <input
                                                name="password"
                                                type={showPassword ? 'text' : 'password'}
                                                required
                                                autoComplete="current-password"
                                                placeholder="••••••••"
                                                onKeyDown={onKey}
                                                onKeyUp={onKey}
                                                className="w-full bg-white/80 border border-[#091825]/[0.12] hover:border-[#091825]/[0.22] focus:border-[#f57f20]/70 focus:bg-white focus:shadow-[0_0_0_3px_rgba(245,127,32,0.09)] rounded-xl px-4 py-3 pr-11 text-[#091825] text-[14px] placeholder-[#091825]/30 outline-none transition-all duration-200"
                                            />
                                            <button type="button" tabIndex={-1} onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#091825]/45 hover:text-[#091825]/75 transition-colors">
                                                {showPassword ? <EyeOff size={15} strokeWidth={2} /> : <Eye size={15} strokeWidth={2} />}
                                            </button>
                                        </div>
                                        {capsOn && (
                                            <p className="text-[11px] font-semibold text-[#f57f20] mt-1.5 flex items-center gap-1">
                                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#f57f20]" />
                                                Caps Lock is on
                                            </p>
                                        )}
                                    </div>

                                    <div className="mt-4 mb-4 min-h-0">
                                        <AnimatePresence>
                                            {error && (
                                                <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="px-4 py-3 rounded-xl bg-red-500/[0.08] border border-red-500/[0.18] text-red-600 text-[13px] text-center leading-snug">
                                                    {error}
                                                </motion.div>
                                            )}
                                            {message && !error && (
                                                <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="px-4 py-3 rounded-xl bg-green-500/[0.08] border border-green-500/[0.18] text-green-700 text-[13px] text-center leading-snug">
                                                    {message}
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>

                                    <button type="submit" disabled={isPending} className="relative w-full flex items-center justify-center gap-2.5 bg-[#f57f20] hover:bg-[#ff8f36] active:scale-[0.98] active:bg-[#e06d1b] disabled:opacity-55 disabled:pointer-events-none text-white font-bold text-[14px] py-3.5 rounded-xl transition-all duration-200 shadow-[0_0_24px_rgba(245,127,32,0.22)] hover:shadow-[0_0_36px_rgba(245,127,32,0.38)] overflow-hidden">
                                        {isPending ? (
                                            <><svg className="animate-spin h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg><span>Please wait…</span></>
                                        ) : (
                                            <span>Sign In</span>
                                        )}
                                    </button>
                                </form>
                                )}

                                {/* Sign-up — redirect, no form */}
                                {tab === 'signup' && (<>
                                    <div className="mb-5">
                                        <h1 className="text-[20px] font-bold text-[#091825] tracking-tight leading-snug">Join the table.</h1>
                                        <p className="text-[#091825]/55 text-[13px] mt-1 leading-relaxed">
                                            We&apos;ll take you through a quick setup to personalise your meals.
                                        </p>
                                    </div>

                                    <div className="flex flex-wrap gap-2 mb-6">
                                        {['🥩 Preference', '🚫 Allergens', '🌶️ Spice', '🏠 Dorm', '🎓 University', '👤 About you', '🔐 Account'].map(s => (
                                            <span key={s} className="px-3 py-1 rounded-full bg-[#091825]/[0.06] border border-[#091825]/[0.08] text-[#091825]/60 text-[11px] font-semibold">{s}</span>
                                        ))}
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => router.push('/onboarding')}
                                        className="relative w-full flex items-center justify-center gap-2.5 bg-[#f57f20] hover:bg-[#ff8f36] active:scale-[0.98] text-white font-bold text-[14px] py-3.5 rounded-xl transition-all duration-200 shadow-[0_0_24px_rgba(245,127,32,0.22)] hover:shadow-[0_0_36px_rgba(245,127,32,0.38)] overflow-hidden"
                                    >
                                        <span>Start Setup</span>
                                        <span className="text-[16px] leading-none">→</span>
                                    </button>

                                    <p className="text-center text-[#091825]/45 text-[11px] mt-4">
                                        By creating an account you agree to our{' '}
                                        <Link href="/terms" className="underline hover:text-[#091825]/70 transition-colors">Terms</Link>{' '}and{' '}
                                        <Link href="/privacy" className="underline hover:text-[#091825]/70 transition-colors">Privacy Policy</Link>.
                                    </p>
                                </>)}

                                {/* Forgot password — three-phase inline flow (request → verify → reset).
                                    `step=set-password` lands magic-link clickers directly in the
                                    set-new-password phase. The component owns its own <form>. */}
                                {tab === 'forgot' && (
                                    <ForgotPasswordFlow
                                        initialPhase={step === 'set-password' ? 'reset' : 'request'}
                                        initialEmail={prefillEmail ?? ''}
                                        onBackToSignIn={() => switchTab('signin')}
                                    />
                                )}

                            </motion.div>
                        </AnimatePresence>
                    </div>
                </div>

                <Link
                    href="/home"
                    className="mt-6 text-[#091825]/55 hover:text-[#091825]/80 text-[13px] transition-colors"
                >
                    ← Back to website
                </Link>

            </motion.div>
        </div>
    )
}
