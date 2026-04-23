'use client'

import { useState, useTransition } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Eye, EyeOff, Check, Mail } from 'lucide-react'
import { createAccount } from './actions'
import Image from 'next/image'
import Link from 'next/link'

// ─── static data ─────────────────────────────────────────────────────────────

const PREFERENCES = [
    { value: 'Carnivore',            emoji: '🥩', label: 'Carnivore',            desc: 'Chicken, mutton & more every day' },
    { value: 'Plant-Based',          emoji: '🥗', label: 'Plant-Based',          desc: 'Fully vegetarian, every meal' },
    { value: 'Religious Preference', emoji: '☪️', label: 'Religious Preference', desc: 'Halal — choose your veg days below' },
]

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const ALLERGENS = ['Nuts', 'Dairy', 'Gluten', 'Shellfish', 'Eggs', 'Soy']

const SPICE_LEVELS = [
    { value: 'Mild',       emoji: '🌱', label: 'Mild',       desc: 'Easy on the spice' },
    { value: 'Medium',     emoji: '🌶️', label: 'Medium',     desc: 'A little kick' },
    { value: 'Hot',        emoji: '🔥', label: 'Hot',        desc: 'Bring the heat' },
    { value: 'Extra Hot',  emoji: '💀', label: 'Extra Hot',  desc: 'Absolutely no mercy' },
]

const DORMS = ['The Myriad', 'KSK Homes', 'Yugo', 'DSOA Residence', 'Study World', 'Other']

const UNIVERSITIES = [
    'American University in Dubai',
    'Murdoch University Dubai',
    'Middlesex University Dubai',
    'Heriot-Watt University Dubai',
    'British University in Dubai',
    'Manipal University Dubai',
    'SP Jain School of Global Management',
    'University of Dubai',
    'Amity University Dubai',
    'Other',
]

// ─── types ────────────────────────────────────────────────────────────────────

// Steps: 1=Preference, 1.5=VegDays(religious only), 2=Allergens, 3=Spice,
//        4=Dorm, 5=University, 6=Contact, 7=Credentials, confirm=Done
type Step = 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 7 | 'confirm'

interface FormState {
    preference: string
    vegDays: string[]
    allergens: string[]
    spiceLevel: string
    dorm: string
    customDorm: string
    university: string
    customUniversity: string
    name: string
    phone: string
    email: string
    password: string
}

// ─── helpers ──────────────────────────────────────────────────────────────────

const variants = {
    enter:  (dir: number) => ({ x: dir > 0 ? 40 : -40, opacity: 0 }),
    center: { x: 0, opacity: 1, transition: { type: 'spring' as const, stiffness: 380, damping: 34 } },
    exit:   (dir: number) => ({ x: dir > 0 ? -40 : 40, opacity: 0, transition: { duration: 0.14 } }),
}

// ─── shared UI primitives ─────────────────────────────────────────────────────

