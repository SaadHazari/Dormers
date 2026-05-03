'use client'

import { useEffect, useState, useTransition } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { createAccount } from './actions'
import { OnboardingSteps } from './Steps'
import { DRAFT_KEY, stepVariants, type FormState, type Step } from './data'

export default function OnboardingPage() {
    const router = useRouter()
    const [step, setStep]           = useState<Step>(1)
    const [direction, setDirection] = useState(1)
    const [showPass, setShowPass]   = useState(false)
    const [error, setError]         = useState('')
    const [isPending, startTransition] = useTransition()

    const [form, setForm] = useState<FormState>({
        preference: '', vegDays: [], allergens: [], spiceLevel: '',
        dorm: '', customDorm: '', university: '', customUniversity: '',
        name: '', phone: '', email: '', password: '',
    })

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

    // Persist draft on every change (excluding password and the confirm screen).
    useEffect(() => {
        if (step === 'confirm') return
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
        setError('')
    }

    const advance = () => {
        if (step === 1)   { goTo(form.preference === 'Religious Preference' ? 1.5 : 2); return }
        if (step === 1.5) { goTo(2); return }
        if (step === 2)   { goTo(3); return }
        if (step === 3)   { goTo(4); return }
        if (step === 4)   { goTo(5); return }
        if (step === 5)   { goTo(6); return }
        if (step === 6)   { goTo(7); return }
    }

    const back = () => {
        if (step === 1 || step === 'confirm') { router.push('/login'); return }
        if (step === 1.5) { goTo(1); return }
        if (step === 2)   { goTo(form.preference === 'Religious Preference' ? 1.5 : 1); return }
        if (step === 3)   { goTo(2); return }
        if (step === 4)   { goTo(3); return }
        if (step === 5)   { goTo(4); return }
        if (step === 6)   { goTo(5); return }
        if (step === 7)   { goTo(6); return }
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

    // ── submission ────────────────────────────────────────────────────────────

    const handleCreate = () => {
        setError('')
        if (form.password.length < 8) { setError('Password must be at least 8 characters.'); return }

        const finalDorm = form.dorm === 'Other' ? form.customDorm.trim() : form.dorm
        const finalUni  = form.university === 'Other' ? form.customUniversity.trim() : form.university

        startTransition(async () => {
            const result = await createAccount({
                preference: form.preference,
                allergens:  form.allergens.length ? form.allergens : ['None'],
                spiceLevel: form.spiceLevel,
                dorm:       finalDorm,
                university: finalUni,
                name:       form.name.trim(),
                phone:      form.phone.trim(),
                email:      form.email.trim(),
                password:   form.password,
                vegDays:    form.vegDays,
            })

            if (!result) {
                // server-side redirect happened — wipe draft so we don't replay later
                try { sessionStorage.removeItem(DRAFT_KEY) } catch {}
                return
            }
            if ('error' in result) { setError(result.error); return }
            if ('requiresConfirmation' in result) {
                try { sessionStorage.removeItem(DRAFT_KEY) } catch {}
                goTo('confirm')
            }
        })
    }

    // ── progress ──────────────────────────────────────────────────────────────

    const isReligious = form.preference === 'Religious Preference'
    const totalSteps  = isReligious ? 8 : 7
    const stepNum: number =
        step === 'confirm' ? totalSteps :
        step === 1.5       ? 2 :
        isReligious        ? (step as number) + 1 :
        (step as number)
    const progress = Math.min((stepNum / totalSteps) * 100, 100)

    // ── render ────────────────────────────────────────────────────────────────

    return (
        <div className="min-h-screen bg-[#061520] flex flex-col font-montserrat">

            {/* subtle top gradient */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[700px] h-[360px] rounded-full bg-[#f57f20]/[0.04] blur-[120px]" />
                <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-[#0088cc]/[0.04] blur-[100px]" />
            </div>

            {/* Progress bar */}
            <div className="absolute top-0 left-0 w-full h-[3px] bg-white/[0.04] z-30">
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
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/[0.04] border border-white/[0.07] text-white/50 hover:text-white hover:bg-white/[0.07] transition-all"
                >
                    <ArrowLeft size={16} strokeWidth={2} />
                </button>

                {step !== 'confirm' && (
                    <span className="text-white/25 text-[11px] font-bold tracking-widest uppercase">
                        Step {stepNum} of {totalSteps}
                    </span>
                )}

                <Link href="/home">
                    <Image src="/logo.png" alt="Dormers" width={36} height={36} className="opacity-40 hover:opacity-70 transition-opacity" />
                </Link>
            </div>

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
                            showPass={showPass}
                            setShowPass={setShowPass}
                            error={error}
                            isPending={isPending}
                            handleCreate={handleCreate}
                        />
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    )
}
