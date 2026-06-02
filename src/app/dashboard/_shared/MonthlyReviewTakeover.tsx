'use client'

import { useEffect, useState, useTransition } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import {
    X, Clock, Check, ChevronLeft, Sparkles, Trophy, ArrowRight,
} from 'lucide-react'
import { BODY, OG, TIER_POP_TEXT } from './tokens'
import { Eyebrow } from './Eyebrow'
import {
    MONTHLY_REWARD_AED,
    MONTHLY_LATE_REWARD_AED,
    SIGNUP_TRIGGER_OPTIONS,
    JOB_OPTIONS,
    ALTERNATIVE_OPTIONS,
    ALTERNATIVE_COST_OPTIONS,
    wrapVocabFor,
    type AlternativeCostAed,
    type MonthlyReviewPayload,
    type MonthlyReviewSubmitResult,
    type MonthlyRevealStats,
    type RecommendAnswer,
    type RenewalIntent,
    type WrapPlanTier,
} from '@/contexts/subscriptions/domain/monthly-review'

const TOTAL_STEPS = 8 // Screens 1-8 (Q1-Q7 + opening); reveal is post-submit
const DRAFT_KEY = 'dormers:monthly-review:draft:v1'

export interface MonthlyReviewTakeoverProps {
    userName: string
    /** Cycle label — "April cycle" for monthly, "the week of Apr 14" for weekly, "your trial" for trial. */
    cycleLabel: string
    /** Days remaining in the 7-day full-reward window. ≤0 → late. */
    daysLeftForFullReward: number
    /** Plan tier — drives the form's qualifier/period vocab so a weekly customer
     *  doesn't see "monthly" on the opening screen, a trial doesn't see "month", etc. */
    planTier: WrapPlanTier
    onSubmit: (payload: MonthlyReviewPayload) => Promise<MonthlyReviewSubmitResult>
    onClose: () => void
}

