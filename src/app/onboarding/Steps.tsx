'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Check } from 'lucide-react'
import { CtaButton, FieldInput, PillCard, SelectCard } from './primitives'
import { EmailStep } from './EmailStep'
import { PhoneStep } from './PhoneStep'
import { ALLERGENS, DAYS_OF_WEEK, DORMS, PREFERENCES, SPICE_LEVELS, UNIVERSITIES, type FormState, type Step } from './data'

interface Props {
    step: Step
    form: FormState
    set: <K extends keyof FormState>(key: K, value: FormState[K]) => void
    advance: () => void
    toggleAllergen: (item: string) => void
    toggleVegDay: (day: string) => void
}

/**
 * Renders the step body for the current onboarding step. Owns no state —
 * everything flows down from <OnboardingPage>. Each step is a self-contained
 * branch keyed on `step`; the parent's <AnimatePresence> handles enter/exit.
 *
 * Step 6 (PhoneStep) and step 7 (EmailStep) own their own send/verify flow
 * internally, so they don't need handleCreate / error / isPending plumbing.
 */
export function OnboardingSteps({
    step, form, set, advance, toggleAllergen, toggleVegDay,
}: Props) {
    return (
        <>
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
                            className="text-white/55 text-[12px] text-center"
                        >
                            {form.vegDays.length === 6
                                ? 'All days vegetarian.'
                                : `${form.vegDays.length} veg day${form.vegDays.length > 1 ? 's' : ''} · ${6 - form.vegDays.length} non-veg`}
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

            {/* ── Step 6: Name + WhatsApp + OTP verification.
                  Owns its own flow internally (send / verify / advance). ── */}
            {step === 6 && (
                <PhoneStep form={form} set={set} advance={advance} />
            )}

            {/* ── Step 7: Email + Password + inline OTP verification.
                  Mirrors PhoneStep — one logical step, two phases. The previous
                  separate 'confirm' page split the verification microinteraction
                  across scenes; inline keeps trigger and feedback adjacent. ── */}
            {step === 7 && (
                <EmailStep form={form} set={set} />
            )}
        </>
    )
}