const SelectCard = ({
    selected, onClick, emoji, label, desc,
}: { selected: boolean; onClick: () => void; emoji: string; label: string; desc?: string }) => (
    <button
        onClick={onClick}
        className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl border text-left transition-all duration-150 ${
            selected
                ? 'border-[#f57f20] bg-[#f57f20]/[0.06]'
                : 'border-[#1e3448] bg-[#0d2035] hover:border-[#2a4a68] hover:bg-[#0f2540]'
        }`}
    >
        <span className="text-xl shrink-0">{emoji}</span>
        <div className="flex-1 min-w-0">
            <p className={`font-semibold text-[14px] ${selected ? 'text-white' : 'text-white/80'}`}>{label}</p>
            {desc && <p className="text-white/40 text-[12px] mt-0.5 leading-snug">{desc}</p>}
        </div>
        {selected && <Check size={15} className="text-[#f57f20] shrink-0" strokeWidth={2.5} />}
    </button>
)

const PillCard = ({
    selected, onClick, label,
}: { selected: boolean; onClick: () => void; label: string }) => (
    <button
        onClick={onClick}
        className={`flex items-center justify-center gap-1.5 px-3 py-3 rounded-xl border text-center transition-all duration-150 ${
            selected
                ? 'border-[#f57f20] bg-[#f57f20]/[0.07] text-white'
                : 'border-[#1e3448] bg-[#0d2035] text-white/55 hover:border-[#2a4a68] hover:text-white/80'
        }`}
    >
        {selected && <Check size={12} className="text-[#f57f20] shrink-0" strokeWidth={3} />}
        <span className="text-[13px] font-semibold">{label}</span>
    </button>
)

const CtaButton = ({
    children, onClick, disabled = false, type = 'button',
}: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; type?: 'button' | 'submit' }) => (
    <button
        type={type}
        onClick={onClick}
        disabled={disabled}
        className="w-full flex items-center justify-center gap-2 bg-[#f57f20] hover:bg-[#ff8f36] active:scale-[0.98] disabled:opacity-35 disabled:pointer-events-none text-white font-bold text-[14px] py-3.5 rounded-xl transition-all shadow-[0_4px_20px_rgba(245,127,32,0.25)] hover:shadow-[0_4px_28px_rgba(245,127,32,0.4)]"
    >
        {children}
    </button>
)

const FieldInput = ({
    label, ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) => (
    <div>
        <label className="block text-[11px] font-bold uppercase tracking-widest text-white/35 mb-1.5">
            {label}
        </label>
        <input
            {...props}
            className={`w-full bg-[#0d2035] border border-[#1e3448] hover:border-[#2a4a68] focus:border-[#f57f20]/70 focus:shadow-[0_0_0_3px_rgba(245,127,32,0.08)] rounded-xl px-4 py-3 text-white text-[14px] placeholder-white/20 outline-none transition-all ${props.className ?? ''}`}
        />
    </div>
)

// ─── main component ───────────────────────────────────────────────────────────

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

            if (!result) return // server-side redirect happened
            if ('error' in result) { setError(result.error); return }
            if ('requiresConfirmation' in result) goTo('confirm')
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
                        variants={variants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                    >

                        {/* ── Step 1: Meal Preference ── */}
                        {step === 1 && (
                            <div className="space-y-5">
                                <div>
                                    <p className="text-[#f57f20] text-[12px] font-bold uppercase tracking-widest mb-2">Meal Preference</p>
                                    <h1 className="text-[28px] sm:text-[32px] font-black text-white tracking-tight leading-tight">
                                        What are<br />you eating?
                                    </h1>
                                </div>
                                <div className="space-y-2.5">
                                    {PREFERENCES.map(p => (
                                        <SelectCard
                                            key={p.value}
                                            selected={form.preference === p.value}
                                            onClick={() => { set('preference', p.value); setTimeout(advance, 180) }}
                                            emoji={p.emoji} label={p.label} desc={p.desc}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* ── Step 1.5: Veg Days (Religious only) ── */}
                        {step === 1.5 && (
                            <div className="space-y-5">
                                <div>
                                    <p className="text-[#f57f20] text-[12px] font-bold uppercase tracking-widest mb-2">Halal Mix</p>
                                    <h1 className="text-[28px] sm:text-[32px] font-black text-white tracking-tight leading-tight">
                                        Which days<br />do you want veg?
                                    </h1>
                                    <p className="text-white/40 text-[13px] mt-2 leading-relaxed">
                                        Select the days you prefer vegetarian meals. Leave all unselected for fully non-veg.
                                    </p>
                                </div>

                                <div className="grid grid-cols-2 gap-2.5">
                                    {DAYS_OF_WEEK.map(day => (
                                        <PillCard
                                            key={day}
                                            selected={form.vegDays.includes(day)}
                                            onClick={() => toggleVegDay(day)}
                                            label={day}
                                        />
                                    ))}
                                </div>

                                {form.vegDays.length > 0 && (
                                    <motion.p
                                        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                        className="text-white/35 text-[12px] text-center"
                                    >
                                        {form.vegDays.length} veg day{form.vegDays.length > 1 ? 's' : ''} · {6 - form.vegDays.length} non-veg
                                    </motion.p>
                                )}

                                <CtaButton onClick={advance}>Continue →</CtaButton>
                            </div>
                        )}

                        {/* ── Step 2: Allergens ── */}
                        {step === 2 && (
                            <div className="space-y-5">
                                <div>
                                    <p className="text-[#f57f20] text-[12px] font-bold uppercase tracking-widest mb-2">Dietary Needs</p>
                                    <h1 className="text-[28px] sm:text-[32px] font-black text-white tracking-tight leading-tight">
                                        Any foods<br />to avoid?
                                    </h1>
                                    <p className="text-white/40 text-[13px] mt-2">Select all that apply. We take this seriously.</p>
                                </div>
                                <div className="grid grid-cols-2 gap-2.5">
                                    {ALLERGENS.map(a => (
                                        <PillCard key={a} selected={form.allergens.includes(a)} onClick={() => toggleAllergen(a)} label={a} />
                                    ))}
                                    <PillCard
                                        selected={form.allergens.includes('None')}
                                        onClick={() => toggleAllergen('None')}
                                        label="None — no allergies"
                                    />
                                </div>
                                <CtaButton onClick={advance}>Continue →</CtaButton>
                            </div>
                        )}

                        {/* ── Step 3: Spice Level ── */}
                        {step === 3 && (
                            <div className="space-y-5">
                                <div>
                                    <p className="text-[#f57f20] text-[12px] font-bold uppercase tracking-widest mb-2">Spice Level</p>
                                    <h1 className="text-[28px] sm:text-[32px] font-black text-white tracking-tight leading-tight">
                                        How much<br />heat?
                                    </h1>
                                    <p className="text-white/40 text-[13px] mt-2">We season every meal accordingly.</p>
                                </div>
                                <div className="space-y-2.5">
                                    {SPICE_LEVELS.map(s => (
                                        <SelectCard
                                            key={s.value}
                                            selected={form.spiceLevel === s.value}
                                            onClick={() => { set('spiceLevel', s.value); setTimeout(advance, 180) }}
                                            emoji={s.emoji} label={s.label} desc={s.desc}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* ── Step 4: Dorm ── */}
                        {step === 4 && (
                            <div className="space-y-5">
                                <div>
                                    <p className="text-[#f57f20] text-[12px] font-bold uppercase tracking-widest mb-2">Location</p>
                                    <h1 className="text-[28px] sm:text-[32px] font-black text-white tracking-tight leading-tight">
                                        Where should<br />we drop it?
                                    </h1>
                                </div>
                                <div className="grid grid-cols-2 gap-2.5">
                                    {DORMS.map(d => (
                                        <PillCard
                                            key={d}
                                            selected={form.dorm === d}
                                            onClick={() => { set('dorm', d); if (d !== 'Other') setTimeout(advance, 180) }}
                                            label={d}
                                        />
                                    ))}
                                </div>
                                <AnimatePresence>
                                    {form.dorm === 'Other' && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                                            className="space-y-3 overflow-hidden"
                                        >
                                            <FieldInput
                                                label="Dorm name"
                                                type="text"
                                                placeholder="Type your dorm name..."
                                                value={form.customDorm}
                                                onChange={e => set('customDorm', e.target.value)}
                                            />
                                            <CtaButton onClick={advance} disabled={!form.customDorm.trim()}>Continue →</CtaButton>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        )}

                        {/* ── Step 5: University ── */}
                        {step === 5 && (
                            <div className="space-y-5">
                                <div>
                                    <p className="text-[#f57f20] text-[12px] font-bold uppercase tracking-widest mb-2">University</p>
                                    <h1 className="text-[28px] sm:text-[32px] font-black text-white tracking-tight leading-tight">
                                        Where do<br />you study?
                                    </h1>
                                </div>
                                <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                                    {UNIVERSITIES.map(u => (
                                        <button
                                            key={u}
                                            onClick={() => { set('university', u); if (u !== 'Other') setTimeout(advance, 180) }}
                                            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-[13px] font-semibold transition-all duration-150 ${
                                                form.university === u
                                                    ? 'border-[#f57f20] bg-[#f57f20]/[0.06] text-white'
                                                    : 'border-[#1e3448] bg-[#0d2035] text-white/60 hover:border-[#2a4a68] hover:text-white/80'
                                            }`}
                                        >
                                            <span>{u}</span>
                                            {form.university === u && u !== 'Other' && <Check size={14} className="text-[#f57f20]" strokeWidth={2.5} />}
                                        </button>
                                    ))}
                                </div>
                                <AnimatePresence>
                                    {form.university === 'Other' && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                                            className="space-y-3 overflow-hidden"
                                        >
                                            <FieldInput
                                                label="University name"
                                                type="text"
                                                placeholder="Type your university..."
                                                value={form.customUniversity}
                                                onChange={e => set('customUniversity', e.target.value)}
                                            />
                                            <CtaButton onClick={advance} disabled={!form.customUniversity.trim()}>Continue →</CtaButton>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        )}

                        {/* ── Step 6: Name + WhatsApp ── */}
                        {step === 6 && (
                            <div className="space-y-5">
                                <div>
                                    <p className="text-[#f57f20] text-[12px] font-bold uppercase tracking-widest mb-2">About You</p>
                                    <h1 className="text-[28px] sm:text-[32px] font-black text-white tracking-tight leading-tight">
                                        Who are we<br />delivering to?
                                    </h1>
                                </div>
                                <div className="space-y-3">
                                    <FieldInput label="Full Name" type="text" placeholder="Your name" value={form.name} onChange={e => set('name', e.target.value)} />
                                    <FieldInput label="WhatsApp Number" type="tel" placeholder="+971 50 000 0000" value={form.phone} onChange={e => set('phone', e.target.value)} />
                                </div>
                                <CtaButton onClick={advance} disabled={!form.name.trim() || !form.phone.trim()}>Continue →</CtaButton>
                            </div>
                        )}

                        {/* ── Step 7: Email + Password ── */}
                        {step === 7 && (
                            <div className="space-y-5">
                                <div>
                                    <p className="text-[#f57f20] text-[12px] font-bold uppercase tracking-widest mb-2">Create Account</p>
                                    <h1 className="text-[28px] sm:text-[32px] font-black text-white tracking-tight leading-tight">
                                        You&apos;re<br />almost in.
                                    </h1>
                                    <p className="text-white/40 text-[13px] mt-2">Create your login to lock in your preferences.</p>
                                </div>
                                <div className="space-y-3">
                                    <FieldInput label="Email Address" type="email" placeholder="you@university.edu" value={form.email} onChange={e => set('email', e.target.value)} autoComplete="username" />
                                    <div>
                                        <label className="block text-[11px] font-bold uppercase tracking-widest text-white/35 mb-1.5">Password</label>
                                        <div className="relative">
                                            <input
                                                type={showPass ? 'text' : 'password'}
                                                placeholder="Min. 8 characters"
                                                value={form.password}
                                                onChange={e => set('password', e.target.value)}
                                                autoComplete="new-password"
                                                className="w-full bg-[#0d2035] border border-[#1e3448] hover:border-[#2a4a68] focus:border-[#f57f20]/70 focus:shadow-[0_0_0_3px_rgba(245,127,32,0.08)] rounded-xl px-4 py-3 pr-11 text-white text-[14px] placeholder-white/20 outline-none transition-all"
                                            />
                                            <button type="button" tabIndex={-1} onClick={() => setShowPass(v => !v)}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-white/25 hover:text-white/55 transition-colors">
                                                {showPass ? <EyeOff size={15} strokeWidth={2} /> : <Eye size={15} strokeWidth={2} />}
                                            </button>
                                        </div>
                                        <p className="text-white/25 text-[12px] mt-1.5">Use at least 8 characters.</p>
                                    </div>
                                </div>

                                <AnimatePresence>
                                    {error && (
                                        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                                            className="px-4 py-3 rounded-xl bg-red-500/[0.08] border border-red-500/[0.18] text-red-400 text-[13px] text-center">
                                            {error}
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                <button
                                    disabled={!form.email.trim() || form.password.length < 8 || isPending}
                                    onClick={handleCreate}
                                    className="w-full flex items-center justify-center gap-2.5 bg-[#f57f20] hover:bg-[#ff8f36] disabled:opacity-35 disabled:pointer-events-none text-white font-bold text-[14px] py-3.5 rounded-xl transition-all shadow-[0_4px_20px_rgba(245,127,32,0.25)]"
                                >
                                    {isPending ? (
                                        <><svg className="animate-spin h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Creating your account…</>
                                    ) : 'Create Account'}
                                </button>

                                <p className="text-center text-white/20 text-[11px]">
                                    By continuing you agree to our{' '}
                                    <Link href="/terms" className="underline hover:text-white/40 transition-colors">Terms</Link>{' '}and{' '}
                                    <Link href="/privacy" className="underline hover:text-white/40 transition-colors">Privacy Policy</Link>.
                                </p>
                            </div>
                        )}

                        {/* ── Confirm screen ── */}
                        {step === 'confirm' && (
                            <div className="flex flex-col items-center text-center gap-6 py-6">
                                <motion.div
                                    initial={{ scale: 0.6, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    transition={{ type: 'spring', stiffness: 280, damping: 20, delay: 0.1 }}
                                    className="relative"
                                >
                                    <div className="w-20 h-20 rounded-full bg-[#f57f20]/10 border border-[#f57f20]/20 flex items-center justify-center">
                                        <Mail size={32} className="text-[#f57f20]" strokeWidth={1.5} />
                                    </div>
                                    <motion.div
                                        className="absolute inset-0 rounded-full border border-[#f57f20]/25"
                                        animate={{ scale: [1, 1.5, 1.5], opacity: [0.5, 0, 0] }}
                                        transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
                                    />
                                </motion.div>

                                <div className="space-y-2">
                                    <h1 className="text-[30px] font-black text-white tracking-tight">Check your inbox.</h1>
                                    <p className="text-white/45 text-[14px] leading-relaxed max-w-[300px] mx-auto">
                                        We sent a confirmation link to{' '}
                                        <span className="text-white/80 font-semibold">{form.email}</span>.
                                        Click it to activate your account — you&apos;ll be logged in automatically.
                                    </p>
                                </div>

                                <div className="w-full bg-[#0d2035] border border-[#1e3448] rounded-2xl p-4 text-left space-y-2">
                                    {['📧 Check your spam folder if you don\'t see it.', '🔗 The link expires in 24 hours.', '✅ The link logs you in automatically — no password needed.'].map(t => (
                                        <p key={t} className="text-white/35 text-[13px]">{t}</p>
                                    ))}
                                </div>

                                <Link href="/login" className="text-white/30 hover:text-white/60 text-[13px] transition-colors">
                                    ← Back to Sign In
                                </Link>
                            </div>
                        )}

                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    )
}