export function MonthlyReviewTakeover({
    userName,
    cycleLabel,
    daysLeftForFullReward,
    planTier,
    onSubmit,
    onClose,
}: MonthlyReviewTakeoverProps) {
    const vocab = wrapVocabFor(planTier)
    // Trial = a single meal. It gets its own short flow (opening + 3 questions)
    // instead of the monthly/weekly retrospective (opening + 7), because a
    // one-meal customer has no breadth to reflect on — the wrap's job here is to
    // capture a first impression and convert to a paid plan, not recap a cycle.
    const isTrial = planTier === 'trial'
    const totalSteps = isTrial ? 4 : TOTAL_STEPS
    const [step, setStep] = useState(0) // 0 = opening, then questions
    const [reveal, setReveal] = useState<{ rewardPct: 50 | 100; stats: MonthlyRevealStats } | null>(null)
    const [isSubmitting, startSubmitting] = useTransition()
    const [submitError, setSubmitError] = useState<string | null>(null)

    // Form state — all fields the schema cares about.
    const [signupTriggers, setSignupTriggers] = useState<string[]>([])
    const [signupTriggersOther, setSignupTriggersOther] = useState('')
    const [jobs, setJobs] = useState<string[]>([])
    const [jobsOther, setJobsOther] = useState('')
    const [bestMoment, setBestMoment] = useState('')
    const [frictionMoment, setFrictionMoment] = useState('')
    const [alternative, setAlternative] = useState<string>('')
    const [alternativeOther, setAlternativeOther] = useState('')
    const [alternativeCostAed, setAlternativeCostAed] = useState<AlternativeCostAed | ''>('')
    const [renewalIntent, setRenewalIntent] = useState<RenewalIntent | ''>('')
    const [renewalReason, setRenewalReason] = useState('')
    const [recommend, setRecommend] = useState<RecommendAnswer | ''>('')
    const [recommendText, setRecommendText] = useState('')

    const isLate = daysLeftForFullReward <= 0
    const isReveal = reveal !== null
    const barPct = isReveal ? 100 : (step / totalSteps) * 100

    // ── Draft persistence ───────────────────────────────────────────────────
    // Save/restore in-progress answers to localStorage so closing the takeover
    // (intentional "Save & continue later", or accidentally hitting back/refresh)
    // doesn't wipe the user's work. Keyed by cycleLabel so a new cycle gets a
    // fresh slate.

    // Restore on mount (only once).
    useEffect(() => {
        if (typeof window === 'undefined') return
        try {
            const raw = window.localStorage.getItem(DRAFT_KEY)
            if (!raw) return
            const d = JSON.parse(raw) as Record<string, unknown>
            if (d.cycleLabel !== cycleLabel) return // different cycle — ignore old draft
            if (typeof d.step === 'number') setStep(Math.max(0, Math.min(totalSteps - 1, d.step)))
            if (Array.isArray(d.signupTriggers)) setSignupTriggers(d.signupTriggers as string[])
            if (typeof d.signupTriggersOther === 'string') setSignupTriggersOther(d.signupTriggersOther)
            if (Array.isArray(d.jobs)) setJobs(d.jobs as string[])
            if (typeof d.jobsOther === 'string') setJobsOther(d.jobsOther)
            if (typeof d.bestMoment === 'string') setBestMoment(d.bestMoment)
            if (typeof d.frictionMoment === 'string') setFrictionMoment(d.frictionMoment)
            if (typeof d.alternative === 'string') setAlternative(d.alternative)
            if (typeof d.alternativeOther === 'string') setAlternativeOther(d.alternativeOther)
            if (typeof d.alternativeCostAed === 'string') setAlternativeCostAed(d.alternativeCostAed as AlternativeCostAed)
            if (typeof d.renewalIntent === 'string') setRenewalIntent(d.renewalIntent as RenewalIntent)
            if (typeof d.renewalReason === 'string') setRenewalReason(d.renewalReason)
            if (typeof d.recommend === 'string') setRecommend(d.recommend as RecommendAnswer)
            if (typeof d.recommendText === 'string') setRecommendText(d.recommendText)
        } catch {
            // Corrupt draft — ignore.
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Save on change (debounced).
    useEffect(() => {
        if (typeof window === 'undefined') return
        if (isReveal) return // already submitted — nothing left to draft
        const t = setTimeout(() => {
            try {
                window.localStorage.setItem(DRAFT_KEY, JSON.stringify({
                    cycleLabel,
                    step,
                    signupTriggers, signupTriggersOther,
                    jobs, jobsOther,
                    bestMoment, frictionMoment,
                    alternative, alternativeOther, alternativeCostAed,
                    renewalIntent, renewalReason,
                    recommend, recommendText,
                }))
            } catch {
                // Quota or storage disabled — silently skip.
            }
        }, 250)
        return () => clearTimeout(t)
    }, [
        cycleLabel, step,
        signupTriggers, signupTriggersOther,
        jobs, jobsOther,
        bestMoment, frictionMoment,
        alternative, alternativeOther, alternativeCostAed,
        renewalIntent, renewalReason,
        recommend, recommendText,
        isReveal,
    ])

    const next = () => setStep((s) => s + 1)
    const back = () => setStep((s) => Math.max(0, s - 1))

    const toggleInArr = (arr: string[], setArr: (a: string[]) => void) => (id: string) => {
        setArr(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id])
    }

    const handleSubmit = () => {
        // Trial asks 3 questions (baseline + meal + subscribe-intent) and skips
        // the recommend screen — so derive `recommend` from the intent to keep
        // the payload schema satisfied without a fourth question.
        if (isTrial) {
            if (!alternative || !alternativeCostAed || !renewalIntent) return
        } else {
            if (!alternative || !alternativeCostAed || !renewalIntent || !recommend) return
        }
        const effectiveRecommend: RecommendAnswer = isTrial
            ? ((renewalIntent === 'definitely' || renewalIntent === 'probably') ? 'yes_general' : 'no')
            : (recommend as RecommendAnswer)
        setSubmitError(null)
        startSubmitting(async () => {
            const result = await onSubmit({
                signupTriggers,
                signupTriggersOther,
                jobs,
                jobsOther,
                bestMoment,
                frictionMoment,
                alternative,
                alternativeOther,
                alternativeCostAed: alternativeCostAed as AlternativeCostAed,
                renewalIntent: renewalIntent as RenewalIntent,
                renewalReason,
                recommend: effectiveRecommend,
                recommendText,
            })
            if (result.ok) {
                try { window.localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ }
                setReveal({ rewardPct: result.rewardPct, stats: result.revealStats })
            } else {
                setSubmitError(result.error)
            }
        })
    }

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            // Layered atmospheric backdrop — warm glow top-right, secondary
            // hint bottom-left, navy gradient base. Breaks the flat slab of
            // dark blue into a lit room.
            background: `
                radial-gradient(ellipse 90% 60% at 92% -8%, rgba(245,127,32,0.11) 0%, transparent 55%),
                radial-gradient(ellipse 70% 50% at 8% 108%, rgba(255,170,0,0.07) 0%, transparent 55%),
                linear-gradient(135deg, #1c4255 0%, #0a1c2a 55%, #061421 100%)
            `,
            display: 'flex',
            flexDirection: 'column',
            fontFamily: BODY,
            color: TIER_POP_TEXT.primary,
            overflow: 'auto',
        }}>
            {/* Progress bar */}
            <div style={{ height: 3, background: 'rgba(245,240,232,0.10)', position: 'relative', overflow: 'hidden' }}>
                <div style={{
                    position: 'absolute',
                    inset: 0,
                    width: `${barPct}%`,
                    background: `linear-gradient(90deg, ${OG} 0%, #ffaa00 100%)`,
                    transition: 'width 500ms cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: '0 0 16px rgba(245,127,32,0.7)',
                }} />
            </div>

            {/* Header */}
            <header style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '20px clamp(20px, 4vw, 48px)', gap: 12,
            }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    {step > 0 && !isReveal && (
                        <button
                            aria-label="Back"
                            onClick={back}
                            disabled={isSubmitting}
                            style={{
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                width: 32, height: 32,
                                borderRadius: 'var(--radius-pill)',
                                border: '1px solid rgba(245,240,232,0.14)',
                                background: 'rgba(245,240,232,0.04)',
                                color: TIER_POP_TEXT.muted,
                                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                            }}
                        >
                            <ChevronLeft size={16} strokeWidth={2.2} />
                        </button>
                    )}

                    {!isReveal && step > 0 && (
                        <span style={{
                            fontSize: 11, fontWeight: 700,
                            letterSpacing: '0.18em', textTransform: 'uppercase',
                            color: TIER_POP_TEXT.muted,
                            fontFeatureSettings: '"tnum"',
                        }}>
                            {step} / {totalSteps - 1}
                        </span>
                    )}

                    {!isReveal && (
                        <div
                            title={isLate
                                ? 'Submitted after the 7-day window. 50% Dorm Wars reward instead of 100%.'
                                : `Submit within 7 days of ${vocab.period} end for 100% Dorm Wars reward. After that, 50%.`}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                padding: '6px 12px',
                                borderRadius: 'var(--radius-pill)',
                                background: isLate
                                    ? 'rgba(245,240,232,0.08)'
                                    : 'linear-gradient(135deg, rgba(245,127,32,0.18) 0%, rgba(255,170,0,0.14) 100%)',
                                border: `1px solid ${isLate ? 'rgba(245,240,232,0.18)' : 'rgba(245,127,32,0.45)'}`,
                                color: isLate ? TIER_POP_TEXT.muted : '#ffc66b',
                                fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
                                cursor: 'help',
                            }}
                        >
                            <Clock size={12} strokeWidth={2.4} />
                            {isLate
                                ? <>Late · 50% reward</>
                                : daysLeftForFullReward === 0
                                    ? <>Last day for full reward</>
                                    : <>{daysLeftForFullReward}d left for full reward</>}
                        </div>
                    )}
                </div>

                <button
                    aria-label="Close"
                    onClick={onClose}
                    disabled={isSubmitting}
                    style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 36, height: 36,
                        borderRadius: 'var(--radius-pill)',
                        border: '1px solid rgba(245,240,232,0.14)',
                        background: 'rgba(245,240,232,0.06)',
                        color: TIER_POP_TEXT.muted,
                        cursor: isSubmitting ? 'not-allowed' : 'pointer',
                    }}
                >
                    <X size={16} strokeWidth={2.2} />
                </button>
            </header>

            {/* Main */}
            <main style={{
                flex: 1,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                padding: '32px clamp(20px, 4vw, 48px) 16px',
            }}>
                {/* Screen 0 — Opening */}
                {step === 0 && !isReveal && (
                    <div style={SCREEN}>
                        <Eyebrow color={TIER_POP_TEXT.muted}>{cycleLabel} · {vocab.qualifier} wrap</Eyebrow>
                        <H1>{userName}, your <Accent>Dormers</Accent> {vocab.period}.</H1>
                        <Sub>
                            {vocab.period === 'meal'
                                ? <>Two minutes to wrap your trial. We&rsquo;ll show you how it went and what&rsquo;s next.</>
                                : <>Three minutes to wrap your {vocab.period}. We&rsquo;ll show you your meal report at the end.</>}
                        </Sub>
                        <ContinueButton enabled onClick={next} label="Start" />
                    </div>
                )}

                {/* ── Trial flow (single meal): 3 questions ─────────────────── */}
                {/* Trial Q1 — baseline: what dinners looked like before Dormers + cost.
                    Mom-Test gold: anchors on real past behaviour, not a hypothetical,
                    and surfaces the value contrast that powers the conversion close. */}
                {isTrial && step === 1 && !isReveal && (
                    <div style={SCREEN}>
                        <Eyebrow color={TIER_POP_TEXT.muted}>Before tonight</Eyebrow>
                        <H1>Before this, what were your dinners <Accent>usually</Accent>?</H1>
                        <Sub>Pick the closest — just the honest baseline.</Sub>
                        <ChipGrid
                            options={ALTERNATIVE_OPTIONS}
                            selected={alternative ? [alternative] : []}
                            onToggle={(id) => setAlternative(alternative === id ? '' : id)}
                        />
                        <OtherTextRow
                            value={alternativeOther}
                            setValue={setAlternativeOther}
                            placeholder="Something else? Tell us..."
                        />
                        <div style={{ marginTop: 40, paddingTop: 28, borderTop: '1px solid rgba(245,240,232,0.10)' }}>
                            <Eyebrow color={TIER_POP_TEXT.muted}>And the cost</Eyebrow>
                            <H2>What did that run you on a typical night?</H2>
                            <ChipGrid
                                options={ALTERNATIVE_COST_OPTIONS.map((c) => ({ id: c.id, label: c.label }))}
                                selected={alternativeCostAed ? [alternativeCostAed] : []}
                                onToggle={(id) => setAlternativeCostAed(alternativeCostAed === id ? '' : id as AlternativeCostAed)}
                            />
                        </div>
                        <ContinueButton enabled={!!alternative && !!alternativeCostAed} onClick={next} label="Continue" />
                    </div>
                )}

                {/* Trial Q2 — the meal itself. Framed to invite the negative
                    (Mom-Test: asking "what was off" beats "did you like it", which
                    always gets a polite yes). Optional. */}
                {isTrial && step === 2 && !isReveal && (
                    <div style={SCREEN}>
                        <Eyebrow color={TIER_POP_TEXT.muted}>Tonight&rsquo;s meal</Eyebrow>
                        <H1>How was it &mdash; <Accent>honestly</Accent>?</H1>
                        <Sub>Most useful if you tell us what was off. That&rsquo;s how the kitchen gets better.</Sub>
                        <BigTextarea
                            value={frictionMoment}
                            setValue={setFrictionMoment}
                            placeholder="Portion felt small · a touch too spicy · arrived later than I expected · honestly it was great — anything."
                        />
                        <ContinueButton
                            enabled
                            onClick={next}
                            label={frictionMoment ? 'Continue' : 'Nothing to flag — continue'}
                            muted={!frictionMoment}
                        />
                    </div>
                )}

                {/* Trial Q3 — the decision, as a real read (not a hypothetical
                    "would you?"). The negative path captures the single most
                    valuable trial signal: the actual objection. Submits the wrap. */}
                {isTrial && step === 3 && !isReveal && (
                    <div style={SCREEN_NARROW}>
                        <Eyebrow color={TIER_POP_TEXT.muted}>What&rsquo;s next</Eyebrow>
                        <H1>Want dinner <Accent>handled</Accent> for the month?</H1>
                        <Sub>Just an honest read — you pick the actual plan on the next screen.</Sub>
                        <VerticalButtonStack
                            options={[
                                { id: 'definitely',   label: 'Yes — I’m in',  tone: 'positive' },
                                { id: 'probably',     label: 'Probably',          tone: 'neutral' },
                                { id: 'probably_not', label: 'Probably not',      tone: 'caution' },
                                { id: 'no',           label: 'Not for me',        tone: 'negative' },
                            ]}
                            selected={renewalIntent}
                            onSelect={(id) => setRenewalIntent(id as RenewalIntent)}
                        />
                        {(renewalIntent === 'probably_not' || renewalIntent === 'no') && (
                            <BigTextarea
                                value={renewalReason}
                                setValue={setRenewalReason}
                                placeholder="What&rsquo;s holding you back? This is the most useful thing you can tell us."
                            />
                        )}

                        {submitError && (
                            <div style={{
                                marginTop: 20,
                                padding: '10px 16px',
                                borderRadius: 'var(--radius-md)',
                                background: 'rgba(239,68,68,0.10)',
                                border: '1px solid rgba(239,68,68,0.35)',
                                color: '#fca5a5',
                                fontSize: 13, fontWeight: 600,
                                lineHeight: 1.5,
                            }}>
                                {submitError}
                            </div>
                        )}

                        <ContinueButton
                            enabled={!!renewalIntent && !isSubmitting}
                            onClick={handleSubmit}
                            label={isSubmitting
                                ? 'Submitting...'
                                : `See your meal wrap · +AED ${isLate ? MONTHLY_LATE_REWARD_AED : MONTHLY_REWARD_AED}`}
                        />
                    </div>
                )}

                {/* Screen 1 — Q1: What got you to Dormers? */}
                {!isTrial && step === 1 && !isReveal && (
                    <div style={SCREEN_WIDE}>
                        <Eyebrow color={TIER_POP_TEXT.muted}>Where it started</Eyebrow>
                        <H1>What got you to try Dormers?</H1>
                        <Sub>Pick all that apply — there&rsquo;s no wrong answer.</Sub>
                        <ChipGrid
                            options={SIGNUP_TRIGGER_OPTIONS}
                            selected={signupTriggers}
                            onToggle={toggleInArr(signupTriggers, setSignupTriggers)}
                        />
                        <OtherTextRow
                            value={signupTriggersOther}
                            setValue={setSignupTriggersOther}
                            placeholder="Something else? Tell us..."
                        />
                        <ContinueButton enabled onClick={next} label={signupTriggers.length === 0 && !signupTriggersOther ? 'Skip' : 'Continue'} muted={signupTriggers.length === 0 && !signupTriggersOther} />
                    </div>
                )}

                {/* Screen 2 — Q2: What did Dormers do for you? */}
                {!isTrial && step === 2 && !isReveal && (
                    <div style={SCREEN_WIDE}>
                        <Eyebrow color={TIER_POP_TEXT.muted}>What it did for you</Eyebrow>
                        <H1>What did Dormers do for you?</H1>
                        <Sub>Tap all that fit your past {vocab.period}.</Sub>
                        <ChipGrid
                            options={JOB_OPTIONS}
                            selected={jobs}
                            onToggle={toggleInArr(jobs, setJobs)}
                        />
                        <OtherTextRow
                            value={jobsOther}
                            setValue={setJobsOther}
                            placeholder="Something else? Tell us..."
                        />
                        <ContinueButton enabled onClick={next} label={jobs.length === 0 && !jobsOther ? 'Skip' : 'Continue'} muted={jobs.length === 0 && !jobsOther} />
                    </div>
                )}

                {/* Screen 3 — Q3: best moment */}
                {!isTrial && step === 3 && !isReveal && (
                    <div style={SCREEN}>
                        <Eyebrow color={TIER_POP_TEXT.muted}>Your highlight</Eyebrow>
                        <H1>Tell us about a meal moment that <Accent>worked</Accent>.</H1>
                        <Sub>What was going on? Why did Dormers fit?</Sub>
                        <BigTextarea
                            value={bestMoment}
                            setValue={setBestMoment}
                            placeholder="Last Tuesday — coming home late and the curry was ready. Honestly saved me from another shawarma run."
                        />
                        <ContinueButton enabled onClick={next} label={bestMoment ? 'Continue' : 'No notes — continue'} muted={!bestMoment} />
                    </div>
                )}

                {/* Screen 4 — Q4: friction moment */}
                {!isTrial && step === 4 && !isReveal && (
                    <div style={SCREEN}>
                        <Eyebrow color={TIER_POP_TEXT.muted}>Where we missed</Eyebrow>
                        <H1>And one that <Accent>didn&rsquo;t quite land</Accent>?</H1>
                        <Sub>We learn from these. What happened?</Sub>
                        <BigTextarea
                            value={frictionMoment}
                            setValue={setFrictionMoment}
                            placeholder="The Wednesday curry was too spicy for me. Gave it to my roommate and ordered shawarma instead."
                        />
                        <ContinueButton enabled onClick={next} label={frictionMoment ? 'Continue' : 'No notes — continue'} muted={!frictionMoment} />
                    </div>
                )}

                {/* Screen 5 — Q5: counterfactual + cost */}
                {!isTrial && step === 5 && !isReveal && (
                    <div style={SCREEN}>
                        <Eyebrow color={TIER_POP_TEXT.muted}>Without us</Eyebrow>
                        <H1>If Dormers weren&rsquo;t an option, what would you have eaten?</H1>
                        <Sub>Pick the closest answer.</Sub>
                        <ChipGrid
                            options={ALTERNATIVE_OPTIONS}
                            selected={alternative ? [alternative] : []}
                            onToggle={(id) => setAlternative(alternative === id ? '' : id)}
                        />
                        <OtherTextRow
                            value={alternativeOther}
                            setValue={setAlternativeOther}
                            placeholder="Something else? Tell us..."
                        />

                        <div style={{
                            marginTop: 40,
                            paddingTop: 28,
                            borderTop: '1px solid rgba(245,240,232,0.10)',
                        }}>
                            <Eyebrow color={TIER_POP_TEXT.muted}>And the cost</Eyebrow>
                            <H2>What did that typically cost you per dinner?</H2>
                            <ChipGrid
                                options={ALTERNATIVE_COST_OPTIONS.map((c) => ({ id: c.id, label: c.label }))}
                                selected={alternativeCostAed ? [alternativeCostAed] : []}
                                onToggle={(id) => setAlternativeCostAed(alternativeCostAed === id ? '' : id as AlternativeCostAed)}
                            />
                        </div>

                        <ContinueButton
                            enabled={!!alternative && !!alternativeCostAed}
                            onClick={next}
                            label="Continue"
                        />
                    </div>
                )}

                {/* Screen 6 — Q6: renewal intent */}
                {!isTrial && step === 6 && !isReveal && (
                    <div style={SCREEN_NARROW}>
                        <Eyebrow color={TIER_POP_TEXT.muted}>What&rsquo;s next</Eyebrow>
                        <H1>Will you renew?</H1>
                        <Sub>Just an honest read — no commitment yet.</Sub>
                        <VerticalButtonStack
                            options={[
                                { id: 'definitely',   label: 'Definitely yes', tone: 'positive' },
                                { id: 'probably',     label: 'Probably',       tone: 'neutral' },
                                { id: 'probably_not', label: 'Probably not',   tone: 'caution' },
                                { id: 'no',           label: 'No',             tone: 'negative' },
                            ]}
                            selected={renewalIntent}
                            onSelect={(id) => setRenewalIntent(id as RenewalIntent)}
                        />
                        {(renewalIntent === 'probably_not' || renewalIntent === 'no') && (
                            <BigTextarea
                                value={renewalReason}
                                setValue={setRenewalReason}
                                placeholder="What&rsquo;s the main reason? We read every one."
                            />
                        )}
                        {(renewalIntent === 'definitely' || renewalIntent === 'probably') && (
                            <BigTextarea
                                value={renewalReason}
                                setValue={setRenewalReason}
                                placeholder="What would make you cancel later?"
                            />
                        )}
                        <ContinueButton enabled={!!renewalIntent} onClick={next} label="Continue" />
                    </div>
                )}

                {/* Screen 7 — Q7: recommend + open mic + submit */}
                {!isTrial && step === 7 && !isReveal && (
                    <div style={SCREEN_NARROW}>
                        <Eyebrow color={TIER_POP_TEXT.muted}>Last word</Eyebrow>
                        <H1>Would you recommend Dormers?</H1>
                        <Sub>If yes, tell us who you&rsquo;d tell.</Sub>
                        <VerticalButtonStack
                            options={[
                                { id: 'yes_specific', label: 'Yes — to someone specific', tone: 'positive' },
                                { id: 'yes_general',  label: 'Yes, generally',            tone: 'positive' },
                                { id: 'maybe',        label: 'Maybe',                    tone: 'neutral' },
                                { id: 'no',           label: 'No',                       tone: 'negative' },
                            ]}
                            selected={recommend}
                            onSelect={(id) => setRecommend(id as RecommendAnswer)}
                        />
                        {(recommend === 'yes_specific' || recommend === 'yes_general') && (
                            <BigTextarea
                                value={recommendText}
                                setValue={setRecommendText}
                                placeholder="Who? What would you tell them?"
                            />
                        )}
                        {recommend === 'maybe' || recommend === 'no'
                            ? (
                                <BigTextarea
                                    value={recommendText}
                                    setValue={setRecommendText}
                                    placeholder="Optional — anything else you want the kitchen team to know?"
                                />
                            )
                            : null}

                        {submitError && (
                            <div style={{
                                marginTop: 20,
                                padding: '10px 16px',
                                borderRadius: 'var(--radius-md)',
                                background: 'rgba(239,68,68,0.10)',
                                border: '1px solid rgba(239,68,68,0.35)',
                                color: '#fca5a5',
                                fontSize: 13, fontWeight: 600,
                                lineHeight: 1.5,
                            }}>
                                {submitError}
                            </div>
                        )}

                        <ContinueButton
                            enabled={!!recommend && !isSubmitting}
                            onClick={handleSubmit}
                            label={isSubmitting
                                ? 'Submitting...'
                                : `Submit · See your wrap · +AED ${isLate ? MONTHLY_LATE_REWARD_AED : MONTHLY_REWARD_AED}`}
                        />
                    </div>
                )}

                {/* Reveal screen */}
                {isReveal && reveal && (
                    <RevealScreen
                        userName={userName}
                        rewardPct={reveal.rewardPct}
                        stats={reveal.stats}
                        planTier={planTier}
                        onClose={onClose}
                    />
                )}
            </main>

            {!isReveal && (
                <footer style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', gap: 16 }}>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'transparent', border: 0, cursor: 'pointer',
                            fontFamily: BODY, fontSize: 12, fontWeight: 600,
                            letterSpacing: '0.06em', textTransform: 'uppercase',
                            color: TIER_POP_TEXT.faint,
                            padding: '8px 12px',
                        }}
                    >
                        Save & continue later
                    </button>
                </footer>
            )}
        </div>
    )
}

