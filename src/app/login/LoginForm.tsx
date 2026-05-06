'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { Eye, EyeOff } from 'lucide-react'
import { login } from './actions'
import { ForgotPasswordFlow } from './ForgotPasswordFlow'
import ThemeToggle from '@/app/components/ThemeToggle'
import { useIsLight } from '@/hooks/useIsLight'
import { useCapsLock } from '@/hooks/useCapsLock'
import { authTokens } from '@/lib/auth-theme'

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
    const { capsOn, onKeyDown: capsKeyDown, onKeyUp: capsKeyUp } = useCapsLock()
    const [isPending, startTransition] = useTransition()
    const formRef = useRef<HTMLFormElement>(null)

    // Login is light-mode by default — always. Users arriving from the
    // dark-mode marketing site still see a clean light auth surface so the
    // password/OTP fields stay legible.
    //
    // We force light on mount via setTheme (so next-themes drives the React
    // tree consistently), and restore the user's previous preference on
    // unmount so the marketing-site choice survives a login round-trip.
    // The hanging-bulb toggle stays available — if the user explicitly
    // picks dark mid-session, they get dark for the rest of that session.
    const { theme: persistedTheme, setTheme } = useTheme()
    useEffect(() => {
        const prev = persistedTheme
        setTheme('light')
        return () => {
            if (prev && prev !== 'light') setTheme(prev)
        }
        // Run once on mount; we deliberately don't react to persistedTheme
        // changes to avoid a feedback loop with the bulb toggle.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const isLight = useIsLight()
    const tokens = authTokens(isLight)

    const fieldClass = `w-full rounded-xl px-4 py-3 text-[14px] outline-none transition-all duration-200 border ${tokens.field} ${tokens.fieldFocus}`
    const labelClass = `block text-[11px] font-semibold uppercase tracking-widest mb-2 ${tokens.label}`
    const headingClass = `text-[20px] font-bold tracking-tight leading-snug ${tokens.heading}`
    const sublineClass = `text-[13px] mt-1 ${tokens.subline}`

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
        setTab(next)
        clearUrlState()
        if (formRef.current) formRef.current.reset()
    }

    return (
        <div
            className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
            style={{
                background: tokens.pageBackground,
                transition: 'background 320ms ease',
            }}
        >
            {/* Hanging-bulb theme toggle — self-positioned fixed top-right. */}
            <ThemeToggle />

            <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className={`absolute -bottom-32 -left-32 w-[560px] h-[560px] rounded-full blur-[140px] ${isLight ? 'bg-[#f57f20]/[0.08]' : 'bg-[#f57f20]/[0.05]'}`} />
                <div className={`absolute -top-20 -right-20 w-[420px] h-[420px] rounded-full blur-[120px] ${isLight ? 'bg-[#f57f20]/[0.05]' : 'bg-[#f57f20]/[0.04]'}`} />
                {/* Ambient warm tint — dark mode only. Three offset radial
                    sources so the page reads as an environmental hue rather
                    than one visible circle. Stacks on top of the corner blobs
                    above to deepen the warmth toward the centre. */}
                {!isLight && (
                    <div
                        aria-hidden
                        className="absolute inset-0"
                        style={{
                            background: `
                                radial-gradient(ellipse 70% 55% at 50% 45%, rgba(245,127,32,0.12), transparent 70%),
                                radial-gradient(ellipse 55% 45% at 25% 70%, rgba(245,127,32,0.07), transparent 70%),
                                radial-gradient(ellipse 55% 45% at 75% 30%, rgba(245,127,32,0.07), transparent 70%)
                            `,
                        }}
                    />
                )}
            </div>

            <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                className="relative z-10 w-full max-w-[400px] flex flex-col items-center"
            >
                <Link href="/home" className="mb-7 block opacity-90 hover:opacity-100 transition-opacity">
                    {/* Asset name = target surface (not own colour). Switches with
                        theme so the wordmark always has contrast. */}
                    <Image
                        src={isLight ? '/logo-light.svg' : '/logo-dark.svg'}
                        alt="Dormers"
                        width={100}
                        height={100}
                        className="object-contain"
                        priority
                    />
                </Link>

                <div className={`w-full rounded-[28px] overflow-hidden border ${tokens.card} ${tokens.cardShadow}`}>

                    {/* Tab switcher (sign-in / sign-up only; forgot is a sub-state of sign-in) */}
                    {tab !== 'forgot' && (
                        <div className="px-5 pt-5">
                            <div className={`relative flex rounded-2xl p-1 border ${
                                isLight
                                    ? 'bg-[#091825]/[0.05] border-[#091825]/[0.08]'
                                    : 'bg-white/[0.04] border-white/[0.06]'
                            }`}>
                                <motion.div
                                    className={`absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-[14px] border ${
                                        isLight
                                            ? 'bg-white border-[#091825]/[0.10] shadow-[0_2px_8px_rgba(9,24,37,0.08)]'
                                            : 'bg-[#0d2035] border-[#1e3448] shadow-[0_2px_8px_rgba(0,0,0,0.32)]'
                                    }`}
                                    animate={{ left: tab === 'signin' ? '4px' : 'calc(50%)' }}
                                    transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                                />
                                {(['signin', 'signup'] as Tab[]).map((t) => (
                                    <button
                                        key={t}
                                        type="button"
                                        onClick={() => switchTab(t)}
                                        className={`relative z-10 flex-1 py-2.5 text-[13px] font-semibold rounded-[14px] transition-colors duration-200 ${
                                            isLight
                                                ? (tab === t ? 'text-[#091825]' : 'text-[#091825]/60 hover:text-[#091825]/80')
                                                : (tab === t ? 'text-white' : 'text-white/55 hover:text-white/80')
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
                                            <h1 className={headingClass}>Welcome back.</h1>
                                            <p className={sublineClass}>Sign in to manage your meal plan.</p>
                                        </div>

                                        <div className="mb-3.5">
                                            <label className={labelClass}>Email</label>
                                            <input
                                                name="email"
                                                type="email"
                                                required
                                                autoComplete="email"
                                                autoFocus
                                                defaultValue={prefillEmail ?? ''}
                                                placeholder="you@example.com"
                                                className={fieldClass}
                                            />
                                        </div>

                                        <div className="mb-2">
                                            <div className="flex items-center justify-between mb-2">
                                                <label className={`${labelClass} mb-0`}>Password</label>
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
                                                    onKeyDown={capsKeyDown}
                                                    onKeyUp={capsKeyUp}
                                                    className={`${fieldClass} pr-11 ${showPassword ? '' : 'text-[18px] tracking-[0.22em] font-semibold'}`}
                                                />
                                                <button type="button" tabIndex={-1} onClick={() => setShowPassword(v => !v)} className={`absolute right-3 top-1/2 -translate-y-1/2 p-1 transition-colors ${tokens.eyeBtn}`}>
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
                                                    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className={`${tokens.errorBanner} ${tokens.errorText}`}>
                                                        {error}
                                                    </motion.div>
                                                )}
                                                {message && !error && (
                                                    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className={`px-4 py-3 rounded-xl bg-green-500/[0.08] border border-green-500/[0.18] text-[13px] text-center leading-snug ${isLight ? 'text-green-700' : 'text-green-400'}`}>
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
                                        <h1 className={headingClass}>Join the table.</h1>
                                        <p className={`${sublineClass} leading-relaxed`}>
                                            We&apos;ll take you through a quick setup to personalise your meals.
                                        </p>
                                    </div>

                                    <div className="flex flex-wrap gap-1.5 mb-6">
                                        {['🍗 Preference', '🚫 Allergens', '🌶️ Spice', '🏠 Dorm', '🎓 University', '👤 About you', '🔐 Account'].map(s => (
                                            <span
                                                key={s}
                                                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                                                    isLight
                                                        ? 'bg-[#091825]/[0.05] text-[#091825]/65'
                                                        : 'bg-white/[0.05] text-white/70'
                                                }`}
                                            >
                                                {s}
                                            </span>
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

                                    <p className={`text-center text-[11px] mt-4 ${tokens.termsBase}`}>
                                        By creating an account you agree to our{' '}
                                        <Link href="/terms" className={`underline transition-colors ${tokens.termsHover}`}>Terms</Link>{' '}and{' '}
                                        <Link href="/privacy" className={`underline transition-colors ${tokens.termsHover}`}>Privacy Policy</Link>.
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
                    className={`mt-6 text-[13px] transition-colors ${tokens.backLink}`}
                >
                    ← Back to website
                </Link>

            </motion.div>
        </div>
    )
}
