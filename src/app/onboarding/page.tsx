'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { OnboardingSteps } from './Steps'
import { DRAFT_KEY, stepVariants, type FormState, type Step } from './data'
import ThemeToggle from '@/app/components/ThemeToggle'
import { useIsLight } from '@/ui-system/hooks/useIsLight'
import { authTokens } from '@/ui-system/tokens/auth-theme'

export default function OnboardingPage() {
    const router = useRouter()
    const [step, setStep]           = useState<Step>(1)
    const [direction, setDirection] = useState(1)

    const [form, setForm] = useState<FormState>({
        preference: '', vegDays: [], allergens: [], spiceLevel: '',
        dorm: '', customDorm: '', university: '', customUniversity: '',
        weekType: '6DAYS',
        name: '', phone: '', phoneVerified: false, email: '', password: '',
    })

    // Keeps `advance` reading the latest form values when called from a
    // setTimeout — the captured closure would otherwise see pre-set state
    // and skip step 1.5 after picking Religious Preference.
    const formRef = useRef(form)
    formRef.current = form

    // Hydrate draft from sessionStorage so page refresh doesn't wipe progress.
    useEffect(() => {
        try {
            const raw = sessionStorage.getItem(DRAFT_KEY)
            if (!raw) return
            const saved = JSON.parse(raw)
            if (saved && typeof saved === 'object' && saved.form) {
                setForm(prev => ({ ...prev, ...saved.form, password: '' })) // never restore password
                if (typeof saved.step !== 'undefined') setStep(saved.step)
            }
        } catch { /* corrupt draft — ignore */ }
    }, [])

    // Persist draft on every change.
    useEffect(() => {
        try {
            const safe = { ...form, password: '' }
            sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ form: safe, step }))
        } catch { /* quota — ignore */ }
    }, [form, step])

    // ── navigation ────────────────────────────────────────────────────────────

    const goTo = (next: Step) => {
        const curr = typeof step === 'number' ? step : 99
        const nxt  = typeof next === 'number' ? next : 99
        setDirection(nxt > curr ? 1 : -1)
        setStep(next)
    }

    const advance = () => {
        const f = formRef.current
        if (step === 1)    { goTo(1.25); return }                                                  // pref → week-type
        if (step === 1.25) { goTo(f.preference === 'Religious Preference' ? 1.5 : 2); return }     // week-type → (religious? veg-days : allergens)
        if (step === 1.5)  { goTo(2); return }
        if (step === 2)    { goTo(3); return }
        if (step === 3)    { goTo(4); return }
        if (step === 4)    { goTo(5); return }
        if (step === 5)    { goTo(6); return }
        if (step === 6)    { goTo(7); return }
    }

    const back = () => {
        const f = formRef.current
        if (step === 1)    { router.push('/login'); return }
        if (step === 1.25) { goTo(1); return }
        if (step === 1.5)  { goTo(1.25); return }
        if (step === 2)    { goTo(f.preference === 'Religious Preference' ? 1.5 : 1.25); return }
        if (step === 3)    { goTo(2); return }
        if (step === 4)    { goTo(3); return }
        if (step === 5)    { goTo(4); return }
        if (step === 6)    { goTo(5); return }
        if (step === 7)    { goTo(6); return }
    }

    // ── form helpers ──────────────────────────────────────────────────────────

    const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
        setForm(prev => ({ ...prev, [key]: value }))

    const toggleAllergen = (item: string) => {
        if (item === 'None') { set('allergens', ['None']); return }
        setForm(prev => {
            const without = prev.allergens.filter(a => a !== 'None' && a !== item)
            return { ...prev, allergens: prev.allergens.includes(item) ? without : [...without, item] }
        })
    }

    const toggleVegDay = (day: string) =>
        setForm(prev => ({
            ...prev,
            vegDays: prev.vegDays.includes(day)
                ? prev.vegDays.filter(d => d !== day)
                : [...prev.vegDays, day],
        }))

    // ── progress ──────────────────────────────────────────────────────────────

    const isReligious = form.preference === 'Religious Preference'
    const totalSteps  = isReligious ? 8 : 7
    const stepNum: number =
        step === 1.5 ? 2 :
        isReligious  ? (step as number) + 1 :
        (step as number)
    const progress = Math.min((stepNum / totalSteps) * 100, 100)

    const isLight = useIsLight()
    const tokens = authTokens(isLight)

    // ── render ────────────────────────────────────────────────────────────────

    return (
        <div
            className="min-h-screen flex flex-col font-montserrat relative overflow-hidden"
            style={{
                background: tokens.pageBackground,
                transition: 'background 320ms ease',
            }}
        >

            {/* subtle top gradient */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className={`absolute -top-32 left-1/2 -translate-x-1/2 w-[700px] h-[360px] rounded-full blur-[120px] ${isLight ? 'bg-[#f57f20]/[0.07]' : 'bg-[#f57f20]/[0.04]'}`} />
                <div className={`absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full blur-[100px] ${isLight ? 'bg-[#0088cc]/[0.06]' : 'bg-[#0088cc]/[0.04]'}`} />
            </div>

            {/* Progress bar */}
            <div className={`absolute top-0 left-0 w-full h-[3px] z-30 ${isLight ? 'bg-[#091825]/[0.06]' : 'bg-white/[0.04]'}`}>
                <motion.div
                    className="h-full bg-[#f57f20]"
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.35, ease: 'easeOut' }}
                />
            </div>

            {/* Header */}
            <div className="relative z-20 flex items-center justify-between px-4 sm:px-6 pt-6 pb-2 max-w-[540px] mx-auto w-full">
                <button
                    onClick={back}
                    className={`w-8 h-8 flex items-center justify-center rounded-lg border transition-all ${
                        isLight
                            ? 'bg-[#091825]/[0.04] border-[#091825]/[0.08] text-[#091825]/55 hover:text-[#091825] hover:bg-[#091825]/[0.08]'
                            : 'bg-white/[0.04] border-white/[0.07] text-white/50 hover:text-white hover:bg-white/[0.07]'
                    }`}
                >
                    <ArrowLeft size={16} strokeWidth={2} />
                </button>

                <span className={`text-[11px] font-bold tracking-widest uppercase ${isLight ? 'text-[#091825]/65' : 'text-white/65'}`}>
                    Step {stepNum} of {totalSteps}
                </span>

                <Link href="/home">
                    {/* Asset name = target surface (not own colour). */}
                    <Image
                        src={isLight ? '/logo-light.svg' : '/logo-dark.svg'}
                        alt="Dormers"
                        width={44}
                        height={44}
                        className="opacity-90 hover:opacity-100 transition-opacity"
                    />
                </Link>
            </div>

            {/* Hanging-bulb theme toggle — self-positioned fixed top-right. */}
            <ThemeToggle />

            {/* Content */}
            <div className="relative z-10 flex-1 flex flex-col justify-center px-4 sm:px-6 py-6 max-w-[540px] mx-auto w-full">
                <AnimatePresence mode="wait" custom={direction}>
                    <motion.div
                        key={String(step)}
                        custom={direction}
                        variants={stepVariants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                    >
                        <OnboardingSteps
                            step={step}
                            form={form}
                            set={set}
                            advance={advance}
                            toggleAllergen={toggleAllergen}
                            toggleVegDay={toggleVegDay}
                            isLight={isLight}
                        />
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    )
}
