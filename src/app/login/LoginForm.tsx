'use client'

import { useState, useTransition, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff } from 'lucide-react'
import { login } from './actions'

type Tab = 'signin' | 'signup'

interface Props {
    error?: string
    message?: string
    nextUrl: string
}

export default function LoginForm({ error, message, nextUrl }: Props) {
    const router = useRouter()
    const [tab, setTab] = useState<Tab>('signin')
    const [showPassword, setShowPassword] = useState(false)
    const [isPending, startTransition] = useTransition()
    const formRef = useRef<HTMLFormElement>(null)

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        // "Create Account" tab redirects to the dedicated onboarding flow
        if (tab === 'signup') {
            router.push('/onboarding')
            return
        }
        const formData = new FormData(e.currentTarget)
        formData.set('next_url', nextUrl)
        startTransition(async () => {
            await login(formData)
        })
    }

    const switchTab = (next: Tab) => {
        if (next === tab || isPending) return
        setShowPassword(false)
        setTab(next)
        // Clear inputs when switching modes
        if (formRef.current) formRef.current.reset()
    }

    return (
        <div className="min-h-screen bg-[#091825] flex items-center justify-center p-4 relative overflow-hidden font-montserrat">

            {/* ── Ambient background ── */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
                {/* Orange orb — bottom left */}
                <div className="absolute -bottom-32 -left-32 w-[560px] h-[560px] rounded-full bg-[#f57f20]/[0.07] blur-[130px]" />
                {/* Blue orb — top right */}
                <div className="absolute -top-20 -right-20 w-[420px] h-[420px] rounded-full bg-[#0088cc]/[0.06] blur-[110px]" />
                {/* Faint centre wash */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full bg-[#f57f20]/[0.03] blur-[100px]" />
            </div>

            {/* ── Page content ── */}
            <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                className="relative z-10 w-full max-w-[400px] flex flex-col items-center"
            >

                {/* Logo */}
                <Link href="/home" className="mb-7 block opacity-90 hover:opacity-100 transition-opacity">
                    <Image
                        src="/logo.png"
                        alt="Dormers"
                        width={100}
                        height={100}
                        className="object-contain"
                        priority
                    />
                </Link>

                {/* ── Card ── */}
                <div className="w-full rounded-[28px] bg-white/[0.03] border border-white/[0.07] shadow-[0_32px_80px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-2xl overflow-hidden">

                    {/* Tab switcher */}
                    <div className="px-5 pt-5">
                        <div className="relative flex bg-white/[0.04] border border-white/[0.06] rounded-2xl p-1">
                            {/* Sliding pill */}
                            <motion.div
                                className="absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-[14px] bg-white/[0.07] border border-white/[0.10] shadow-[0_2px_8px_rgba(0,0,0,0.25)]"
                                animate={{ left: tab === 'signin' ? '4px' : 'calc(50%)' }}
                                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                            />
                            {(['signin', 'signup'] as Tab[]).map((t) => (
                                <button
                                    key={t}
                                    type="button"
                                    onClick={() => switchTab(t)}
                                    className={`relative z-10 flex-1 py-2.5 text-[13px] font-semibold rounded-[14px] transition-colors duration-200 ${
                                        tab === t ? 'text-white' : 'text-white/35 hover:text-white/65'
                                    }`}
                                >
                                    {t === 'signin' ? 'Sign In' : 'Create Account'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Form body */}
                    <form ref={formRef} onSubmit={handleSubmit} className="px-5 pt-5 pb-6">
                        <AnimatePresence mode="wait" initial={false}>
                            <motion.div
                                key={tab}
                                initial={{ opacity: 0, x: tab === 'signin' ? -10 : 10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: tab === 'signin' ? 10 : -10 }}
                                transition={{ duration: 0.18, ease: 'easeOut' }}
                            >

                                {/* ── Sign-in view ── */}
                                {tab === 'signin' && (<>
                                    <div className="mb-5">
                                        <h1 className="text-[20px] font-bold text-white tracking-tight leading-snug">Welcome back.</h1>
                                        <p className="text-white/35 text-[13px] mt-1">Sign in to manage your meal plan.</p>
                                    </div>

                                    <div className="mb-3.5">
                                        <label className="block text-[11px] font-semibold uppercase tracking-widest text-white/40 mb-2">Email</label>
                                        <input
                                            name="email"
                                            type="email"
                                            required
                                            autoComplete="email"
                                            placeholder="you@university.edu"
                                            className="w-full bg-white/[0.04] border border-white/[0.08] hover:border-white/[0.16] focus:border-[#f57f20]/70 focus:bg-[#f57f20]/[0.03] focus:shadow-[0_0_0_3px_rgba(245,127,32,0.09)] rounded-xl px-4 py-3 text-white text-[14px] placeholder-white/20 outline-none transition-all duration-200"
                                        />
                                    </div>

                                    <div className="mb-5">
                                        <label className="block text-[11px] font-semibold uppercase tracking-widest text-white/40 mb-2">Password</label>
                                        <div className="relative">
                                            <input
                                                name="password"
                                                type={showPassword ? 'text' : 'password'}
                                                required
                                                autoComplete="current-password"
                                                placeholder="••••••••"
                                                className="w-full bg-white/[0.04] border border-white/[0.08] hover:border-white/[0.16] focus:border-[#f57f20]/70 focus:bg-[#f57f20]/[0.03] focus:shadow-[0_0_0_3px_rgba(245,127,32,0.09)] rounded-xl px-4 py-3 pr-11 text-white text-[14px] placeholder-white/20 outline-none transition-all duration-200"
                                            />
                                            <button type="button" tabIndex={-1} onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-white/25 hover:text-white/55 transition-colors">
                                                {showPassword ? <EyeOff size={15} strokeWidth={2} /> : <Eye size={15} strokeWidth={2} />}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Feedback banners */}
                                    <div className="mb-4 min-h-0">
                                        <AnimatePresence>
                                            {error && (
                                                <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="px-4 py-3 rounded-xl bg-red-500/[0.08] border border-red-500/[0.18] text-red-400 text-[13px] text-center leading-snug">
                                                    {error}
                                                </motion.div>
                                            )}
                                            {message && !error && (
                                                <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="px-4 py-3 rounded-xl bg-green-500/[0.08] border border-green-500/[0.18] text-green-400 text-[13px] text-center leading-snug">
                                                    {message}
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>

                                    <button type="submit" disabled={isPending} className="relative w-full flex items-center justify-center gap-2.5 bg-[#f57f20] hover:bg-[#ff8f36] active:scale-[0.98] active:bg-[#e06d1b] disabled:opacity-55 disabled:pointer-events-none text-white font-bold text-[14px] py-3.5 rounded-xl transition-all duration-200 shadow-[0_0_24px_rgba(245,127,32,0.22)] hover:shadow-[0_0_36px_rgba(245,127,32,0.38)] overflow-hidden">
                                        <span className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.08] to-transparent -translate-x-full hover:translate-x-full transition-transform duration-700" />
                                        {isPending ? (
                                            <><svg className="animate-spin h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg><span>Please wait…</span></>
                                        ) : (
                                            <span>Sign In</span>
                                        )}
                                    </button>
                                </>)}

                                {/* ── Sign-up view — redirect to onboarding ── */}
                                {tab === 'signup' && (<>
                                    <div className="mb-5">
                                        <h1 className="text-[20px] font-bold text-white tracking-tight leading-snug">Join the table.</h1>
                                        <p className="text-white/35 text-[13px] mt-1 leading-relaxed">
                                            We&apos;ll take you through a quick setup to personalise your meals.
                                        </p>
                                    </div>

                                    {/* Step preview pills */}
                                    <div className="flex flex-wrap gap-2 mb-6">
                                        {['🥩 Preference', '🚫 Allergens', '🌶️ Spice', '🏠 Dorm', '🎓 University', '👤 About you', '🔐 Account'].map(s => (
                                            <span key={s} className="px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.07] text-white/40 text-[11px] font-semibold">{s}</span>
                                        ))}
                                    </div>

                                    <button
                                        type="submit"
                                        className="relative w-full flex items-center justify-center gap-2.5 bg-[#f57f20] hover:bg-[#ff8f36] active:scale-[0.98] text-white font-bold text-[14px] py-3.5 rounded-xl transition-all duration-200 shadow-[0_0_24px_rgba(245,127,32,0.22)] hover:shadow-[0_0_36px_rgba(245,127,32,0.38)] overflow-hidden"
                                    >
                                        <span className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.08] to-transparent -translate-x-full hover:translate-x-full transition-transform duration-700" />
                                        <span>Start Setup</span>
                                        <span className="text-[16px] leading-none">→</span>
                                    </button>

                                    <p className="text-center text-white/20 text-[11px] mt-4">
                                        By creating an account you agree to our{' '}
                                        <Link href="/terms" className="underline hover:text-white/45 transition-colors">Terms</Link>{' '}and{' '}
                                        <Link href="/privacy" className="underline hover:text-white/45 transition-colors">Privacy Policy</Link>.
                                    </p>
                                </>)}

                            </motion.div>
                        </AnimatePresence>
                    </form>
                </div>

                {/* Back link */}
                <Link
                    href="/home"
                    className="mt-6 text-white/25 hover:text-white/55 text-[13px] transition-colors"
                >
                    ← Back to website
                </Link>

            </motion.div>
        </div>
    )
}
