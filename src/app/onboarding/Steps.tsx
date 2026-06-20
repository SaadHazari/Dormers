'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Check } from 'lucide-react'
import { CtaButton, FieldInput, PillCard, SelectCard } from './primitives'
import { EmailStep } from './EmailStep'
import { PhoneStep } from './PhoneStep'
import { ALLERGENS, DAYS_OF_WEEK, PREFERENCES, SPICE_LEVELS, UNIVERSITIES, WEEK_TYPES, type FormState, type Step } from './data'
import { authTokens } from '@/ui-system/tokens/auth-theme'

interface Props {
    step: Step
    form: FormState
    set: <K extends keyof FormState>(key: K, value: FormState[K]) => void
    advance: () => void
    toggleAllergen: (item: string) => void
    toggleVegDay: (day: string) => void
    isLight: boolean
    dorms: string[]
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
    step, form, set, advance, toggleAllergen, toggleVegDay, isLight, dorms,
}: Props) {
    const tokens = authTokens(isLight)
    // Eyebrow stays orange in both modes (brand mark).
    const eyebrowCls = 'text-[#f57f20] text-[12px] font-bold uppercase tracking-widest mb-2'
    const headlineCls = `text-[28px] sm:text-[32px] font-black tracking-tight leading-tight ${tokens.heading}`
    const sublineCls = `text-[13px] mt-2 leading-relaxed ${tokens.subline}`
    const captionCls = `text-[12px] text-center ${tokens.subline}`

    return (
        <>
            {/* ── Step 1: Meal Preference ── */}
            {step === 1 && (
                <div className="space-y-5">
                    <div>
                        <p className={eyebrowCls}>Meal Preference</p>
                        <h1 className={headlineCls}>What are<br />you eating?</h1>
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

            {/* ── Step 1.25: Week type (everyone) — placed BEFORE veg-days
                  step so the religious-mix picker can cap its options at W-1
                  (4 of 5 for 5DAYS, 5 of 6 for 6DAYS). ── */}
            {step === 1.25 && (
                <div className="space-y-5">
                    <div>
                        <p className={eyebrowCls}>Delivery Days</p>
                        <h1 className={headlineCls}>How many<br />days a week?</h1>
                        <p className={sublineCls}>
                            Fewer delivery days = lower price. You can change this later for future plans.
                        </p>
                    </div>
                    <div className="space-y-2.5">
                        {WEEK_TYPES.map(w => (
                            <SelectCard
                                key={w.value}
                                selected={form.weekType === w.value}
                                onClick={() => { set('weekType', w.value); setTimeout(advance, 180) }}
                                emoji={w.emoji} label={w.label} desc={w.desc}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* ── Step 1.5: Veg Days (Religious only) ──
                Cap is W-1: 5DAYS allows max 4 veg days (1 non-veg minimum),
                6DAYS allows max 5. Picking all-veg is handled by switching the
                top-level meal preference to 'Veg', not by maxing this picker. */}
            {step === 1.5 && (() => {
                const W = form.weekType === '5DAYS' ? 5 : 6
                const visibleDays = DAYS_OF_WEEK.slice(0, W)         // Mon..Fri or Mon..Sat
                const maxVeg = W - 1                                   // can't pick all (defeats "mix")
                const sanitisedVeg = form.vegDays.filter(d => visibleDays.includes(d))
                const overCap = sanitisedVeg.length > maxVeg
                return (
                    <div className="space-y-5">
                        <div>
                            <p className={eyebrowCls}>Halal Mix</p>
                            <h1 className={headlineCls}>Which days<br />do you want veg?</h1>
                            <p className={sublineCls}>
                                Pick up to {maxVeg} day{maxVeg === 1 ? '' : 's'} (out of {W}) for vegetarian meals.
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-2.5">
                            {visibleDays.map(day => (
                                <PillCard
                                    key={day}
                                    selected={sanitisedVeg.includes(day)}
                                    onClick={() => {
                                        const isSelected = sanitisedVeg.includes(day)
                                        // Block adding past the cap; allow removing at any time.
                                        if (!isSelected && sanitisedVeg.length >= maxVeg) return
                                        toggleVegDay(day)
                                    }}
                                    label={day}
                                />
                            ))}
                        </div>

                        {sanitisedVeg.length > 0 && (
                            <motion.p
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                className={captionCls}
                            >
                                {`${sanitisedVeg.length} veg day${sanitisedVeg.length > 1 ? 's' : ''} · ${W - sanitisedVeg.length} non-veg`}
                            </motion.p>
                        )}

                        {overCap && (
                            <p className={`${captionCls} text-[#a36900]`}>
                                You can have at most {maxVeg} veg days for a {W}-day week. Switch to fully vegetarian on the previous step instead.
                            </p>
                        )}

                        <CtaButton onClick={advance} disabled={sanitisedVeg.length === 0 || overCap}>Continue →</CtaButton>
                    </div>
                )
            })()}

            {/* ── Step 2: Allergens ── */}
            {step === 2 && (
                <div className="space-y-5">
                    <div>
                        <p className={eyebrowCls}>Dietary Needs</p>
                        <h1 className={headlineCls}>Any foods<br />to avoid?</h1>
                        <p className={sublineCls}>Select all that apply. We take this seriously.</p>
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
                    <CtaButton onClick={advance} disabled={form.allergens.length === 0}>Continue →</CtaButton>
                </div>
            )}

            {/* ── Step 3: Spice Level ── */}
            {step === 3 && (
                <div className="space-y-5">
                    <div>
                        <p className={eyebrowCls}>Spice Level</p>
                        <h1 className={headlineCls}>How much<br />heat?</h1>
                        <p className={sublineCls}>We season every meal accordingly.</p>
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
                        <p className={eyebrowCls}>Location</p>
                        <h1 className={headlineCls}>Where should<br />we drop it?</h1>
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                        {dorms.map(d => (
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
                        <p className={eyebrowCls}>University</p>
                        <h1 className={headlineCls}>Where do<br />you study?</h1>
                    </div>
                    <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                        {UNIVERSITIES.map(u => (
                            <button
                                key={u}
                                onClick={() => { set('university', u); if (u !== 'Other') setTimeout(advance, 180) }}
                                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-[13px] font-semibold transition-all duration-150 ${
                                    form.university === u
                                        ? `${tokens.selectableSelected} ${isLight ? 'text-[#091825]' : 'text-white'}`
                                        : `${tokens.selectableUnselected} ${isLight ? 'text-[#091825]/65 hover:text-[#091825]' : 'text-white/65 hover:text-white'}`
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

            {/* Step 6: Name + WhatsApp + OTP verification.
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