// ── Reveal screen — the signature moment ────────────────────────────────────

function RevealScreen({
    userName,
    rewardPct,
    stats,
    planTier,
    onClose,
}: {
    userName: string
    rewardPct: 50 | 100
    stats: MonthlyRevealStats
    planTier: WrapPlanTier
    onClose: () => void
}) {
    const vocab = wrapVocabFor(planTier)
    const router = useRouter()
    const isTrial = planTier === 'trial'
    // Tier-aware next-trigger destination: trial users haven't chosen a plan yet,
    // so the most meaningful next action is the plan picker. Returning customers
    // go straight to the next cycle's menu.
    const nextHref = isTrial ? '/dashboard/plan' : '/dashboard/menu'
    const nextLabel = isTrial ? 'Pick your plan' : "See what's cooking next"
    return (
        <div style={SCREEN_REVEAL}>
            <div style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 64, height: 64, borderRadius: '50%',
                background: `linear-gradient(135deg, ${OG} 0%, #ffaa00 100%)`,
                boxShadow: '0 12px 40px rgba(245,127,32,0.55)',
                marginBottom: 24,
            }}>
                <Sparkles size={28} strokeWidth={2} color="#fff" />
            </div>

            <Eyebrow color={TIER_POP_TEXT.muted}>{stats.cycleLabel}</Eyebrow>
            <H1>{userName}, your <Accent>wrap</Accent> is ready.</H1>
            <Sub>Here&rsquo;s the {vocab.period}, the way it actually happened.</Sub>

            {/* Stat grid */}
            <div style={{
                marginTop: 32,
                padding: '28px 24px',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(245,240,232,0.04)',
                border: '1px solid rgba(245,240,232,0.10)',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 28,
            }}>
                <StatBlock
                    label="Meals delivered"
                    value={`${stats.mealsDelivered}`}
                    suffix={stats.mealsTotal > 0 ? `of ${stats.mealsTotal}` : ''}
                />
                <StatBlock
                    label="Reviews submitted"
                    value={`${stats.weeklyReviewsSubmitted + 1}`}
                    suffix={`of ${(stats.weeklyReviewsTotal || stats.weeklyReviewsSubmitted) + 1}`}
                />
                <StatBlock
                    label="Dorm Wars earned"
                    value={`AED ${stats.aedEarnedThisCycle + (rewardPct === 100 ? MONTHLY_REWARD_AED : MONTHLY_LATE_REWARD_AED)}`}
                    suffix={`this ${vocab.period}`}
                />
                {stats.favoriteDish && (
                    <StatBlock
                        label="Your top pick"
                        value={stats.favoriteDish.name}
                        suffix={stats.favoriteSocialProofPct !== null
                            ? `Loved by ${stats.favoriteSocialProofPct}% of Dormers`
                            : ''}
                        image={stats.favoriteDish.image}
                    />
                )}
                {stats.topWeek !== null && (
                    <StatBlock
                        label="Your top week"
                        value={`Week ${stats.topWeek}`}
                        suffix="highest rating"
                    />
                )}
            </div>

            <div style={{ marginTop: 24, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 10,
                    padding: '12px 18px',
                    borderRadius: 'var(--radius-pill)',
                    background: 'linear-gradient(135deg, rgba(245,127,32,0.18) 0%, rgba(255,170,0,0.14) 100%)',
                    border: '1px solid rgba(245,127,32,0.45)',
                    color: '#ffc66b',
                    fontSize: 12, fontWeight: 700,
                    letterSpacing: '0.06em', textTransform: 'uppercase',
                }}>
                    <Trophy size={14} strokeWidth={2.4} />
                    {rewardPct}% Dorm Wars credit earned
                </div>
            </div>

            {/* Trial conversion close — the offer, framed as the natural next
                step. The 5% welcome rate is real (applied at checkout for the
                first monthly plan); the AED reward is shown separately, not
                folded in. No invented prices — the plan picker shows live rates. */}
            {isTrial && (
                <div style={{
                    marginTop: 28,
                    padding: '18px 20px',
                    borderRadius: 'var(--radius-md)',
                    background: 'linear-gradient(135deg, rgba(245,127,32,0.12) 0%, rgba(255,170,0,0.07) 100%)',
                    border: '1px solid rgba(245,127,32,0.32)',
                }}>
                    <div style={{
                        fontSize: 11, fontWeight: 700, letterSpacing: '0.16em',
                        textTransform: 'uppercase', color: '#ffc66b', marginBottom: 8,
                    }}>
                        Your welcome rate
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: TIER_POP_TEXT.primary, lineHeight: 1.4 }}>
                        Your first monthly plan comes with <Accent>5% off</Accent>.
                    </div>
                    <div style={{ marginTop: 6, fontSize: 13, color: TIER_POP_TEXT.muted, lineHeight: 1.5 }}>
                        Plus the AED {MONTHLY_REWARD_AED} you just earned — yours to keep. Weekly plans
                        don&rsquo;t carry the welcome rate, so monthly&rsquo;s the smart pick.
                    </div>
                </div>
            )}

            <div style={{ marginTop: 32, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <button
                    onClick={() => { onClose(); router.push(nextHref) }}
                    style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                        padding: '14px 28px',
                        borderRadius: 'var(--radius-pill)',
                        border: 0,
                        background: OG,
                        color: '#fff',
                        fontFamily: BODY,
                        fontSize: 13, fontWeight: 700,
                        letterSpacing: '0.06em', textTransform: 'uppercase',
                        cursor: 'pointer',
                        boxShadow: '0 8px 28px rgba(245,127,32,0.50)',
                    }}
                >
                    {nextLabel}
                    <ArrowRight size={14} strokeWidth={2.4} />
                </button>
                <button
                    onClick={onClose}
                    style={{
                        background: 'transparent', border: 0, cursor: 'pointer',
                        fontFamily: BODY, fontSize: 12, fontWeight: 600,
                        letterSpacing: '0.06em', textTransform: 'uppercase',
                        color: TIER_POP_TEXT.faint,
                        padding: '8px 12px',
                    }}
                >
                    Back to dashboard
                </button>
            </div>
        </div>
    )
}

