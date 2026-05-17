'use client'

import { useEffect, useState, useTransition } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { FieldInput, CtaButton } from '@/app/onboarding/primitives'
import { DORMS } from '@/app/onboarding/data'
import { claimGift } from './actions'

// Matches the dark onboarding page exactly — same bg, same blur orbs,
// same primitives. Do not change the visual language here.

export default function ReferralLandingPage() {
  const params   = useParams()
  const router   = useRouter()
  const cid      = (Array.isArray(params.cid) ? params.cid[0] : params.cid ?? '').toUpperCase()

  const [inviterName, setInviterName] = useState<string | null>(null)
  const [loading,     setLoading]     = useState(true)

  const [firstName,   setFirstName]   = useState('')
  const [phone,       setPhone]       = useState('')
  const [email,       setEmail]       = useState('')
  const [dorm,        setDorm]        = useState('')
  const [preference,  setPreference]  = useState('')
  const [error,       setError]       = useState('')
  const [done,        setDone]        = useState(false)
  const [isPending,   startTransition] = useTransition()

  // Resolve the inviter's first name from the CID so the page can be
  // personalised ("Sara sent you a meal") without exposing the full customer row.
  useEffect(() => {
    if (!cid) { setLoading(false); return }
    fetch(`/api/referral/inviter?cid=${encodeURIComponent(cid)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setInviterName(d?.firstName ?? null))
      .catch(() => setInviterName(null))
      .finally(() => setLoading(false))
  }, [cid])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (isPending || done) return
    setError('')
    if (!firstName.trim()) { setError('Please enter your first name.'); return }
    if (!phone.trim())     { setError('Please enter your WhatsApp number.'); return }
    if (!email.trim())     { setError('Please enter your email.'); return }
    if (!dorm)             { setError('Please select your dorm.'); return }
    if (!preference)       { setError('Please choose a meal preference.'); return }

    startTransition(async () => {
      const result = await claimGift({
        inviterCid:  cid,
        firstName:   firstName.trim(),
        phone:       phone.trim(),
        email:       email.trim(),
        dormName:    dorm,
        preference,
      })

      if ('ok' in result)      { setDone(true); return }
      if ('blocked' in result) { setError(result.reason); return }
      setError(result.error)
    })
  }

  const labelCls  = 'block text-[11px] font-bold uppercase tracking-widest mb-1.5 text-white/65'
  const selectCls = 'w-full rounded-xl px-4 py-3 text-[14px] outline-none transition-all border bg-[#0d2035]/80 border-[#1e3448] hover:border-[#2a4a68] focus:border-[#f57f20]/70 focus:shadow-[0_0_0_3px_rgba(245,127,32,0.09)] text-white placeholder-white/55'

  if (loading) {
    return (
      <div className="min-h-screen bg-[#061520] flex items-center justify-center">
        <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-[#f57f20] animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#061520] flex flex-col font-montserrat">

      {/* Blur orbs — matches live onboarding exactly */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[700px] h-[360px] rounded-full bg-[#f57f20]/[0.04] blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-[#0088cc]/[0.04] blur-[100px]" />
      </div>

      {/* Nav bar */}
      <div className="relative z-10 flex items-center justify-between px-6 py-5">
        <Link href="/home">
          <Image src="/logo.png" alt="Dormers" width={36} height={36} className="opacity-50 hover:opacity-80 transition-opacity" />
        </Link>
        <Link href="/login" className="text-[12px] font-semibold text-white/55 hover:text-white/80 transition-colors">
          Sign in →
        </Link>
      </div>

      {/* Card */}
      <div className="relative z-10 flex-1 flex items-center justify-center px-4 pb-12">
        <div
          className="w-full max-w-sm rounded-2xl border border-white/[0.08] p-8"
          style={{
            background:       'rgba(13,32,53,0.70)',
            backdropFilter:   'blur(24px) saturate(1.4)',
            boxShadow:        '0 8px 40px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.05)',
          }}
        >
          {done ? (
            // ── Success state ────────────────────────────────────────────────
            <div className="text-center">
              <div className="mx-auto mb-5 w-14 h-14 rounded-full bg-[#22c55e]/[0.12] border border-[#22c55e]/30 flex items-center justify-center">
                <Check size={24} strokeWidth={2.5} className="text-[#22c55e]" />
              </div>
              <p className="text-[#f57f20] text-[12px] font-bold uppercase tracking-widest mb-2">You&apos;re in</p>
              <h1 className="text-[24px] font-black text-white tracking-tight leading-tight mb-3">
                Your meal is on its way.
              </h1>
              <p className="text-[13px] text-white/65 leading-relaxed mb-6">
                Expect delivery tonight between <span className="text-white/85 font-semibold">7–8 PM</span>.
                We&apos;ll WhatsApp you when it&apos;s close.
              </p>
              <CtaButton onClick={() => router.push('/login')}>
                Sign up to keep going →
              </CtaButton>
              <p className="mt-4 text-[11px] text-white/40 text-center">
                Your first paid plan comes with{' '}
                <span className="text-white/65 font-semibold">20% off</span>.
              </p>
            </div>
          ) : (
            // ── Claim form ───────────────────────────────────────────────────
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <p className="text-[#f57f20] text-[12px] font-bold uppercase tracking-widest mb-2">
                  Free meal
                </p>
                <h1 className="text-[26px] sm:text-[28px] font-black text-white tracking-tight leading-tight">
                  {inviterName
                    ? <>{inviterName} sent<br />you a meal.</>
                    : <>Your friend sent<br />you a meal.</>}
                </h1>
                <p className="text-[13px] mt-2 text-white/65 leading-snug">
                  No card. No commitment. Just fill in your details and expect delivery tonight between 7–8 PM.
                </p>
              </div>

              <div className="space-y-3">
                <FieldInput
                  label="First Name"
                  type="text"
                  placeholder="What should we call you?"
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  autoComplete="given-name"
                />

                <FieldInput
                  label="WhatsApp Number"
                  type="tel"
                  inputMode="tel"
                  placeholder="+971 50 000 0000"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  autoComplete="tel"
                />

                <FieldInput
                  label="Email Address"
                  type="email"
                  placeholder="you@university.edu"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoComplete="email"
                />

                <div>
                  <label className={labelCls}>Your Dorm</label>
                  <select
                    value={dorm}
                    onChange={e => setDorm(e.target.value)}
                    className={selectCls}
                  >
                    <option value="" disabled>Select your dorm</option>
                    {DORMS.filter(d => d !== 'Other').map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={labelCls}>Meal Preference</label>
                  <select
                    value={preference}
                    onChange={e => setPreference(e.target.value)}
                    className={selectCls}
                  >
                    <option value="" disabled>Select preference</option>
                    <option value="Non-Veg">Non-Veg</option>
                    <option value="Veg">Veg</option>
                    <option value="Religious Preference">Religious</option>
                  </select>
                </div>
              </div>

              {error && (
                <div className="px-4 py-3 rounded-xl bg-red-500/[0.08] border border-red-500/[0.18] text-[13px] text-center text-red-400 leading-snug">
                  {error}
                </div>
              )}

              <CtaButton type="submit" disabled={isPending}>
                {isPending ? 'Claiming your meal…' : 'Claim my free meal →'}
              </CtaButton>

              <p className="text-center text-[11px] text-white/50">
                By continuing you agree to our{' '}
                <Link href="/terms"  className="underline hover:text-white/70 transition-colors">Terms</Link>{' '}and{' '}
                <Link href="/privacy" className="underline hover:text-white/70 transition-colors">Privacy Policy</Link>.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
