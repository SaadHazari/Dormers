'use client'

/**
 * Staff claim door — the single screen between an intern's WhatsApp invite
 * and the normal onboarding. Email + code; on success the 60-minute claim
 * window opens server-side and the intern proceeds through the standard
 * signup (own password, own preferences, OTP on the registered phone).
 *
 * Visual language copied from the locked onboarding/auth funnel (authTokens
 * + FieldInput/CtaButton primitives) — this is deliberately "step 0" of
 * onboarding, not a new design.
 */

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { BadgeCheck, ArrowRight, LogOut } from 'lucide-react'
import { useIsLight } from '@/ui-system/hooks/useIsLight'
import { authTokens } from '@/ui-system/tokens/auth-theme'
import { FieldInput, CtaButton } from '@/app/onboarding/primitives'
import { whatsAppHref } from '@/shared/contacts'
import { createClient } from '@/utils/supabase/client'
import { verifyStaffClaim } from './actions'

export default function StaffClaimPage() {
    const router = useRouter()
    const isLight = useIsLight()
    const tokens = authTokens(isLight)

    const [email, setEmail] = useState('')
    const [code, setCode] = useState('')
    const [error, setError] = useState('')
    const [greeting, setGreeting] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()
    // A browser already signed in to ANOTHER account would get silently
    // bounced /onboarding → /dashboard by the middleware, eating the claim.
    // Detect the session, say so, and offer the sign-out right here.
    const [signedInAs, setSignedInAs] = useState<string | null>(null)

    useEffect(() => {
        createClient().auth.getUser().then(({ data }) => {
            if (data.user?.email) setSignedInAs(data.user.email)
        }).catch(() => {})
    }, [])

    const signOutHere = async () => {
        try { await createClient().auth.signOut() } catch {}
        setSignedInAs(null)
    }

    const submit = (e: React.FormEvent) => {
        e.preventDefault()
        if (isPending || greeting) return
        setError('')
        startTransition(async () => {
            const res = await verifyStaffClaim(email, code)
            if ('error' in res) { setError(res.error); return }
            // Defensive: a lingering session would hijack the onboarding
            // redirect (middleware bounces authed users to /dashboard).
            // No-op when nobody is signed in.
            try { await createClient().auth.signOut() } catch {}
            setGreeting(res.firstName)
            setTimeout(() => router.push('/onboarding'), 1200)
        })
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
                className={`w-full max-w-[420px] rounded-2xl border p-7 ${tokens.card} ${tokens.cardShadow}`}
            >
                <Image src={isLight ? '/logo-light.svg' : '/logo-dark.svg'} alt="Dormers" width={44} height={44} />

                {greeting ? (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-5 text-center py-6">
                        <BadgeCheck size={36} className="mx-auto text-[#f57f20]" strokeWidth={2} />
                        <h1 className={`mt-3 text-[20px] font-extrabold ${tokens.heading}`}>
                            Welcome aboard, {greeting}.
                        </h1>
                        <p className={`mt-2 text-[13px] leading-relaxed ${tokens.subline}`}>
                            Setting up your account — you&apos;ll pick your meals, spice level, and plan next.
                        </p>
                    </motion.div>
                ) : (
                    <>
                        {signedInAs && (
                            <div className="mt-5 rounded-xl border border-[#f57f20]/40 bg-[#f57f20]/10 p-3.5">
                                <p className={`text-[12.5px] leading-relaxed ${tokens.subline}`}>
                                    You&apos;re signed in as <strong className={tokens.heading}>{signedInAs}</strong>.
                                    Claiming a staff invite creates a fresh account, so you&apos;ll be signed out first.
                                </p>
                                <button
                                    type="button"
                                    onClick={signOutHere}
                                    className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-bold text-[#f57f20] underline underline-offset-2"
                                >
                                    <LogOut size={12} strokeWidth={2.4} /> Sign out now
                                </button>
                            </div>
                        )}
                        <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.18em] text-[#f57f20]">
                            Staff onboarding
                        </p>
                        <h1 className={`mt-1.5 text-[22px] font-extrabold leading-tight ${tokens.heading}`}>
                            You&apos;re joining the team<span className="text-[#f57f20]">.</span>
                        </h1>
                        <p className={`mt-2 text-[13px] leading-relaxed ${tokens.subline}`}>
                            Enter the email we registered for you and the code we sent you on WhatsApp.
                        </p>

                        <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
                            <FieldInput
                                label="Your email"
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                placeholder="you@gmail.com"
                                autoComplete="email"
                                required
                            />
                            <FieldInput
                                label="Claim code"
                                value={code}
                                onChange={e => setCode(e.target.value.toUpperCase())}
                                placeholder="XXXX-XXXX"
                                autoComplete="one-time-code"
                                className="tracking-[0.18em] font-bold uppercase"
                                required
                            />

                            {error && (
                                <p className="text-[12.5px] leading-relaxed font-semibold text-[#e5484d]" role="alert">
                                    {error}
                                </p>
                            )}

                            <CtaButton type="submit" disabled={isPending || !email.trim() || !code.trim()}>
                                {isPending ? 'Checking…' : <>Continue <ArrowRight size={15} strokeWidth={2.6} /></>}
                            </CtaButton>
                        </form>

                        <p className={`mt-5 text-[12px] leading-relaxed ${tokens.helpText}`}>
                            No code, or it expired?{' '}
                            <a
                                href={whatsAppHref('Hi! I\'m joining as staff but my claim code isn\'t working — could you send me a new one?')}
                                target="_blank"
                                rel="noreferrer"
                                className="font-bold text-[#f57f20] underline underline-offset-2"
                            >
                                Message us on WhatsApp
                            </a>
                        </p>
                    </>
                )}
            </motion.div>
        </div>
    )
}