function StatBlock({
    label,
    value,
    suffix,
    image,
}: {
    label: string
    value: string
    suffix?: string
    image?: string
}) {
    return (
        <div>
            <div style={{
                fontSize: 11, fontWeight: 700,
                letterSpacing: '0.18em', textTransform: 'uppercase',
                color: TIER_POP_TEXT.muted,
                marginBottom: 12,
            }}>
                {label}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {image && (
                    <div style={{
                        width: 48, height: 48,
                        borderRadius: 12,
                        overflow: 'hidden',
                        position: 'relative',
                        flexShrink: 0,
                    }}>
                        <Image src={image} alt={value} fill style={{ objectFit: 'cover' }} />
                    </div>
                )}
                <div>
                    <div style={{
                        fontSize: 'clamp(24px, 2.6vw, 30px)',
                        fontWeight: 800,
                        color: TIER_POP_TEXT.primary,
                        letterSpacing: '-0.025em',
                        lineHeight: 1.1,
                    }}>
                        {value}
                    </div>
                    {suffix && (
                        <div style={{
                            marginTop: 6,
                            fontSize: 13, color: TIER_POP_TEXT.muted,
                            lineHeight: 1.45,
                        }}>
                            {suffix}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

// ── Vertical button stack (Q6 + Q7 commitment questions) ────────────────────

type ButtonTone = 'positive' | 'neutral' | 'caution' | 'negative'

function VerticalButtonStack({
    options,
    selected,
    onSelect,
}: {
    options: Array<{ id: string; label: string; tone: ButtonTone }>
    selected: string
    onSelect: (id: string) => void
}) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 24, textAlign: 'left' }}>
            {options.map((opt) => {
                const isSelected = selected === opt.id
                const dotColor = toneToDotColor(opt.tone)
                const accent = isSelected ? dotColor : 'transparent'
                return (
                    <button
                        key={opt.id}
                        type="button"
                        onClick={() => onSelect(opt.id)}
                        aria-pressed={isSelected}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 14,
                            padding: '14px 18px',
                            borderRadius: 'var(--radius-pill)',
                            background: isSelected
                                ? `linear-gradient(180deg, ${dotColor}26 0%, ${dotColor}10 100%)`
                                : 'linear-gradient(180deg, rgba(255,250,240,0.07) 0%, rgba(255,250,240,0.02) 100%)',
                            border: `1px solid ${accent || 'rgba(245,240,232,0.16)'}`,
                            boxShadow: isSelected
                                ? `inset 0 1px 0 ${dotColor}40, 0 6px 18px ${dotColor}22`
                                : 'inset 0 1px 0 rgba(255,250,240,0.08)',
                            color: 'rgba(245,238,222,0.92)',
                            fontFamily: BODY,
                            fontSize: 14, fontWeight: 700,
                            letterSpacing: '0.01em',
                            cursor: 'pointer',
                            transition: 'background 180ms, border-color 180ms, box-shadow 180ms, transform 150ms',
                            textAlign: 'left',
                        }}
                    >
                        <span style={{
                            width: 10, height: 10,
                            borderRadius: '50%',
                            background: dotColor,
                            flexShrink: 0,
                            boxShadow: isSelected ? `0 0 0 4px ${dotColor}33` : 'none',
                        }} />
                        <span style={{ flex: 1 }}>{opt.label}</span>
                        {isSelected && (
                            <Check size={16} strokeWidth={2.8} color={dotColor} />
                        )}
                    </button>
                )
            })}
        </div>
    )
}

function toneToDotColor(tone: ButtonTone): string {
    switch (tone) {
        case 'positive': return '#22c55e'
        case 'neutral':  return '#ffc66b'
        case 'caution':  return '#f59e0b'
        case 'negative': return '#ef4444'
    }
}

// ── Chip grid (Q1, Q2, Q5) ─────────────────────────────────────────────────

function ChipGrid({
    options,
    selected,
    onToggle,
}: {
    options: ReadonlyArray<{ id: string; label: string }>
    selected: string[]
    onToggle: (id: string) => void
}) {
    return (
        <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'flex-start',
            gap: 12,
            marginTop: 24,
        }}>
            {options.map((opt) => {
                const active = selected.includes(opt.id)
                return (
                    <button
                        key={opt.id}
                        type="button"
                        onClick={() => onToggle(opt.id)}
                        aria-pressed={active}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '11px 18px',
                            borderRadius: 'var(--radius-pill)',
                            border: `1px solid ${active ? 'rgba(245,127,32,0.62)' : 'rgba(245,240,232,0.18)'}`,
                            // Vertical gradient simulates light from above; the
                            // inset top highlight is the "rim" of that light
                            // catching the upper edge of the pill — same trick
                            // physical buttons use to read as 3D.
                            background: active
                                ? 'linear-gradient(180deg, rgba(245,127,32,0.30) 0%, rgba(245,127,32,0.12) 100%)'
                                : 'linear-gradient(180deg, rgba(255,250,240,0.08) 0%, rgba(255,250,240,0.025) 100%)',
                            boxShadow: active
                                ? 'inset 0 1px 0 rgba(255,200,107,0.32), 0 6px 18px rgba(245,127,32,0.18)'
                                : 'inset 0 1px 0 rgba(255,250,240,0.10)',
                            color: active ? '#ffc66b' : 'rgba(245,238,222,0.88)',
                            fontFamily: BODY,
                            fontSize: 14, fontWeight: 600,
                            letterSpacing: '0.005em',
                            lineHeight: 1.2,
                            cursor: 'pointer',
                            transition: 'background 150ms, color 150ms, border-color 150ms, box-shadow 150ms, transform 120ms',
                            transform: active ? 'translateY(-1px)' : 'translateY(0)',
                        }}
                    >
                        {opt.label}
                    </button>
                )
            })}
        </div>
    )
}

function OtherTextRow({
    value,
    setValue,
    placeholder,
}: {
    value: string
    setValue: (v: string) => void
    placeholder: string
}) {
    return (
        <div style={{ marginTop: 20 }}>
            <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={placeholder}
                style={{
                    width: '100%',
                    padding: '13px 16px',
                    borderRadius: 'var(--radius-md)',
                    backgroundImage: 'linear-gradient(180deg, rgba(255,250,240,0.06) 0%, rgba(255,250,240,0.02) 100%)',
                    backgroundColor: 'transparent',
                    border: '1px solid rgba(245,240,232,0.14)',
                    boxShadow: 'inset 0 1px 0 rgba(255,250,240,0.06)',
                    color: 'rgba(245,238,222,0.95)',
                    fontFamily: BODY,
                    fontSize: 15,
                    lineHeight: 1.5,
                    outline: 'none',
                    transition: 'border-color 150ms, box-shadow 150ms',
                }}
                onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(245,127,32,0.55)'
                    e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255,200,107,0.18), 0 0 0 3px rgba(245,127,32,0.10)'
                }}
                onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(245,240,232,0.14)'
                    e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255,250,240,0.06)'
                }}
            />
        </div>
    )
}

function BigTextarea({
    value,
    setValue,
    placeholder,
}: {
    value: string
    setValue: (v: string) => void
    placeholder: string
}) {
    return (
        <div style={{ marginTop: 24 }}>
            <textarea
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={placeholder}
                rows={5}
                style={{
                    width: '100%',
                    padding: '16px 18px',
                    borderRadius: 'var(--radius-md)',
                    backgroundImage: 'linear-gradient(180deg, rgba(255,250,240,0.06) 0%, rgba(255,250,240,0.02) 100%)',
                    backgroundColor: 'transparent',
                    border: '1px solid rgba(245,240,232,0.14)',
                    boxShadow: 'inset 0 1px 0 rgba(255,250,240,0.06)',
                    color: 'rgba(245,238,222,0.95)',
                    fontFamily: BODY,
                    fontSize: 16,
                    lineHeight: 1.6,
                    resize: 'vertical',
                    outline: 'none',
                    transition: 'border-color 150ms, box-shadow 150ms',
                }}
                onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(245,127,32,0.55)'
                    e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255,200,107,0.18), 0 0 0 3px rgba(245,127,32,0.10)'
                }}
                onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(245,240,232,0.14)'
                    e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255,250,240,0.06)'
                }}
            />
            <div style={{
                marginTop: 10, fontSize: 11,
                color: TIER_POP_TEXT.faint,
                letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 600,
            }}>
                Optional · skip if nothing comes to mind
            </div>
        </div>
    )
}

// ── Shared layout + typography ──────────────────────────────────────────────
//
// Web-typography principles applied throughout:
//   - Body 16px minimum; line-height 1.55–1.65 for prose
//   - Headings tight (1.15) with negative letter-spacing
//   - Measure capped at ~60ch so lines don't sprawl
//   - Left-aligned by default — saccades read left→right, centred prose
//     forces the eye to re-find the ragged left edge on every line
//   - Modular scale: H1 → Sub → label → caption with clear size+weight jumps

const SCREEN: React.CSSProperties = {
    maxWidth: 640,
    width: '100%',
    textAlign: 'left',
}

const SCREEN_NARROW: React.CSSProperties = {
    maxWidth: 560,
    width: '100%',
    textAlign: 'left',
}

const SCREEN_WIDE: React.CSSProperties = {
    maxWidth: 720,
    width: '100%',
    textAlign: 'left',
}

const SCREEN_REVEAL: React.CSSProperties = {
    maxWidth: 720,
    width: '100%',
    textAlign: 'left',
}

function H1({ children }: { children: React.ReactNode }) {
    // Top-lit gradient text. The eye reads the warm cream highlight at the
    // top of each letter as a light source — adds dimension that flat cream
    // can't deliver against a deep navy backdrop. Drop-shadow softens the
    // hard edge between text and background without darkening the letters.
    return (
        <h1 style={{
            margin: '14px 0 12px',
            fontFamily: BODY,
            fontSize: 'clamp(28px, 4vw, 40px)',
            fontWeight: 800,
            lineHeight: 1.15,
            letterSpacing: '-0.02em',
            maxWidth: '22ch',
            backgroundImage: 'linear-gradient(180deg, #fdf8ef 0%, #f0e6cf 55%, #d6c8a8 100%)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            color: 'transparent',
            filter: 'drop-shadow(0 1px 0 rgba(0,0,0,0.25))',
        }}>
            {children}
        </h1>
    )
}

function Accent({ children }: { children: React.ReactNode }) {
    // Inline emphasis used inside H1. Brighter cream than the gradient fill so
    // the word steps forward, with a brand-orange underline as the anchor.
    // Setting backgroundImage: none + WebkitTextFillColor opts the span out of
    // the parent H1's background-clip: text so the accent word reads as solid
    // colour, not a transparent letterform.
    return (
        <span style={{
            color: '#fbe5b5',
            WebkitTextFillColor: '#fbe5b5',
            backgroundImage: 'none',
            textDecorationLine: 'underline',
            textDecorationColor: OG,
            textDecorationThickness: '0.08em',
            textUnderlineOffset: '0.18em',
            textDecorationSkipInk: 'none',
        }}>
            {children}
        </span>
    )
}

function H2({ children }: { children: React.ReactNode }) {
    return (
        <h2 style={{
            margin: '10px 0 4px',
            fontFamily: BODY,
            fontSize: 'clamp(20px, 2.2vw, 24px)',
            fontWeight: 700,
            lineHeight: 1.25,
            letterSpacing: '-0.01em',
            maxWidth: '28ch',
            backgroundImage: 'linear-gradient(180deg, #fdf8ef 0%, #ede2c8 100%)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            color: 'transparent',
        }}>
            {children}
        </h2>
    )
}

function Sub({ children }: { children: React.ReactNode }) {
    return (
        <p style={{
            margin: '0 0 4px',
            fontFamily: BODY,
            fontSize: 17,
            fontWeight: 400,
            lineHeight: 1.6,
            color: 'rgba(245,238,222,0.72)',
            maxWidth: '52ch',
        }}>
            {children}
        </p>
    )
}

function ContinueButton({
    enabled,
    onClick,
    label = 'Continue',
    muted = false,
}: {
    enabled: boolean
    onClick: () => void
    label?: string
    muted?: boolean
}) {
    const isPrimary = enabled && !muted
    return (
        <div style={{ marginTop: 36 }}>
            <button
                disabled={!enabled}
                onClick={onClick}
                style={{
                    display: 'inline-flex',
                    alignItems: 'center', justifyContent: 'center',
                    gap: 10,
                    padding: '14px 28px',
                    borderRadius: 'var(--radius-pill)',
                    border: isPrimary ? 0 : '1px solid rgba(245,240,232,0.18)',
                    background: isPrimary ? OG : muted ? 'rgba(245,240,232,0.06)' : 'rgba(245,240,232,0.08)',
                    color: isPrimary ? '#fff' : muted ? TIER_POP_TEXT.muted : TIER_POP_TEXT.faint,
                    fontFamily: BODY,
                    fontSize: 13, fontWeight: 700,
                    letterSpacing: '0.06em', textTransform: 'uppercase',
                    cursor: enabled ? 'pointer' : 'not-allowed',
                    boxShadow: isPrimary ? '0 8px 28px rgba(245,127,32,0.50)' : 'none',
                    transition: 'background 200ms, color 200ms, box-shadow 200ms, transform 150ms',
                }}
            >
                {label}
                <span aria-hidden style={{ fontSize: 14, lineHeight: 1 }}>→</span>
            </button>
        </div>
    )
}
